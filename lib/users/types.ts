// Tipi condivisi per la gestione utenti.
export type AccountStatus = "attivo" | "sospeso" | "invitato";
export type AccountRole   = "admin"  | "user";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: AccountRole;
  status: AccountStatus;
  notes: string | null;
  // Dati ristorante (per ruolo 'user' B2B)
  restaurantName: string | null;
  address: string | null;
  vat: string | null;
  startyBpId: number | null;
  memberSinceYear: number | null;
  city: string | null;
  district: string | null;
  createdAt: string;          // ISO
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  // Link al ristorante: FK profiles.restaurant_id. Quando settato, i campi
  // di anagrafica ristorante (restaurantName, address, city, district, vat,
  // startyBpId, memberSinceYear, phone) sono in sola lettura — vengono
  // sincronizzati dal trigger DB a partire dalla riga in `restaurants`.
  restaurantId: string | null;
}
