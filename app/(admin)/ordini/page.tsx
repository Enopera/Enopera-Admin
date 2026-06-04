import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listOrders } from "@/lib/orders/queries";
import { OrdersList } from "@/components/admin/orders-list";

export const dynamic = "force-dynamic";

export default async function OrdiniPage() {
  const [crumb, sub] = PAGE_LABELS.ordini;

  let orders: Awaited<ReturnType<typeof listOrders>> = [];
  let fetchError: string | null = null;
  try {
    orders = await listOrders();
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="ordini" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare gli ordini.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
          <div style={{ marginTop: 10, color: ADM.inkSoft, fontSize: 12 }}>
            Verifica che <code>SUPABASE_SERVICE_ROLE_KEY</code> sia impostata nelle env vars.
          </div>
        </div>
      ) : (
        <OrdersList orders={orders} />
      )}
    </AdmShell>
  );
}
