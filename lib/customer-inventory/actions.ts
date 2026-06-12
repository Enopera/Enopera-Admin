"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRestaurantInventory } from "./queries";
import type { AdminCustomerInventoryRow, WineChannel } from "./types";

const CANTINE_PATH = "/cantine";
const RISTORANTI_PATH = "/ristoranti";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/// Carica la cantina (condivisa) di un ristorante. La cantina segue il
/// ristorante: tutte le righe customer_inventory con quel restaurant_id,
/// indipendentemente da quanti utenti siano collegati.
export async function loadRestaurantInventory(
  restaurantId: string,
): Promise<AdminCustomerInventoryRow[]> {
  if (!restaurantId) return [];
  return listRestaurantInventory(restaurantId);
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

/// Crea una nuova riga nella cantina (condivisa) di un ristorante.
/// Se il vino è già presente (UNIQUE restaurant_id+wine_id) ritorna errore.
/// La riga viene creata con user_id NULL (aggiunta da admin, non da un utente).
export async function addInventoryRow(
  restaurantId: string,
  wineId: string,
  channel: WineChannel,
  qtyInStock = 0,
): Promise<ActionResult> {
  if (!restaurantId || !wineId) {
    return { ok: false, error: "Ristorante o vino mancante" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_inventory")
    .insert({
      restaurant_id: restaurantId,
      wine_id: wineId,
      channel,
      qty_in_stock: Math.max(0, Math.round(qtyInStock)),
    });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Questo vino è già in cantina per il ristorante" };
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
