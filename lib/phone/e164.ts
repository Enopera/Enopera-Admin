/// Normalize a raw phone to E.164, or null if invalid.
/// MUST stay identical in behavior to supabase/functions/whatsapp-reminders/whatsapp.ts.
/// Canonical test vectors: see docs/superpowers/plans/2026-06-15-whatsapp-reminders.md.
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
  if (/^3\d{8,9}$/.test(digits)) {
    const candidate = "+39" + digits;
    return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
  }
  return null;
}
