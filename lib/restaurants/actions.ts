"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/ristoranti";

export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string };

export interface RestaurantInput {
  name: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  vat?: string | null;
  email?: string | null;
  phone?: string | null;
  startyBpId?: number | null;
  memberSinceYear?: number | null;
  notes?: string | null;
  freeShipping: boolean;
}

function toRow(data: RestaurantInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  row.name              = data.name.trim();
  row.address           = (data.address           ?? "").trim() || null;
  row.city              = (data.city              ?? "").trim() || null;
  row.district          = (data.district          ?? "").trim() || null;
  row.vat               = (data.vat               ?? "").trim() || null;
  row.email             = (data.email             ?? "").trim() || null;
  row.phone             = (data.phone             ?? "").trim() || null;
  row.starty_bp_id      = data.startyBpId      ?? null;
  row.member_since_year = data.memberSinceYear ?? null;
  row.notes             = (data.notes             ?? "").trim() || null;
  row.free_shipping     = data.freeShipping;
  return row;
}

export async function createRestaurant(data: RestaurantInput): Promise<ActionResult> {
  if (!data.name?.trim()) return { ok: false, error: "Nome ristorante richiesto" };
  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("restaurants")
    .insert(toRow(data))
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true, message: "Ristorante creato", id: inserted?.id as string };
}

export async function updateRestaurant(
  id: string,
  data: RestaurantInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id ristorante mancante" };
  if (!data.name?.trim()) return { ok: false, error: "Nome ristorante richiesto" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("restaurants")
    .update(toRow(data))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // I trigger sync_profiles_from_restaurant aggiornano i profili linkati.
  revalidatePath(PATH);
  revalidatePath("/utenti");
  return { ok: true, message: "Ristorante aggiornato" };
}

/// Elimina un ristorante. Per via di `ON DELETE SET NULL` sulla FK i profili
/// linkati restano (con restaurant_id = NULL), ma il loro restaurant_name etc.
/// vengono azzerati dal trigger `profiles_sync_on_restaurant_link`.
export async function deleteRestaurant(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Id ristorante mancante" };
  const supabase = createAdminClient();
  const { error } = await supabase.from("restaurants").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath("/utenti");
  return { ok: true, message: "Ristorante eliminato" };
}

/// Linka un utente a un ristorante (o scollega se restaurantId = null).
/// Il trigger BEFORE UPDATE sui profili copia i campi del ristorante nel
/// profilo (o li azzera se scollegato).
export async function setUserRestaurant(
  userId: string,
  restaurantId: string | null,
): Promise<ActionResult> {
  if (!userId) return { ok: false, error: "Id utente mancante" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ restaurant_id: restaurantId })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  revalidatePath("/utenti");
  return {
    ok: true,
    message: restaurantId ? "Utente collegato al ristorante" : "Utente scollegato",
  };
}
