// Tipi condivisi per la gestione ordini.
//
// public.orders.status enum:
//   - 'creating'        → saga in corso (transitorio, max 2 min)
//   - 'confirmed'       → ordine inserito, in attesa di pianificazione consegna
//   - 'in_consegna'     → admin ha schedulato + corriere in consegna
//   - 'consegnato'      → consegna completata
//   - 'failed_no_stock' → debug
//   - 'failed_confirm'  → debug
//   - 'failed_internal' → debug
//
// L'admin gestisce le transizioni confirmed → in_consegna → consegnato
// e popola delivery_date / courier / tracking_code / delivered_at.

export type OrderStatus =
  | "creating"
  | "confirmed"
  | "in_consegna"
  | "consegnato"
  | "failed_no_stock"
  | "failed_confirm"
  | "failed_internal";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  creating:        "In creazione",
  confirmed:       "Confermato",
  in_consegna:     "In consegna",
  consegnato:      "Consegnato",
  failed_no_stock: "Fallito (stock)",
  failed_confirm:  "Fallito (conferma)",
  failed_internal: "Fallito (interno)",
};

/// Stati visibili al cliente (gli altri sono debug-only).
export const CUSTOMER_VISIBLE_STATUSES: OrderStatus[] = [
  "confirmed",
  "in_consegna",
  "consegnato",
];

/// Snapshot del cliente al momento dell'ordine.
export interface OrderCustomerSnapshot {
  user_id: string;
  email: string | null;
  restaurant_name: string | null;
  full_name: string | null;
  address: string | null;
  vat: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
}

export interface AdminOrderLine {
  wineId: string;
  qty: number;
  unitPrice: number;
  wineName: string;
  wineProducer: string | null;
  wineVintage: number | null;
}

export interface AdminOrder {
  id: string;
  userId: string;
  // Snapshot ristorante (resta stabile anche se profilo cambia)
  customer: OrderCustomerSnapshot;
  // Email reale dall'auth.users (non snapshot — sempre aggiornata)
  userEmail: string | null;

  status: OrderStatus;
  total: number;
  itemsCount: number;

  startyOrderId: number | null;
  startyDocumentNumber: string | null;
  clientIdempotencyKey: string;

  deliveryAddress: string | null;
  deliveryDate: string | null;          // YYYY-MM-DD (DB date column)
  deliveredAt: string | null;            // ISO timestamp
  courier: string | null;
  trackingCode: string | null;

  notes: string | null;                  // note del cliente
  adminNotes: string | null;             // note interne staff

  notificationEmailTo: string | null;
  notificationEmailSentAt: string | null;
  notificationEmailError: string | null;

  createdAt: string;
  confirmedAt: string | null;
  updatedAt: string;

  lines: AdminOrderLine[];
}
