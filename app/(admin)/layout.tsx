import { ADM } from "@/lib/admin/tokens";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminContextProvider } from "@/lib/admin/admin-context";

/// Outer wrapper. La struttura interna (sidebar + topstrip + content
/// + bottom-nav mobile) è gestita da AdmShell nelle singole pagine.
///
/// `requireAdmin()` è il gate: se l'utente non è autenticato Supabase
/// o il suo username non è in ADMIN_USERNAMES, redirige a /admin/login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div style={{
      minHeight: "100vh",
      background: ADM.bg,
      fontFamily: ADM.sans,
      color: ADM.ink,
    }}>
      <AdminContextProvider username={admin.username}>{children}</AdminContextProvider>
    </div>
  );
}
