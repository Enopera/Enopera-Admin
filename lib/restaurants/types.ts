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
  /// Denominazione legale. Usata come Riferimento ordine (poReference) su Starty.
  ragioneSociale: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  /// Indirizzo di fatturazione (se diverso dalla spedizione). NULL = usa address.
  billingAddress: string | null;
  billingCity: string | null;
  billingDistrict: string | null;
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
  /// Promemoria WhatsApp: master on/off.
  reminderEnabled: boolean;
  /// Giorni del promemoria (ISO 1=Lun..7=Dom). Vuoto = nessuno.
  reminderWeekdays: number[];
  /// Ora del promemoria, ora locale Europe/Rome ("HH:MM"). Null = non impostata.
  reminderTime: string | null;
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
  /// Opt-in promemoria WhatsApp (default false).
  whatsappRemindersEnabled: boolean;
  /// Timestamp consenso (ISO) o null.
  whatsappConsentAt: string | null;
}

/// Sottoinsieme di AdminUser sufficiente per il dropdown "Aggiungi utente"
/// nel drawer ristorante (mostriamo solo gli utenti senza ristorante attuale).
export interface UnlinkedUserOption {
  id: string;
  email: string;
  fullName: string | null;
}
