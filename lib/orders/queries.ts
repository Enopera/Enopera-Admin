// Query lato server per la pagina Ordini.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminOrder,
  AdminOrderLine,
  OrderCustomerSnapshot,
  OrderStatus,
} from "./types";

/// Ritorna tutti gli ordini con righe + email utente JOIN-ata da auth.users.
/// Ordinati dal più recente. Esclude di default gli stati 'creating' e
/// 'failed_*' (sono transitori/debug — admin può comunque filtrarli a UI).
export async function listOrders(): Promise<AdminOrder[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      total,
      items_count,
      starty_order_id,
      starty_document_number,
      client_idempotency_key,
      delivery_address,
      delivery_date,
      delivered_at,
      courier,
      tracking_code,
      notes,
      admin_notes,
      customer_snapshot,
      notification_email_to,
      notification_email_sent_at,
      notification_email_error,
      created_at,
      confirmed_at,
      updated_at,
      order_lines (
        wine_id,
        qty,
        unit_price,
        wine_name_snapshot,
        wine_producer_snapshot,
        wine_vintage_snapshot
      )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Recuperiamo le email correnti da auth.users in un colpo solo
  // (snapshot.email può essere stale dopo un cambio email).
  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const emailByUserId = new Map<string, string | null>();
  // listUsers è paginato a 50 di default; richiediamo 200 per coprire la
  // base utenti attuale. Quando supereremo, qui andrà una query più mirata
  // (es. .getUserById in batch).
  try {
    const { data: authData, error: authErr } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (!authErr) {
      for (const u of authData.users) {
        if (userIds.includes(u.id)) emailByUserId.set(u.id, u.email ?? null);
      }
    }
  } catch {
    // Non bloccante: se fallisce ricadiamo sullo snapshot.
  }

  return rows.map((r): AdminOrder => {
    const customer = (r.customer_snapshot ?? {}) as Record<string, unknown>;
    const snapshot: OrderCustomerSnapshot = {
      user_id: (customer.user_id as string) ?? (r.user_id as string),
      email: (customer.email as string) ?? null,
      restaurant_name: (customer.restaurant_name as string) ?? null,
      full_name:        (customer.full_name        as string) ?? null,
      address:          (customer.address          as string) ?? null,
      vat:              (customer.vat              as string) ?? null,
      phone:            (customer.phone            as string) ?? null,
      city:             (customer.city             as string) ?? null,
      district:         (customer.district         as string) ?? null,
    };

    const lines: AdminOrderLine[] = ((r.order_lines ?? []) as Array<Record<string, unknown>>)
      .map((l) => ({
        wineId:       l.wine_id                as string,
        qty:          Number(l.qty),
        unitPrice:    Number(l.unit_price),
        wineName:     (l.wine_name_snapshot      as string) ?? "—",
        wineProducer: (l.wine_producer_snapshot  as string) ?? null,
        wineVintage:  (l.wine_vintage_snapshot   as number) ?? null,
      }));

    return {
      id: r.id as string,
      userId: r.user_id as string,
      customer: snapshot,
      userEmail: emailByUserId.get(r.user_id as string) ?? snapshot.email,
      status: r.status as OrderStatus,
      total: Number(r.total),
      itemsCount: Number(r.items_count),
      startyOrderId: (r.starty_order_id as number) ?? null,
      startyDocumentNumber: (r.starty_document_number as string) ?? null,
      clientIdempotencyKey: r.client_idempotency_key as string,
      deliveryAddress: (r.delivery_address as string) ?? null,
      deliveryDate:    (r.delivery_date    as string) ?? null,
      deliveredAt:     (r.delivered_at     as string) ?? null,
      courier:         (r.courier          as string) ?? null,
      trackingCode:    (r.tracking_code    as string) ?? null,
      notes:           (r.notes            as string) ?? null,
      adminNotes:      (r.admin_notes      as string) ?? null,
      notificationEmailTo:     (r.notification_email_to      as string) ?? null,
      notificationEmailSentAt: (r.notification_email_sent_at as string) ?? null,
      notificationEmailError:  (r.notification_email_error   as string) ?? null,
      createdAt: r.created_at as string,
      confirmedAt: (r.confirmed_at as string) ?? null,
      updatedAt: r.updated_at as string,
      lines,
    };
  });
}
