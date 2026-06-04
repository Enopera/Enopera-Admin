// Layout pubblico per le pagine /auth/* (reset password, ecc.).
// Nessun chrome admin, nessun basic auth (escluso dal middleware).
import { ADM } from "@/lib/admin/tokens";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: ADM.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: ADM.sans,
      color: ADM.ink,
    }}>
      {children}
    </div>
  );
}
