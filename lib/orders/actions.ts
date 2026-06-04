"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "./types";

const ORDERS_PATH = "/ordini";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

interface DeliveryUpdate {
  status?: OrderStatus;
  deliveryDate?: string | null;     // YYYY-MM-DD or null
  courier?: string | null;
  trackingCode?: string | null;
  adminNotes?: string | null;
  /// Se true, set delivered_at = now() (ignorato se assente).
  markDeliveredNow?: boolean;
}

/// Aggiorna lo stato di consegna di un ordine. Tutti i campi sono opzionali:
/// vengono toccati solo quelli passati (undefined = non toccare).
export async function updateOrderDelivery(
  orderId: string,
  data: DeliveryUpdate,
): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Order id mancante" };

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};

  if (data.status        !== undefined) update.status         = data.status;
  if (data.deliveryDate  !== undefined) update.delivery_date  = data.deliveryDate;
  if (data.courier       !== undefined) update.courier        = (data.courier ?? "").trim() || null;
  if (data.trackingCode  !== undefined) update.tracking_code  = (data.trackingCode ?? "").trim() || null;
  if (data.adminNotes    !== undefined) update.admin_notes    = (data.adminNotes ?? "").trim() || null;

  if (data.markDeliveredNow) {
    update.delivered_at = new Date().toISOString();
    if (update.status === undefined) update.status = "consegnato";
  }
  if (data.status === "consegnato" && update.delivered_at === undefined) {
    update.delivered_at = new Date().toISOString();
  }
  if (data.status && data.status !== "consegnato" && data.status !== "in_consegna") {
    // Ritorno indietro a 'confirmed' → resetta delivered_at
    update.delivered_at = null;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nessuna modifica da salvare" };
  }

  const { error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(ORDERS_PATH);
  return { ok: true, message: "Ordine aggiornato" };
}

/// Cambia solo lo status (shortcut per i bottoni della tabella).
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<ActionResult> {
  return updateOrderDelivery(orderId, { status });
}

/// Cancella un ordine come admin (override del check 12h del cancel_order RPC).
/// Per ora bypass: in produzione probabilmente vorremo loggare il motivo.
export async function adminCancelOrder(orderId: string): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Order id mancante" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(ORDERS_PATH);
  return { ok: true, message: "Ordine cancellato" };
}
