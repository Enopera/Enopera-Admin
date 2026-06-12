// Tipi per la gestione admin della cantina cliente.

export type WineChannel = "distribuzione" | "contoVendita";

/// Una riga di customer_inventory arricchita con i dati del vino dal catalogo.
export interface AdminCustomerInventoryRow {
  id: string;
  /// Solo provenienza ("chi ha aggiunto"). Null se aggiunta da admin o se
  /// l'utente e' stato eliminato. La cantina e' per ristorante.
  userId: string | null;
  wineId: string;
  wineLegacyId: string | null;
  channel: WineChannel;
  qtyInStock: number;

  wineName: string;
  wineProducer: string | null;
  wineType: string; // 'Rosso' | 'Bianco' | 'Bolle' | 'Rosato'
  wineVintage: number | null;
  winePrice: number;

  startyWarehouseId: number | null;
  lastReceivedAt: string | null;
  lastConsumedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/// Ristorante nel selettore della pagina /cantine (cantina condivisa).
export interface RestaurantInventoryOption {
  id: string;          // restaurant_id
  name: string;
  city: string | null;
  district: string | null;
  /// Quanti utenti sono collegati (info; la cantina esiste comunque).
  usersCount: number;
}

/// Vino del catalogo, esposto al dropdown "Aggiungi vino".
export interface CatalogWineOption {
  id: string;
  legacyId: string | null;
  name: string;
  producer: string | null;
  type: string;
  vintage: number | null;
  price: number;
}
