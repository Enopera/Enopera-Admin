import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listPriceLists } from "@/lib/price-lists/queries";
import { ListiniList } from "@/components/admin/listini-list";

export const dynamic = "force-dynamic";
// La server action `syncAllFromStarty` può impiegare ~52s (sync catalogo
// vini + prezzi). Estendiamo il timeout Vercel per questa pagina.
export const maxDuration = 60;

export default async function ListiniPage() {
  const [crumb, sub] = PAGE_LABELS.listini;

  let priceLists: Awaited<ReturnType<typeof listPriceLists>> = [];
  let fetchError: string | null = null;
  try {
    priceLists = await listPriceLists();
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="listini" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare i listini.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
        </div>
      ) : (
        <ListiniList priceLists={priceLists} />
      )}
    </AdmShell>
  );
}
