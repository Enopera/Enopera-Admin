"use client";

// Pagina pubblica raggiunta dal link email "Recupera password" di Supabase.
// Il flusso è:
//   1. Email contiene: https://<project>.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=<questa-pagina>
//   2. Supabase verifica il token e ridireziona qui con un fragment URL #access_token=...&type=recovery
//   3. supabase-js parse automaticamente il fragment e firma il PASSWORD_RECOVERY event
//   4. Mostriamo il form, salviamo la nuova password con auth.updateUser()
//   5. L'utente torna nell'app mobile e fa login con la nuova password.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ADM } from "@/lib/admin/tokens";
import { AdmIcons } from "@/lib/admin/icons";
import { AdmBtn, AdmWordmark } from "@/lib/admin/primitives";

type Phase = "loading" | "ready" | "saving" | "success" | "error" | "expired";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let unsubscribe: (() => void) | null = null;
    let t1: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;

    const setReadyOnce = () =>
      setPhase((cur) => (cur === "loading" ? "ready" : cur));

    (async () => {
      // 1. Errore esplicito nel fragment URL (es. otp_expired).
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errCode = hash.get("error_code") || hash.get("error");
      if (errCode) {
        const desc = hash.get("error_description");
        setErrorMsg(decodeURIComponent((desc ?? errCode).replace(/\+/g, " ")));
        setPhase("expired");
        return;
      }

      // 2. Caso PKCE (?code=...): proviamo lo scambio.
      //    Funziona solo se il code_verifier è in localStorage di QUESTO browser
      //    (cioè se il reset è partito da un client web sullo stesso device).
      //    Per i flussi cross-device da app mobile usiamo il flusso implicit.
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg(
            "Link non valido per questo browser (" + error.message + "). " +
            "Apri l'app Enopera e richiedi un nuovo link di reset.",
          );
          setPhase("expired");
          return;
        }
        setReadyOnce();
        return;
      }

      // 3. Sottoscrivi auth state change PRIMA di leggere la sessione,
      //    così non ci sfugge un eventuale evento sincrono.
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          event === "PASSWORD_RECOVERY" ||
          (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
        ) {
          setReadyOnce();
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      // 4. Caso implicit (#access_token=...): il client di Supabase legge il
      //    fragment in init e stabilisce la sessione. Verifichiamo subito + a 600ms.
      const checkSession = async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) setReadyOnce();
      };
      await checkSession();
      t1 = setTimeout(checkSession, 600);

      // 5. Fallback finale: 4s senza segnale → considera scaduto.
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
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setErrorMsg(error.message);
      setPhase("ready");
      return;
    }
    // Pulizia: chiudiamo la sessione di recovery (l'utente farà login normalmente
    // dall'app mobile o web)
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
        <AdmWordmark size={20} />
        <span style={{
          fontFamily: ADM.sans, fontSize: 10.5, letterSpacing: 1.6,
          textTransform: "uppercase", color: ADM.inkSoft, fontWeight: 600,
        }}>Recupero password</span>
      </div>

      {phase === "loading" && (
        <Status title="Verifica del link in corso…" body="Un attimo solo." />
      )}

      {phase === "expired" && (
        <Status
          title="Link scaduto o non valido"
          body="Il link di recupero potrebbe essere stato già usato o è scaduto. Apri di nuovo l&apos;app e richiedi un nuovo link."
          tone="error"
        />
      )}

      {(phase === "ready" || phase === "saving") && (
        <>
          <h1 style={{
            margin: 0, fontFamily: ADM.serif, fontSize: 30, fontWeight: 500, color: ADM.ink,
            letterSpacing: -0.8, lineHeight: 1.05,
          }}>Imposta una nuova password</h1>
          <p style={{ margin: 0, fontFamily: ADM.sans, fontSize: 13, color: ADM.inkSoft, lineHeight: 1.5 }}>
            Scegli una password di almeno 8 caratteri. Dopo il salvataggio puoi tornare nell&apos;app
            Enopera e accedere con la nuova password.
          </p>

          <Field label="NUOVA PASSWORD">
            <input
              type="password" autoComplete="new-password" value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••" disabled={phase === "saving"}
              style={inputStyle}
            />
          </Field>
          <Field label="CONFERMA PASSWORD">
            <input
              type="password" autoComplete="new-password" value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="••••••••" disabled={phase === "saving"}
              style={inputStyle}
            />
          </Field>

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
            {phase === "saving" ? "Salvataggio…" : "Salva nuova password"}
          </AdmBtn>
        </>
      )}

      {phase === "success" && (
        <Status
          title="Password aggiornata"
          body="Torna nell&apos;app Enopera e accedi con la nuova password."
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
