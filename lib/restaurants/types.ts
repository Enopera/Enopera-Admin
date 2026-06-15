// Tipi condivisi per la gestione ristoranti.

/// Fasce di consegna disponibili per un ristorante.
export type DeliverySlot = "morning" | "afternoon";

/// Orario di una fascia di consegna ("HH:MM").
export interface DeliverySlotTime {
  from: string;
  to: string;
}

/// Orari per fascia (solo per le fasce attive in deliverySlots).
export type DeliverySlotTimes = Partial<Record<DeliverySlot, DeliverySlotTime>>;

export interface AdminRestaurant {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  vat: string | null;
  email: string | null;
  phone: string | null;
  startyBpId: number | null;
  memberSinceYear: number | null;
  notes: string | null;
  freeShipping: boolean;
  /// Giorni di chiusura settimanale (ISO 1=Lun .. 7=Dom). Vuoto = nessuno.
  closingDays: number[];
  /// Fasce di consegna offerte. Vuoto = non specificato.
  deliverySlots: DeliverySlot[];
  /// Orari per fascia di consegna (es. mattina 10:00-12:00).
  deliverySlotTimes: DeliverySlotTimes;
  /// Override costo spedizione netto per il ristorante. NULL = usa il globale.
  shippingFeeNet: number | null;
  /// Override soglia gratis (lordo vini). NULL = usa il globale.
  freeShippingThresholdGross: number | null;
  /// Listino custom assegnato (null = usa il default).
  priceListId: string | null;
  /// Nome del listino assegnato — joinato per UI. Null se priceListId è null.
  priceListName: string | null;
  createdAt: string;
  updatedAt: string;

  /// Utenti collegati al ristorante (anteprima compatta — id+email+nome).
  /// Popolata da `listRestaurants` con una seconda query.
  users: RestaurantUserPreview[];
}

export interface RestaurantUserPreview {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "user";
  status: "attivo" | "sospeso" | "invitato";
}

/// Sottoinsieme di AdminUser sufficiente per il dropdown "Aggiungi utente"
/// nel drawer ristorante (mostriamo solo gli utenti senza ristorante attuale).
export interface UnlinkedUserOption {
  id: string;
  email: string;
  fullName: string | null;
}
