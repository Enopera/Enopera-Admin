// Tipi per la gestione admin della cantina cliente.

export type WineChannel = "distribuzione" | "contoVendita";

/// Una riga di customer_inventory arricchita con i dati del vino dal catalogo.
export interface AdminCustomerInventoryRow {
  id: string;
  userId: string;
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

/// Sottoinsieme di AdminUser sufficiente per il selettore cliente.
export interface CustomerOption {
  id: string;
  email: string;
  fullName: string | null;
  restaurantName: string | null;
  city: string | null;
  district: string | null;
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
