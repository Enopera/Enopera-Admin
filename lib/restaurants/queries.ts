import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminRestaurant,
  DeliverySlot,
  DeliverySlotTimes,
  RestaurantUserPreview,
  UnlinkedUserOption,
} from "./types";

/// Normalizza il jsonb delivery_slot_times in una struttura tipizzata.
function parseSlotTimes(raw: unknown): DeliverySlotTimes {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: DeliverySlotTimes = {};
  for (const slot of ["morning", "afternoon"] as DeliverySlot[]) {
    const v = src[slot];
    if (v && typeof v === "object") {
      const o = v as { from?: unknown; to?: unknown };
      out[slot] = { from: String(o.from ?? ""), to: String(o.to ?? "") };
    }
  }
  return out;
}

/// Lista ristoranti + utenti collegati (anteprima). Due query in parallelo
/// poi join client-side per evitare un'esplosione di righe.
export async function listRestaurants(): Promise<AdminRestaurant[]> {
  const supabase = createAdminClient();

  const [restRes, profRes, authRes, plRes] = await Promise.all([
    supabase.from("restaurants").select("*").order("name"),
    supabase.from("profiles").select(
      "id, full_name, role, status, restaurant_id, whatsapp_reminders_enabled, whatsapp_consent_at",
    ),
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabase.from("price_lists").select("id, name"),
  ]);
  if (restRes.error) throw restRes.error;
  if (profRes.error) throw profRes.error;
  if (authRes.error) throw authRes.error;
  if (plRes.error) throw plRes.error;

  const priceListNameById = new Map<string, string>();
  for (const pl of plRes.data ?? []) {
    priceListNameById.set(pl.id as string, pl.name as string);
  }

  const emailByUserId = new Map<string, string | null>();
  for (const u of authRes.data.users) {
    emailByUserId.set(u.id, u.email ?? null);
  }

  const usersByRestaurantId = new Map<string, RestaurantUserPreview[]>();
  for (const p of profRes.data ?? []) {
    const rid = p.restaurant_id as string | null;
    if (!rid) continue;
    const arr = usersByRestaurantId.get(rid) ?? [];
    arr.push({
      id: p.id as string,
      email: emailByUserId.get(p.id as string) ?? "—",
      fullName: (p.full_name as string) ?? null,
      role: (p.role as "admin" | "user") ?? "user",
      status: (p.status as "attivo" | "sospeso" | "invitato") ?? "attivo",
      whatsappRemindersEnabled: (p.whatsapp_reminders_enabled as boolean | null) ?? false,
      whatsappConsentAt: (p.whatsapp_consent_at as string | null) ?? null,
    });
    usersByRestaurantId.set(rid, arr);
  }

  return (restRes.data ?? []).map((r): AdminRestaurant => ({
    id: r.id as string,
    name: r.name as string,
    address:         (r.address           as string) ?? null,
    city:            (r.city              as string) ?? null,
    district:        (r.district          as string) ?? null,
    vat:             (r.vat               as string) ?? null,
    email:           (r.email             as string) ?? null,
    phone:           (r.phone             as string) ?? null,
    startyBpId:      (r.starty_bp_id      as number) ?? null,
    memberSinceYear: (r.member_since_year as number) ?? null,
    notes:           (r.notes             as string) ?? null,
    freeShipping:    (r.free_shipping     as boolean | null) ?? false,
    closingDays:     ((r.closing_days     as number[] | null) ?? [])
                       .map((d) => Number(d))
                       .filter((d) => d >= 1 && d <= 7),
    deliverySlots:   ((r.delivery_slots   as string[] | null) ?? [])
                       .filter((s): s is DeliverySlot => s === "morning" || s === "afternoon"),
    deliverySlotTimes: parseSlotTimes(r.delivery_slot_times),
    reminderEnabled:  (r.reminder_enabled as boolean | null) ?? false,
    reminderWeekdays: ((r.reminder_weekdays as number[] | null) ?? [])
                        .map((d) => Number(d)).filter((d) => d >= 1 && d <= 7),
    reminderTime:     r.reminder_time ? String(r.reminder_time).slice(0, 5) : null,
    shippingFeeNet:  r.shipping_fee_net == null ? null : Number(r.shipping_fee_net),
    freeShippingThresholdGross:
                     r.free_shipping_threshold_gross == null ? null : Number(r.free_shipping_threshold_gross),
    priceListId:     (r.price_list_id     as string) ?? null,
    priceListName:   r.price_list_id ? (priceListNameById.get(r.price_list_id as string) ?? null) : null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    users: usersByRestaurantId.get(r.id as string) ?? [],
  }));
}

/// Utenti (role='user') NON ancora linkati ad alcun ristorante.
/// Usato per popolare il dropdown "Aggiungi utente" nel drawer.
export async function listUnlinkedUsers(): Promise<UnlinkedUserOption[]> {
  const supabase = createAdminClient();
  const [profRes, authRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "user")
      .is("restaurant_id", null),
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);
  if (profRes.error) throw profRes.error;
  if (authRes.error) throw authRes.error;

  const emailById = new Map<string, string | null>();
  for (const u of authRes.data.users) emailById.set(u.id, u.email ?? null);

  return (profRes.data ?? []).map((p) => ({
    id: p.id as string,
    email: emailById.get(p.id as string) ?? "—",
    fullName: (p.full_name as string) ?? null,
  }));
}
