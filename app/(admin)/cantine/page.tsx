import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import {
  listCustomersForInventory,
  listCustomerInventory,
  listCatalogWines,
} from "@/lib/customer-inventory/queries";
import type {
  AdminCustomerInventoryRow,
  CatalogWineOption,
  CustomerOption,
} from "@/lib/customer-inventory/types";
import { CantineList } from "@/components/admin/cantine-list";

export const dynamic = "force-dynamic";

export default async function CantinePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const [crumb, sub] = PAGE_LABELS.cantine;
  const params = await searchParams;
  const userId = params.u ?? null;

  let customers: CustomerOption[] = [];
  let inventory: AdminCustomerInventoryRow[] = [];
  let catalog: CatalogWineOption[] = [];
  let fetchError: string | null = null;

  try {
    const [c, cat] = await Promise.all([
      listCustomersForInventory(),
      listCatalogWines(),
    ]);
    customers = c;
    catalog = cat;
    if (userId) {
      inventory = await listCustomerInventory(userId);
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
          customers={customers}
          inventory={inventory}
          catalog={catalog}
          selectedUserId={userId}
        />
      )}
    </AdmShell>
  );
}
