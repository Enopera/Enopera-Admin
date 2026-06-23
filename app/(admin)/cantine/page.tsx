import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import {
  listRestaurantsForInventory,
  listRestaurantInventory,
  listCatalogWines,
} from "@/lib/customer-inventory/queries";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  RestaurantInventoryOption,
} from "@/lib/customer-inventory/types";
import { CantineList } from "@/components/admin/cantine-list";

export const dynamic = "force-dynamic";

export default async function CantinePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const [crumb, sub] = PAGE_LABELS.cantine;
  const params = await searchParams;
  const restaurantId = params.r ?? null;

  let restaurants: RestaurantInventoryOption[] = [];
  let inventory: AdminCustomerInventoryRow[] = [];
  let catalog: CatalogWineOption[] = [];
  let fetchError: string | null = null;

  try {
    const [rs, cat] = await Promise.all([
      listRestaurantsForInventory(),
      // Prezzi del listino del ristorante selezionato (fallback default).
      listCatalogWines(restaurantId),
    ]);
    restaurants = rs;
    catalog = cat;
    if (restaurantId) {
      inventory = await listRestaurantInventory(restaurantId);
    }
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="cantine" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare le cantine.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
        </div>
      ) : (
        <CantineList
          restaurants={restaurants}
          inventory={inventory}
          catalog={catalog}
          selectedRestaurantId={restaurantId}
        />
      )}
    </AdmShell>
  );
}
