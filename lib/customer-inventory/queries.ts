import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  RestaurantInventoryOption,
  WineChannel,
} from "./types";

/// Risolve il listino prezzi da usare: quello custom del ristorante (se passato
/// e valorizzato), altrimenti il listino di default globale. Replica la logica
/// di place-order così i prezzi mostrati in admin coincidono con quelli ordine.
async function resolvePriceListId(
  // deno/next: client Supabase service-role
  supabase: ReturnType<typeof createAdminClient>,
  restaurantId?: string | null,
): Promise<string | null> {
  if (restaurantId) {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("price_list_id")
      .eq("id", restaurantId)
      .maybeSingle();
    const id = (rest?.price_list_id as string | null) ?? null;
    if (id) return id;
  }
  const { data } = await supabase
    .from("price_lists")
    .select("id")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/// Mappa wine_id -> prezzo per TUTTO un listino. Una sola query, SENZA filtro
/// `.in("wine_id", [...])`: con centinaia di id quel filtro genera una URL
/// enorme che PostgREST rifiuta (URI too long), e l'errore passerebbe
/// inosservato lasciando la mappa vuota (tutti i prezzi a 0). Un listino ha al
/// massimo ~qualche centinaio di righe: le prendiamo tutte e mappiamo in RAM.
async function pricesForList(
  supabase: ReturnType<typeof createAdminClient>,
  priceListId: string | null,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!priceListId) return map;
  const { data, error } = await supabase
    .from("wine_prices")
    .select("wine_id, price")
    .eq("price_list_id", priceListId);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ wine_id: string; price: string | number }>) {
    map.set(r.wine_id, Number(r.price));
  }
  return map;
}

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
        vintage
      )
    `)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;

  // Prezzo effettivo dal listino del ristorante (fallback default), NON da
  // wines.price (colonna legacy ~0 non più sincronizzata).
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const priceListId = await resolvePriceListId(supabase, restaurantId);
  const priceMap = await pricesForList(supabase, priceListId);

  return rows.map((r) => {
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
      winePrice: priceMap.get(r.wine_id as string) ?? 0,
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
/// Il prezzo è quello del listino del ristorante (se `restaurantId` passato),
/// altrimenti del listino di default — mai più la colonna legacy wines.price.
export async function listCatalogWines(
  restaurantId?: string | null,
): Promise<CatalogWineOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("wines")
    .select("id, legacy_id, name, producer, type, vintage")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const priceListId = await resolvePriceListId(supabase, restaurantId);
  const priceMap = await pricesForList(supabase, priceListId);
  return rows.map((w) => ({
    id: w.id as string,
    legacyId: (w.legacy_id as string) ?? null,
    name: w.name as string,
    producer: (w.producer as string) ?? null,
    type: (w.type as string) ?? "Rosso",
    vintage: (w.vintage as number) ?? null,
    price: priceMap.get(w.id as string) ?? 0,
  }));
}
