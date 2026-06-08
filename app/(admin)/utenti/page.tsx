import { ADM } from "@/lib/admin/tokens";
import { AdmShell } from "@/components/admin/shell";
import { PAGE_LABELS } from "@/components/admin/nav";
import { listUsers } from "@/lib/users/queries";
import { listRestaurants } from "@/lib/restaurants/queries";
import { UsersList } from "@/components/admin/users-list";

export const dynamic = "force-dynamic";

export default async function UtentiPage() {
  const [crumb, sub] = PAGE_LABELS.utenti;

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let restaurants: Awaited<ReturnType<typeof listRestaurants>> = [];
  let fetchError: string | null = null;
  try {
    [users, restaurants] = await Promise.all([
      listUsers(),
      listRestaurants(),
    ]);
  } catch (e) {
    fetchError = (e as Error).message;
  }

  // Per il dropdown del drawer + il modal invito (email precompilata e riepilogo).
  const restaurantOptions = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    email: r.email,
    vat: r.vat,
    address: r.address,
    district: r.district,
  }));

  return (
    <AdmShell active="utenti" crumb={crumb} sub={sub}>
      {fetchError ? (
        <div style={{
          margin: 36, padding: "24px 28px", borderRadius: 8,
          background: ADM.redWash, border: `1px solid ${ADM.red}33`,
          fontFamily: ADM.sans, fontSize: 13, color: ADM.red, lineHeight: 1.5,
        }}>
          <strong>Impossibile caricare gli utenti.</strong>
          <div style={{ marginTop: 6, color: ADM.ink }}>{fetchError}</div>
          <div style={{ marginTop: 10, color: ADM.inkSoft, fontSize: 12 }}>
            Verifica che <code>SUPABASE_SERVICE_ROLE_KEY</code> sia impostata nelle env vars.
          </div>
        </div>
      ) : (
        <UsersList users={users} restaurants={restaurantOptions} />
      )}
    </AdmShell>
  );
}
