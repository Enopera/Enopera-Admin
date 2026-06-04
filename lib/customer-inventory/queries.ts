import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  CustomerOption,
  WineChannel,
} from "./types";

/// Lista dei clienti B2B per il selettore della pagina /cantine.
/// Include tutti i profili linkati a un ristorante (restaurant_id IS NOT NULL),
/// indipendentemente dal role — un admin può anche possedere un ristorante
/// di test (es. Osteria Metti) e averne la cantina da gestire.
export async function listCustomersForInventory(): Promise<CustomerOption[]> {
  const supabase = createAdminClient();

  const [authRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabase.from("profiles").select("*").not("restaurant_id", "is", null),
  ]);
  if (authRes.error) throw authRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p]),
  );

  const out: CustomerOption[] = [];
  for (const u of authRes.data.users) {
    const p = profileById.get(u.id);
    if (!p) continue;
    out.push({
      id: u.id,
      email: u.email ?? "—",
      fullName: (p.full_name as string) ?? null,
      restaurantName: (p.restaurant_name as string) ?? null,
      city: (p.city as string) ?? null,
      district: (p.district as string) ?? null,
    });
  }

  // Ordine: prima quelli con restaurant_name (più riconoscibili), poi gli altri.
  return out.sort((a, b) => {
    const aName = (a.restaurantName ?? a.fullName ?? a.email).toLowerCase();
    const bName = (b.restaurantName ?? b.fullName ?? b.email).toLowerCase();
    return aName.localeCompare(bName);
  });
}

/// Inventario di un singolo cliente, joinato con il catalogo vini.
/// Ritorna sia righe distribuzione che conto vendita; lo split per canale
/// avviene client-side.
export async function listCustomerInventory(
  userId: string,
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
    .eq("user_id", userId);
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const w = r.wines as Record<string, unknown> | null;
    return {
      id: r.id as string,
      userId: r.user_id as string,
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
