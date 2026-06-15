// Shared WhatsApp helpers for Enopera edge functions.
// Dry-run by default: no external call until WHATSAPP_MODE=live.

export interface WhatsAppTemplateMessage {
  to: string; // E.164
  templateName: string;
  lang: string; // e.g. "it"
  variables: string[]; // values for {{1}}, {{2}}, ...
}

export interface WhatsAppSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// Normalize a raw phone string to E.164, or null if not valid.
// Italian local mobile numbers (9-10 digits, leading 3) get +39 prepended.
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    const candidate = "+" + digits;
    return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
  }
  // No leading +: only accept plausible Italian mobile (9-10 digits, leading 3).
  if (/^3\d{8,9}$/.test(digits)) {
    const candidate = "+39" + digits;
    return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
  }
  return null;
}

// Send a WhatsApp template message.
// WHATSAPP_MODE = "dry_run" (default) logs nothing and returns ok without
// calling any API. "live" implements the Meta Cloud API call (see spec 8).
export async function sendWhatsAppTemplate(
  msg: WhatsAppTemplateMessage,
): Promise<WhatsAppSendResult> {
  const mode = Deno.env.get("WHATSAPP_MODE") ?? "dry_run";
  if (mode !== "live") {
    return { ok: true, id: "dry-run" };
  }

  // LIVE (Meta WhatsApp Cloud API). Implement at go-live (spec section 8).
  // IMPORTANT: at go-live the idempotency row must be claimed BEFORE sending
  // (see spec "Ordine claim-before-send"). Until then we hard-fail to avoid
  // accidental real sends with a half-built adapter.
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WHATSAPP live mode not configured" };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to,
          type: "template",
          template: {
            name: msg.templateName,
            language: { code: msg.lang },
            components: msg.variables.length
              ? [{
                type: "body",
                parameters: msg.variables.map((v) => ({ type: "text", text: v })),
              }]
              : [],
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Meta ${res.status}: ${detail.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: body?.messages?.[0]?.id ?? "sent" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
