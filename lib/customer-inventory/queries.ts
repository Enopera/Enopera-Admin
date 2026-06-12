import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  RestaurantInventoryOption,
  WineChannel,
} from "./types";

/// Lista dei ristoranti per il selettore della pagina /cantine. La cantina e'
/// condivisa per ristorante, quindi il selettore sceglie un ristorante (non un
/// singolo utente). Include il conteggio utenti collegati (solo info).
export async function listRestaurantsForInventory(): Promise<RestaurantInventoryOption[]> {
  const supabase = createAdminClient();

  const [restRes, profRes] = await Promise.all([
    supabase.from("restaurants").select("id, name, city, district").order("name"),
    supabase.from("profiles").select("restaurant_id").not("restaurant_id", "is", null),
  ]);
  if (restRes.error) throw restRes.error;
  if (profRes.error) throw profRes.error;

  const countByRest = new Map<string, number>();
  for (const p of profRes.data ?? []) {
    const rid = p.restaurant_id as string;
    countByRest.set(rid, (countByRest.get(rid) ?? 0) + 1);
  }

  return (restRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    city: (r.city as string) ?? null,
    district: (r.district as string) ?? null,
    usersCount: countByRest.get(r.id as string) ?? 0,
  }));
}

/// Inventario (cantina condivisa) di un ristorante, joinato col catalogo vini.
/// Ritorna sia righe distribuzione che conto vendita; lo split per canale
/// avviene client-side.
export async function listRestaurantInventory(
  restaurantId: string,
): Promise<AdminCustomerInventoryRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("customer_inventory")
    .select(`
      id,
      user_id,
      wine_id,
      channel,
      qty_in_stock,
      starty_warehouse_id,
      last_received_at,
      last_consumed_at,
      notes,
      created_at,
      updated_at,
      wines (
        legacy_id,
        name,
        producer,
        type,
        vintage,
        price
      )
    `)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const w = r.wines as Record<string, unknown> | null;
    return {
      id: r.id as string,
      userId: (r.user_id as string) ?? null,
      wineId: r.wine_id as string,
      wineLegacyId: (w?.legacy_id as string) ?? null,
      channel: r.channel as WineChannel,
      qtyInStock: Number(r.qty_in_stock),
      wineName: (w?.name as string) ?? "—",
      wineProducer: (w?.producer as string) ?? null,
      wineType: (w?.type as string) ?? "Rosso",
      wineVintage: (w?.vintage as number) ?? null,
      winePrice: Number(w?.price ?? 0),
      startyWarehouseId: (r.starty_warehouse_id as number) ?? null,
      lastReceivedAt: (r.last_received_at as string) ?? null,
      lastConsumedAt: (r.last_consumed_at as string) ?? null,
      notes: (r.notes as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });
}

/// Catalogo vini attivi (per il dropdown "Aggiungi vino" nella pagina).
export async function listCatalogWines(): Promise<CatalogWineOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("wines")
    .select("id, legacy_id, name, producer, type, vintage, price")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((w) => ({
    id: w.id as string,
    legacyId: (w.legacy_id as string) ?? null,
    name: w.name as string,
    producer: (w.producer as string) ?? null,
    type: (w.type as string) ?? "Rosso",
    vintage: (w.vintage as number) ?? null,
    price: Number(w.price ?? 0),
  }));
}
