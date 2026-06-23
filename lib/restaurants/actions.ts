"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliverySlot, DeliverySlotTimes } from "./types";

const PATH = "/ristoranti";

export type ActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string };

export interface RestaurantInput {
  name: string;
  ragioneSociale?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingDistrict?: string | null;
  vat?: string | null;
  email?: string | null;
  phone?: string | null;
  startyBpId?: number | null;
  memberSinceYear?: number | null;
  notes?: string | null;
  freeShipping: boolean;
  closingDays: number[];
  deliverySlots: DeliverySlot[];
  deliverySlotTimes: DeliverySlotTimes;
  reminderEnabled: boolean;
  reminderWeekdays: number[];
  reminderTime?: string | null;
  shippingFeeNet?: number | null;
  freeShippingThresholdGross?: number | null;
}

function toRow(data: RestaurantInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  row.name              = data.name.trim();
  row.ragione_sociale   = (data.ragioneSociale     ?? "").trim() || null;
  row.address           = (data.address           ?? "").trim() || null;
  row.city              = (data.city              ?? "").trim() || null;
  row.district          = (data.district          ?? "").trim() || null;
  row.billing_address   = (data.billingAddress     ?? "").trim() || null;
  row.billing_city      = (data.billingCity        ?? "").trim() || null;
  row.billing_district  = (data.billingDistrict    ?? "").trim() || null;
  row.vat               = (data.vat               ?? "").trim() || null;
  row.email             = (data.email             ?? "").trim() || null;
  row.phone             = (data.phone             ?? "").trim() || null;
  row.starty_bp_id      = data.startyBpId      ?? null;
  row.member_since_year = data.memberSinceYear ?? null;
  row.notes             = (data.notes             ?? "").trim() || null;
  row.free_shipping     = data.freeShipping;
  // Operativita': normalizziamo per rispettare i CHECK del DB.
  row.closing_days      = (data.closingDays ?? [])
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  row.delivery_slots    = (data.deliverySlots ?? [])
    .filter((s) => s === "morning" || s === "afternoon");
  // Orari fascia: salvati solo per le fasce attive e solo se valorizzati.
  const activeSlots = new Set(row.delivery_slots as DeliverySlot[]);
  const slotTimes: DeliverySlotTimes = {};
  for (const slot of ["morning", "afternoon"] as DeliverySlot[]) {
    const t = (data.deliverySlotTimes ?? {})[slot];
    if (activeSlots.has(slot) && t && (t.from || t.to)) {
      slotTimes[slot] = { from: t.from ?? "", to: t.to ?? "" };
    }
  }
  row.delivery_slot_times = slotTimes;
  row.reminder_enabled  = !!data.reminderEnabled;
  row.reminder_weekdays = (data.reminderWeekdays ?? [])
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  row.reminder_time     = data.reminderTime && /^\d{2}:\d{2}$/.test(data.reminderTime)
    ? data.reminderTime
    : null;
  // Override spedizione: NULL = eredita dal globale. Valori negativi scartati.
  const fee = data.shippingFeeNet;
  row.shipping_fee_net = (typeof fee === "number" && Number.isFinite(fee) && fee >= 0) ? fee : null;
  const thr = data.freeShippingThresholdGross;
  row.free_shipping_threshold_gross =
    (typeof thr === "number" && Number.isFinite(thr) && thr >= 0) ? thr : null;
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
