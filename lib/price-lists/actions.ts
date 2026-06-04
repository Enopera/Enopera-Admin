"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/listini";

export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string };

/// Triggera in sequenza le due Edge Function di sync con Starty:
///   1. sync-starty-pricelists (~1.5s) — rinfresca l'elenco listini di vendita
///   2. sync-starty-catalog    (~50s)  — rinfresca vini + prezzi per ogni
///      listino con starty_id valorizzato
///
/// L'ordine è importante: la sync del catalogo popola wine_prices solo per
/// i listini Supabase che hanno starty_id. Se prima non importo i listini
/// nuovi, i loro prezzi non vengono salvati.
///
/// Tempo totale: ~52 secondi. La pagina deve avere maxDuration >= 60s.
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

export async function syncAllFromStarty(): Promise<ActionResult> {
  // 1. Listini
  const listini = await callEdgeFn("sync-starty-pricelists");
  if (!listini.ok) return { ok: false, error: `Sync listini: ${listini.error}` };

  // 2. Catalogo (vini + prezzi)
  const catalog = await callEdgeFn("sync-starty-catalog");
  if (!catalog.ok) return { ok: false, error: `Sync catalogo: ${catalog.error}` };

  revalidatePath(PATH);
  revalidatePath("/ristoranti");

  const newLists = listini.body.new_imported ?? 0;
  const wines = catalog.body.wines_synced ?? 0;
  const prices = catalog.body.wine_prices_upserted ?? 0;
  return {
    ok: true,
    message: `Sincronizzati ${newLists} nuovi listini, ${wines} vini, ${prices} prezzi`,
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
