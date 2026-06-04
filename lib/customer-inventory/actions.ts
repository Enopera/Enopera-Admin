"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCustomerInventory } from "./queries";
import type { AdminCustomerInventoryRow, WineChannel } from "./types";

const CANTINE_PATH = "/cantine";
const RISTORANTI_PATH = "/ristoranti";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/// Carica inventario per un ristorante. Risolve il "primary user" (primo
/// utente collegato) e ritorna le sue righe di customer_inventory + l'id
/// così le mutation successive possano usarlo per addInventoryRow.
///
/// Ritorna null se il ristorante non ha utenti collegati: in quel caso
/// la modal mostrerà un messaggio "collega prima un utente".
export async function loadRestaurantInventory(restaurantId: string): Promise<{
  primaryUserId: string;
  primaryUserEmail: string | null;
  totalUsers: number;
  inventory: AdminCustomerInventoryRow[];
} | null> {
  if (!restaurantId) return null;
  const supabase = createAdminClient();

  // Prendo i profili linkati al ristorante (può essere uno o più).
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("restaurant_id", restaurantId);
  if (pErr) throw pErr;
  if (!profiles || profiles.length === 0) return null;

  // Per ora: primo utente. Se ci sono multi-utenti l'admin ne vede solo uno
  // ma può sapere che ce ne sono N (totalUsers).
  const primaryUserId = profiles[0].id as string;

  // Email per UI feedback.
  const { data: authUsers } = await supabase.auth.admin.listUsers({
    page: 1, perPage: 200,
  });
  const primaryUserEmail = authUsers?.users.find((u) => u.id === primaryUserId)?.email ?? null;

  const inventory = await listCustomerInventory(primaryUserId);

  return {
    primaryUserId,
    primaryUserEmail,
    totalUsers: profiles.length,
    inventory,
  };
}

/// Sposta una riga di customer_inventory da un canale all'altro
/// (es. distribuzione ↔ contoVendita). La qty resta invariata.
export async function setInventoryChannel(
  id: string,
  channel: WineChannel,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id mancante" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_inventory")
    .update({ channel })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(CANTINE_PATH);
  revalidatePath(RISTORANTI_PATH);
  return {
    ok: true,
    message: channel === "distribuzione"
      ? "Spostato in distribuzione"
      : "Spostato in conto vendita",
  };
}

/// Aggiorna la quantità di una riga (validato lato DB con CHECK >= 0).
export async function setInventoryQty(
  id: string,
  qtyInStock: number,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id mancante" };
  if (!Number.isFinite(qtyInStock) || qtyInStock < 0) {
    return { ok: false, error: "Quantità non valida" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_inventory")
    .update({ qty_in_stock: Math.round(qtyInStock) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(CANTINE_PATH);
  revalidatePath(RISTORANTI_PATH);
  return { ok: true, message: "Quantità aggiornata" };
}

/// Crea una nuova riga customer_inventory per un cliente.
/// Se esiste già (UNIQUE user_id+wine_id) ritorna errore esplicito.
export async function addInventoryRow(
  userId: string,
  wineId: string,
  channel: WineChannel,
  qtyInStock = 0,
): Promise<ActionResult> {
  if (!userId || !wineId) {
    return { ok: false, error: "Cliente o vino mancante" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_inventory")
    .insert({
      user_id: userId,
      wine_id: wineId,
      channel,
      qty_in_stock: Math.max(0, Math.round(qtyInStock)),
    });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Questo vino è già in cantina per il cliente" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath(CANTINE_PATH);
  revalidatePath(RISTORANTI_PATH);
  return { ok: true, message: "Vino aggiunto alla cantina" };
}

/// Rimuove una riga della cantina cliente. Da usare con cautela:
/// la chiamata distrugge la storicità (last_received_at, last_consumed_at).
export async function removeInventoryRow(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id mancante" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_inventory")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(CANTINE_PATH);
  revalidatePath(RISTORANTI_PATH);
  return { ok: true, message: "Rimosso dalla cantina" };
}
