import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listRestaurants, listUnlinkedUsers } from "@/lib/restaurants/queries";
import { listPriceListOptions } from "@/lib/price-lists/queries";
import { listCatalogWines } from "@/lib/customer-inventory/queries";
import { RestaurantsList } from "@/components/admin/restaurants-list";

export const dynamic = "force-dynamic";

export default async function RistorantiPage() {
  const [crumb, sub] = PAGE_LABELS.ristoranti;

  let restaurants: Awaited<ReturnType<typeof listRestaurants>> = [];
  let unlinkedUsers: Awaited<ReturnType<typeof listUnlinkedUsers>> = [];
  let priceLists: Awaited<ReturnType<typeof listPriceListOptions>> = [];
  let catalog: Awaited<ReturnType<typeof listCatalogWines>> = [];
  let fetchError: string | null = null;
  try {
    [restaurants, unlinkedUsers, priceLists, catalog] = await Promise.all([
      listRestaurants(),
      listUnlinkedUsers(),
      listPriceListOptions(),
      listCatalogWines(),
    ]);
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="ristoranti" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare i ristoranti.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
        </div>
      ) : (
        <RestaurantsList
          restaurants={restaurants}
          unlinkedUsers={unlinkedUsers}
          priceLists={priceLists}
          catalog={catalog}
        />
      )}
    </AdmShell>
  );
}
