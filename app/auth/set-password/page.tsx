"use client";

// Pagina pubblica raggiunta dal link "imposta password" dell'email di invito.
// Stesso flusso della pagina di reset password: il link verify di Supabase
// reindirizza qui con i token nel fragment (flow implicit); impostiamo la
// sessione con setSession e poi salviamo la password con updateUser.
// NB: il client @supabase/ssr (default PKCE) non stabilisce la sessione dal
// fragment in automatico, quindi lo facciamo esplicitamente.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setPasswordFromInvite, validateInviteToken } from "@/lib/auth/invite-actions";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmBtn, AdmWordmark } from "@/lib/admin/primitives";

type Phase = "loading" | "ready" | "saving" | "success" | "error" | "expired";

export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  // Token del flusso invito custom (?invite=...). Null = flusso Supabase.
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let unsubscribe: (() => void) | null = null;
    let t1: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;

    const setReadyOnce = () =>
      setPhase((cur) => (cur === "loading" ? "ready" : cur));

    (async () => {
      // 0. Flusso invito custom: ?invite=<token> -> validazione server-side.
      //    Indipendente dal token Supabase; scadenza 7 giorni.
      const inviteParam = new URL(window.location.href).searchParams.get("invite");
      if (inviteParam) {
        setInviteToken(inviteParam);
        const res = await validateInviteToken(inviteParam);
        setPhase(res.ok ? "ready" : "expired");
        return;
      }

      // 1. Errore esplicito nel fragment (es. otp_expired).
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errCode = hash.get("error_code") || hash.get("error");
      if (errCode) {
        const desc = hash.get("error_description");
        setErrorMsg(decodeURIComponent((desc ?? errCode).replace(/\+/g, " ")));
        setPhase("expired");
        return;
      }

      // 2. Caso implicit (#access_token=...&refresh_token=...): imposta la sessione.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setErrorMsg(
            "Link non valido o scaduto (" + error.message + "). " +
            "Apri di nuovo l'email di invito o chiedi un nuovo link.",
          );
          setPhase("expired");
          return;
        }
        setReadyOnce();
        return;
      }

      // 3. Caso PKCE (?code=...).
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg(
            "Link non valido per questo browser (" + error.message + "). " +
            "Apri di nuovo l'email di invito.",
          );
          setPhase("expired");
          return;
        }
        setReadyOnce();
        return;
      }

      // 4. Fallback: nessun token nell'URL, prova una sessione esistente, poi scadi a 4s.
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          event === "PASSWORD_RECOVERY" ||
          (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
        ) {
          setReadyOnce();
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      const checkSession = async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) setReadyOnce();
      };
      await checkSession();
      t1 = setTimeout(checkSession, 600);
      t2 = setTimeout(() => {
        setPhase((cur) => (cur === "loading" ? "expired" : cur));
      }, 4000);
    })();

    return () => {
      if (unsubscribe) unsubscribe();
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, []);

  const submit = async () => {
    setErrorMsg(null);
    if (pwd.length < 8) {
      setErrorMsg("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (pwd !== pwd2) {
      setErrorMsg("Le due password non coincidono.");
      return;
    }
    setPhase("saving");

    // Flusso invito custom: imposta la password via server action (service-role).
    if (inviteToken) {
      const res = await setPasswordFromInvite(inviteToken, pwd);
      if (!res.ok) {
        setErrorMsg(res.error);
        setPhase("ready");
        return;
      }
      setPhase("success");
      return;
    }

    // Flusso Supabase (fallback per eventuali link recovery/implicit).
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setErrorMsg(error.message);
      setPhase("ready");
      return;
    }
    await supabase.auth.signOut();
    setPhase("success");
  };

  return (
    <div style={{
      width: 460, maxWidth: "100%", background: ADM.panel,
      border: `1px solid ${ADM.line}`, borderRadius: 12,
      boxShadow: "0 24px 60px rgba(42,26,29,0.16), 0 0 0 1px rgba(42,26,29,0.06)",
      padding: "28px 30px", display: "flex", flexDirection: "column", gap: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <AdmWordmark size={20} suffix={null} />
        <span style={{
          fontFamily: ADM.sans, fontSize: 10.5, letterSpacing: 1.6,
          textTransform: "uppercase", color: ADM.inkSoft, fontWeight: 600,
        }}>Attivazione account</span>
      </div>

      {phase === "loading" && (
        <Status title="Verifica del link in corso…" body="Un attimo solo." />
      )}

      {phase === "expired" && (
        <Status
          title="Link non valido o scaduto"
          body="Il link di invito potrebbe essere stato gia usato o e scaduto. Apri di nuovo l&apos;email di invito o richiedi un nuovo link all&apos;amministratore."
          tone="error"
        />
      )}

      {(phase === "ready" || phase === "saving") && (
        <>
          <h1 style={{
            margin: 0, fontFamily: ADM.serif, fontSize: 30, fontWeight: 500, color: ADM.ink,
            letterSpacing: -0.8, lineHeight: 1.05,
          }}>Benvenuto in Enopera</h1>
          <p style={{ margin: 0, fontFamily: ADM.sans, fontSize: 13, color: ADM.inkSoft, lineHeight: 1.5 }}>
            Imposta una password di almeno 8 caratteri per il tuo account. Dopo il
            salvataggio puoi accedere dall&apos;app Enopera con questa email e password.
          </p>

          <PasswordField
            label="PASSWORD"
            value={pwd}
            onChange={setPwd}
            disabled={phase === "saving"}
          />
          <PasswordField
            label="CONFERMA PASSWORD"
            value={pwd2}
            onChange={setPwd2}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            disabled={phase === "saving"}
          />

          {errorMsg && (
            <div style={{
              padding: "10px 12px", borderRadius: 6,
              background: ADM.redWash, color: ADM.red,
              fontFamily: ADM.sans, fontSize: 12.5,
              border: `1px solid ${ADM.red}33`,
            }}>{errorMsg}</div>
          )}

          <AdmBtn
            kind="primary" size="lg" icon={AdmIcons.check(14)}
            onClick={submit}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {phase === "saving" ? "Salvataggio…" : "Imposta password"}
          </AdmBtn>
        </>
      )}

      {phase === "success" && (
        <Status
          title="Account attivato"
          body="Apri l&apos;app Enopera e accedi con la tua email e la nuova password."
          tone="success"
        />
      )}
    </div>
  );
}

function Status({
  title, body, tone = "neutral",
}: { title: string; body: string; tone?: "neutral" | "success" | "error" }) {
  const color = tone === "success" ? ADM.green : tone === "error" ? ADM.red : ADM.ink;
  const bg = tone === "success" ? ADM.greenWash : tone === "error" ? ADM.redWash : ADM.panelAlt;
  return (
    <div style={{
      padding: "20px 22px", borderRadius: 8,
      background: bg, border: `1px solid ${color}22`,
    }}>
      <div style={{
        fontFamily: ADM.serif, fontSize: 22, fontWeight: 500,
        color, letterSpacing: -0.4, marginBottom: 6, lineHeight: 1.1,
      }}>{title}</div>
      <div style={{ fontFamily: ADM.sans, fontSize: 13, color: ADM.inkSoft, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}

function PasswordField({
  label, value, onChange, onKeyDown, disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="••••••••"
          disabled={disabled}
          style={{ ...inputStyle, paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Nascondi password" : "Mostra password"}
          title={show ? "Nascondi password" : "Mostra password"}
          style={{
            position: "absolute", top: 0, right: 0, height: "100%", width: 38,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: ADM.inkMuted, padding: 0,
          }}
        >
          {show ? AdmIcons.eyeOff(16) : AdmIcons.eye(16)}
        </button>
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{
        fontFamily: ADM.sans, fontSize: 10.5, color: ADM.inkSoft,
        textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 600,
      }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  border: `1px solid ${ADM.line}`, borderRadius: 6,
  fontFamily: ADM.sans, fontSize: 14, color: ADM.ink, background: ADM.bg,
  outline: "none",
};
