import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listWinesForAdmin, listGrapeRegionOptions } from "@/lib/wines/queries";
import { ViniList } from "@/components/admin/vini-list";

export const dynamic = "force-dynamic";

export default async function ViniPage() {
  const [crumb, sub] = PAGE_LABELS.vini;

  let wines: Awaited<ReturnType<typeof listWinesForAdmin>> = [];
  let options: Awaited<ReturnType<typeof listGrapeRegionOptions>> = { grapes: [], regions: [] };
  let fetchError: string | null = null;
  try {
    [wines, options] = await Promise.all([listWinesForAdmin(), listGrapeRegionOptions()]);
  } catch (e) {
    fetchError = (e as Error).message;
  }

  return (
    <AdmShell active="vini" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare i vini.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
        </div>
      ) : (
        <ViniList wines={wines} options={options} />
      )}
    </AdmShell>
  );
}
