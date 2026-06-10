// partner-request - invia per email una richiesta di partnership compilata
// dalla SignupScreen dell'app Flutter ("Unisciti a Enopera").
//
// E' un endpoint PRE-AUTENTICAZIONE: l'utente non ha ancora un account, quindi
// non verifichiamo un JWT utente. Il client Flutter invia comunque l'anon key
// come Bearer (functions.invoke lo fa di default), che soddisfa il verify_jwt
// di piattaforma. Non c'e' logica di business sensibile: si valida l'input e
// si inoltra una mail via Resend.
//
// Secret richiesto: RESEND_API_KEY.
// Env opzionali: PARTNER_NOTIFICATION_EMAIL (destinatario), RESEND_FROM (mittente).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
// Destinatari delle richieste di partnership. CSV via env (override), con
// default i recapiti Enopera. NB: con un mittente di test (onboarding@resend.dev)
// Resend consegna SOLO all'owner dell'account; per recapitare a questi indirizzi
// serve un dominio verificato su Resend e RESEND_FROM su quel dominio.
const TO_EMAILS = (Deno.env.get("PARTNER_NOTIFICATION_EMAIL") ?? "info@enopera.com,ordini@enopera.it")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Mittente di test integrato in Resend: non richiede dominio verificato ma
// consegna solo all'email del titolare dell'account Resend.
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ?? "Enopera <onboarding@resend.dev>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface PartnerRequest {
  locale?: string;
  ragioneSociale?: string;
  partitaIva?: string;
  pec?: string;
  tipologia?: string;
  coperti?: string;
  citta?: string;
  indirizzo?: string;
  referente?: string;
  email?: string;
  telefono?: string;
  messaggio?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Escape per interpolare input utente nell'HTML della mail senza injection.
function esc(v: string | undefined | null): string {
  return (v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: PartnerRequest;
  try {
    body = await req.json() as PartnerRequest;
  } catch {
    return json({ error: "Body non e' JSON valido" }, 400);
  }

  // Validazione server-side dei campi required (specchio del client).
  const locale = body.locale?.trim() ?? "";
  const ragioneSociale = body.ragioneSociale?.trim() ?? "";
  const partitaIva = (body.partitaIva ?? "").replace(/\s/g, "").trim();
  const pec = body.pec?.trim() ?? "";
  const citta = body.citta?.trim() ?? "";
  const indirizzo = body.indirizzo?.trim() ?? "";
  const referente = body.referente?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const missing: string[] = [];
  if (!locale) missing.push("locale");
  if (!ragioneSociale) missing.push("ragioneSociale");
  if (!partitaIva) missing.push("partitaIva");
  if (!pec) missing.push("pec");
  if (!citta) missing.push("citta");
  if (!indirizzo) missing.push("indirizzo");
  if (!referente) missing.push("referente");
  if (!email) missing.push("email");
  if (missing.length) {
    return json({ error: `Campi obbligatori mancanti: ${missing.join(", ")}` }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: "Email non valida" }, 400);
  }
  if (!/^\d{11}$/.test(partitaIva)) {
    return json({ error: "Partita IVA non valida (11 cifre)" }, 400);
  }
  if (!EMAIL_RE.test(pec)) {
    return json({ error: "PEC non valida" }, 400);
  }

  const tipologia = body.tipologia?.trim() || "-";
  const coperti = body.coperti?.trim() || "-";
  const telefono = body.telefono?.trim() || "-";
  const messaggio = body.messaggio?.trim() || "";

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 14px 6px 0;color:#a59a94;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:6px 0;color:#2a1a1d;font:400 14px/1.5 'Helvetica Neue',Arial,sans-serif;">${value}</td>
    </tr>`;

  const html = `
  <div style="background:#f6efe4;padding:28px;">
    <div style="max-width:520px;margin:0 auto;background:#fbf7ee;border:1px solid #e2d5c0;border-radius:16px;overflow:hidden;">
      <div style="background:#7a1a2c;padding:20px 24px;">
        <div style="color:#a59a94;font:600 10px/1 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:2px;">Diventa partner</div>
        <div style="color:#fff1df;font:500 22px/1.2 Georgia,serif;margin-top:4px;">Nuova richiesta di partnership</div>
      </div>
      <div style="padding:22px 24px;">
        <div style="color:#7a1a2c;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:8px;">Il locale</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Nome locale", esc(locale))}
          ${row("Tipologia", esc(tipologia))}
          ${row("Coperti", esc(coperti))}
          ${row("Citta", esc(citta))}
          ${row("Indirizzo", esc(indirizzo))}
        </table>
        <div style="color:#7a1a2c;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1.4px;margin:18px 0 8px;">Dati fiscali</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Ragione sociale", esc(ragioneSociale))}
          ${row("Partita IVA", esc(partitaIva))}
          ${row("PEC", `<a href="mailto:${esc(pec)}" style="color:#7a1a2c;">${esc(pec)}</a>`)}
        </table>
        <div style="color:#7a1a2c;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1.4px;margin:18px 0 8px;">Chi e'</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Referente", esc(referente))}
          ${row("Email", `<a href="mailto:${esc(email)}" style="color:#7a1a2c;">${esc(email)}</a>`)}
          ${row("Telefono", esc(telefono))}
        </table>
        ${messaggio ? `
        <div style="color:#7a1a2c;font:600 11px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1.4px;margin:18px 0 8px;">Messaggio</div>
        <div style="color:#2a1a1d;font:italic 400 14px/1.5 Georgia,serif;padding-left:12px;border-left:2px solid #c48a48;">${esc(messaggio)}</div>` : ""}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #e2d5c0;color:#a59a94;font:400 11px/1.4 'Helvetica Neue',Arial,sans-serif;">
        Inviata dall'app Enopera Portal - rispondi direttamente a questa mail per contattare il locale.
      </div>
    </div>
  </div>`;

  const text = [
    "Nuova richiesta di partnership - Enopera",
    "",
    "IL LOCALE",
    `Nome locale: ${locale}`,
    `Tipologia:   ${tipologia}`,
    `Coperti:     ${coperti}`,
    `Citta:       ${citta}`,
    `Indirizzo:   ${indirizzo}`,
    "",
    "DATI FISCALI",
    `Ragione sociale: ${ragioneSociale}`,
    `Partita IVA:     ${partitaIva}`,
    `PEC:             ${pec}`,
    "",
    "CHI E'",
    `Referente:   ${referente}`,
    `Email:       ${email}`,
    `Telefono:    ${telefono}`,
    ...(messaggio ? ["", "MESSAGGIO", messaggio] : []),
  ].join("\n");

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAILS,
        reply_to: email,
        subject: `Richiesta partner - ${locale} (${citta})`,
        html,
        text,
      }),
    });
  } catch (e) {
    console.error(`[partner-request] fetch Resend fallito: ${(e as Error).message}`);
    return json({ error: "Invio email fallito" }, 502);
  }

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    console.error(`[partner-request] Resend ${resendRes.status}: ${detail.slice(0, 300)}`);
    return json({ error: "Invio email rifiutato dal provider", detail }, 502);
  }

  console.log(`[partner-request] OK richiesta da ${referente} <${email}> per ${locale} (${citta})`);
  return json({ ok: true });
});
