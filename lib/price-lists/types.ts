// Tipi condivisi per la gestione listini.

export interface AdminPriceList {
  id: string;
  name: string;
  description: string | null;
  startyId: number | null;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /// Numero di ristoranti che hanno questo listino assegnato (calcolato).
  restaurantsCount: number;
}

/// Sottoinsieme usato dai select (drawer ristorante, modal create).
export interface PriceListOption {
  id: string;
  name: string;
  isDefault: boolean;
}
