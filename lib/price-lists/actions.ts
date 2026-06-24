"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/listini";

export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string };

async function callEdgeFn(slug: string): Promise<{ ok: true; body: any } | { ok: false; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Config Supabase mancante" };
  try {
    const r = await fetch(`${url}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
    const body = await r.json();
    if (!r.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${r.status}` };
    }
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/// Aggiorna i dati da Starty in due fasi, disaccoppiate per non sforare il
/// timeout della server action di Vercel (cap 60s):
///
///   1. sync-starty-pricelists (~2s) — eseguito in modo SINCRONO: rinfresca subito
///      l'elenco listini. DEVE precedere il catalogo, che mappa wine_prices solo
///      sui price_lists con starty_id (un listino nuovo non importato perderebbe i
///      suoi prezzi).
///   2. sync-starty-catalog (~50s, vini + prezzi) — ACCODATO via pg_net (RPC
///      queue_starty_catalog_sync) e NON atteso: gira su Supabase indipendentemente
///      da Vercel. Senza questo, la catena ~52s veniva uccisa a 60s e il browser
///      mostrava "An unexpected response was received from the server" (anche se i
///      dati venivano comunque scritti). Il catalogo, essendo rate-limited da Starty
///      (~817 chiamate pricing, non comprimibili), non puo' stare sotto i 60s.
///
/// La pagina riflette i prezzi nuovi al ricaricamento (~1 min dopo).
export async function syncAllFromStarty(): Promise<ActionResult> {
  // 1. Listini (sincrono, veloce)
  const listini = await callEdgeFn("sync-starty-pricelists");
  if (!listini.ok) return { ok: false, error: `Sync listini: ${listini.error}` };

  // 2. Catalogo (asincrono, fire-and-forget su Supabase)
  const supabase = createAdminClient();
  const { error: queueErr } = await supabase.rpc("queue_starty_catalog_sync");
  if (queueErr) return { ok: false, error: `Avvio sync catalogo: ${queueErr.message}` };

  revalidatePath(PATH);
  revalidatePath("/ristoranti");

  const newLists = listini.body.new_imported ?? 0;
  return {
    ok: true,
    message:
      `Listini aggiornati (${newLists} nuovi). Catalogo vini + prezzi in aggiornamento ` +
      `in background (~1 min): la pagina si ricarica da sola, oppure ricaricala tra poco.`,
  };
}

export interface PriceListInput {
  name: string;
  description?: string | null;
  startyId?: number | null;
  active?: boolean;
}

function toRow(data: PriceListInput): Record<string, unknown> {
  return {
    name: data.name.trim(),
    description: (data.description ?? "").trim() || null,
    starty_id: data.startyId ?? null,
    active: data.active ?? true,
  };
}

export async function updatePriceList(
  id: string,
  data: PriceListInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id listino mancante" };
  if (!data.name?.trim()) return { ok: false, error: "Nome listino richiesto" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("price_lists")
    .update(toRow(data))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath("/ristoranti");
  return { ok: true, message: "Listino aggiornato" };
}

/// Non si può eliminare un listino che è default O che ha ristoranti assegnati.
/// L'admin deve prima spostare il default su un altro listino e/o riassegnare
/// i ristoranti.
export async function deletePriceList(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id listino mancante" };
  const supabase = createAdminClient();

  const { data: row, error: readErr } = await supabase
    .from("price_lists").select("is_default").eq("id", id).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Listino non trovato" };
  if (row.is_default) {
    return { ok: false, error: "Impossibile eliminare il listino di default. Imposta prima un altro listino come default." };
  }

  const { count, error: cntErr } = await supabase
    .from("restaurants").select("id", { count: "exact", head: true }).eq("price_list_id", id);
  if (cntErr) return { ok: false, error: cntErr.message };
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Il listino ha ${count} ristorante${count === 1 ? "" : "i"} assegnato${count === 1 ? "" : "i"}. Riassegnali prima di eliminarlo.` };
  }

  const { error } = await supabase.from("price_lists").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath("/ristoranti");
  return { ok: true, message: "Listino eliminato" };
}

/// Imposta il listino indicato come default. L'unique index parziale
/// garantisce che ce ne sia uno solo: prima azzeriamo il flag su tutti,
/// poi lo settiamo sul nuovo.
export async function setDefaultPriceList(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id listino mancante" };
  const supabase = createAdminClient();
  const { error: clearErr } = await supabase
    .from("price_lists")
    .update({ is_default: false })
    .neq("id", id);
  if (clearErr) return { ok: false, error: clearErr.message };
  const { error: setErr } = await supabase
    .from("price_lists")
    .update({ is_default: true })
    .eq("id", id);
  if (setErr) return { ok: false, error: setErr.message };
  revalidatePath(PATH);
  revalidatePath("/ristoranti");
  return { ok: true, message: "Listino impostato come default" };
}

/// Assegna un listino a un ristorante (null = ripristina default).
export async function setRestaurantPriceList(
  restaurantId: string,
  priceListId: string | null,
): Promise<ActionResult> {
  if (!restaurantId) return { ok: false, error: "Id ristorante mancante" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ price_list_id: priceListId })
    .eq("id", restaurantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ristoranti");
  revalidatePath(PATH);
  return {
    ok: true,
    message: priceListId ? "Listino assegnato" : "Riportato al listino di default",
  };
}
