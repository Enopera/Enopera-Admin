// app/admin/login/page.tsx
import { LoginForm } from "./login-form";
import { ADM } from "@/lib/admin/tokens";
import { AdmWordmark } from "@/lib/admin/primitives";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized:
    "La tua sessione è stata revocata. Effettua di nuovo il login.",
};

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  // Sanitize next anche qui: cambia URL non valida in default visibile nel form
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/utenti";

  const initialError = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: ADM.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: ADM.sans,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: ADM.panel,
          border: `1px solid ${ADM.line}`,
          borderRadius: 10,
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <AdmWordmark size={22} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: ADM.sans,
              fontSize: 18,
              fontWeight: 700,
              color: ADM.ink,
            }}
          >
            Accesso amministrazione
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontFamily: ADM.sans,
              fontSize: 12.5,
              color: ADM.inkSoft,
            }}
          >
            Riservato agli operatori autorizzati Enopera
          </p>
        </div>

        <LoginForm next={safeNext} initialError={initialError} />
      </div>
    </div>
  );
}
