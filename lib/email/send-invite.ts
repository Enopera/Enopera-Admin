import "server-only";

// Invio email di invito tramite Resend (REST API, niente dipendenze extra).
// La chiave vive nelle env del server Vercel: RESEND_API_KEY, RESEND_FROM.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Link pubblico Google Play dell'app Enopera (Android). App pubblicata.
export const APP_PLAYSTORE_URL =
  "https://play.google.com/store/apps/details?id=it.enopera.portal&hl=it";

// Link al test interno su Google Play (traccia interna). Ora l'app e' pubblica:
// nell'email si usa APP_PLAYSTORE_URL. Tenuto solo per riferimento.
export const APP_INTERNAL_TEST_URL =
  "https://play.google.com/apps/internaltest/4701671619788335871";

// Link pubblico App Store dell'app Enopera (iPhone).
export const APP_APPSTORE_URL =
  "https://apps.apple.com/it/app/enopera/id6778360028";

export type SendInviteResult = { ok: true } | { ok: false; error: string };

export async function sendInviteEmail(params: {
  to: string;
  restaurantName: string | null;
  actionLink: string;
}): Promise<SendInviteResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Enopera <noreply@enopera.com>";
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY non configurata nelle env del server" };
  }

  const html = buildInviteHtml({
    restaurantName: params.restaurantName,
    loginEmail: params.to,
    actionLink: params.actionLink,
    androidUrl: APP_PLAYSTORE_URL,
    iosUrl: APP_APPSTORE_URL,
  });

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: "Il tuo accesso a Enopera",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInviteHtml(p: {
  restaurantName: string | null;
  loginEmail: string;
  actionLink: string;
  androidUrl: string;
  iosUrl: string;
}): string {
  const restaurantRow = p.restaurantName
    ? `<tr>
         <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#a59a94; width:120px;">Ristorante</td>
         <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#2a1a1d; font-weight:600;">${escapeHtml(p.restaurantName)}</td>
       </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>Il tuo accesso a Enopera</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f6efe4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6efe4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#fbf8f1; border:1px solid #e8dec9; border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <div style="font-family:Georgia,'Times New Roman',serif; font-size:22px; letter-spacing:4px; color:#7a1a2c; font-weight:600;">ENOPERA</div>
                <div style="font-family:Arial,Helvetica,sans-serif; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#a59a94; margin-top:4px;">Il tuo accesso</div>
              </td>
            </tr>
            <tr><td style="padding:0 32px;"><div style="height:1px; background-color:#e8dec9;"></div></td></tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="margin:0 0 12px 0; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1.15; color:#2a1a1d; font-weight:600;">Benvenuto in Enopera</h1>
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.6; color:#6b5a5c;">
                  E' stato creato il tuo account per l'app Enopera. Imposta la tua password e scarica l'app per iniziare a gestire la tua cantina e i tuoi ordini.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 4px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3ecde; border:1px solid #e8dec9; border-radius:8px;">
                  <tr><td style="padding:12px 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${restaurantRow}
                      <tr>
                        <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#a59a94; width:120px;">Email di accesso</td>
                        <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#2a1a1d; font-weight:600;">${escapeHtml(p.loginEmail)}</td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px 32px;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#6b5a5c;"><strong style="color:#2a1a1d;">1.</strong> Imposta la tua password:</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="#7a1a2c" style="border-radius:8px;">
                      <a href="${p.actionLink}" target="_blank" style="display:inline-block; padding:13px 26px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">Imposta la tua password</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 6px 32px;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11.5px; color:#a59a94;">Il link e' valido 7 giorni.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 4px 32px;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#6b5a5c;"><strong style="color:#2a1a1d;">2.</strong> Scarica l'app Enopera sul tuo telefono:</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 6px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border:1px solid #7a1a2c; border-radius:8px;">
                      <a href="${p.androidUrl}" target="_blank" style="display:inline-block; padding:12px 24px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:600; color:#7a1a2c; text-decoration:none; border-radius:8px;">Android (Google Play)</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 12px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border:1px solid #7a1a2c; border-radius:8px;">
                      <a href="${p.iosUrl}" target="_blank" style="display:inline-block; padding:12px 24px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:600; color:#7a1a2c; text-decoration:none; border-radius:8px;">iPhone (App Store)</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 32px 0 32px;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11.5px; line-height:1.6; color:#a59a94;">
                  Importante: scarica l'app Enopera da <strong style="color:#6b5a5c;">Google Play</strong> (Android) o dall'<strong style="color:#6b5a5c;">App Store</strong> (iPhone). Se il pulsante della password non funziona, copia questo indirizzo nel browser:<br />
                  <a href="${p.actionLink}" target="_blank" style="color:#7a1a2c; word-break:break-all;">${p.actionLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;">
                <div style="height:1px; background-color:#e8dec9; margin-bottom:16px;"></div>
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.6; color:#a59a94;">
                  Enopera &middot; info@enopera.com &middot; +39 376 1255071<br />
                  Email automatica, non rispondere a questo messaggio. Se non ti aspettavi questo invito, ignora l'email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
