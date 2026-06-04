// Tipi condivisi per la gestione ristoranti.

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
