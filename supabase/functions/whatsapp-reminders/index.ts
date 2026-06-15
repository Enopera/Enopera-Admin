import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeRomeParts, isScheduledNow } from "./logic.ts";
import { normalizeE164, sendWhatsAppTemplate } from "./whatsapp.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "order_reminder";
const TEMPLATE_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "it";
const MODE = Deno.env.get("WHATSAPP_MODE") ?? "dry_run";

interface RestaurantRow {
  id: string;
  name: string;
  reminder_enabled: boolean;
  reminder_weekdays: number[] | null;
  reminder_time: string | null;
}

interface ProfileRow {
  id: string;
  phone: string | null;
}

Deno.serve(async () => {
  const supabase = createClient(SUPA_URL, SERVICE_ROLE);
  const startedAt = Date.now();
  const parts = computeRomeParts(new Date());
  const romeStamp = `${parts.dateISO}T${parts.hhmm}`; // audit value for details.rome_now

  try {
    // 1. Candidate restaurants: enabled, with a time set.
    const { data: rests, error: rErr } = await supabase
      .from("restaurants")
      .select("id, name, reminder_enabled, reminder_weekdays, reminder_time")
      .eq("reminder_enabled", true)
      .not("reminder_time", "is", null);
    if (rErr) throw rErr;

    // 2. Filter to those actually due now (pure logic).
    const due = (rests ?? []).filter((r: RestaurantRow) =>
      isScheduledNow({
        reminderEnabled: r.reminder_enabled,
        reminderWeekdays: (r.reminder_weekdays ?? []).map(Number),
        reminderTime: r.reminder_time,
      }, parts)
    );

    // 3. Skip restaurants already processed today (anti-join optimization;
    //    the unique(restaurant_id, sent_on) is the real guard).
    const dueIds = due.map((r) => r.id);
    let alreadySent = new Set<string>();
    if (dueIds.length) {
      const { data: sent, error: sErr } = await supabase
        .from("reminder_sends")
        .select("restaurant_id")
        .eq("sent_on", parts.dateISO)
        .in("restaurant_id", dueIds);
      if (sErr) throw sErr;
      alreadySent = new Set((sent ?? []).map((s) => s.restaurant_id as string));
    }
    const toProcess = due.filter((r) => !alreadySent.has(r.id));

    const processed: Array<{ restaurant_id: string; status: string; recipient_count: number }> = [];

    for (const r of toProcess) {
      const reminderHHMM = r.reminder_time ? String(r.reminder_time).slice(0, 5) : null;
      // 3a. Opted-in, active users with a phone.
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, phone")
        .eq("restaurant_id", r.id)
        .eq("whatsapp_reminders_enabled", true)
        .eq("status", "attivo")
        .not("phone", "is", null);
      if (pErr) throw pErr;

      // 3b. Normalize + dedupe; collect skipped.
      const valid = new Set<string>();
      const skipped: string[] = [];
      for (const p of (profs ?? []) as ProfileRow[]) {
        const e164 = normalizeE164(p.phone);
        if (e164) valid.add(e164);
        else if (p.phone) skipped.push(p.phone);
      }
      const recipients = [...valid];

      // 3c. No recipients: still mark the day (idempotent) and continue.
      if (recipients.length === 0) {
        await supabase.from("reminder_sends").insert({
          restaurant_id: r.id, sent_on: parts.dateISO,
          status: "skipped_no_recipients", recipient_count: 0,
          details: {
            mode: MODE, reminder_time: reminderHHMM, rome_now: romeStamp,
            recipients: [], skipped_invalid_phone: skipped,
            template: { name: TEMPLATE_NAME, lang: TEMPLATE_LANG, variables: [r.name] },
            provider_error: null, results: [],
          },
        });
        processed.push({ restaurant_id: r.id, status: "skipped_no_recipients", recipient_count: 0 });
        continue;
      }

      // 3d/3e. Build payload + send (dry-run: logs, does not call out).
      const variables = [r.name];
      const results: Array<{ to: string; ok: boolean; id?: string; error?: string }> = [];
      let anyError = false;
      for (const to of recipients) {
        const res = await sendWhatsAppTemplate({
          to, templateName: TEMPLATE_NAME, lang: TEMPLATE_LANG, variables,
        });
        if (!res.ok) anyError = true;
        results.push({ to, ok: res.ok, id: res.id, error: res.error });
      }

      // 3f. Record the send (idempotency guard via unique constraint).
      const status = anyError ? "error" : (MODE === "live" ? "sent" : "dry_run");
      const { error: insErr } = await supabase.from("reminder_sends").insert({
        restaurant_id: r.id, sent_on: parts.dateISO, status,
        recipient_count: recipients.length,
        details: {
          mode: MODE, reminder_time: reminderHHMM, rome_now: romeStamp,
          recipients, skipped_invalid_phone: skipped,
          template: { name: TEMPLATE_NAME, lang: TEMPLATE_LANG, variables },
          provider_error: anyError ? results.find((x) => !x.ok)?.error ?? "unknown" : null,
          results,
        },
      });
      // A unique-violation (Postgres 23505) means a concurrent tick already
      // handled this restaurant today: ignore it; rethrow anything else.
      if (insErr && (insErr as { code?: string }).code !== "23505") {
        throw insErr;
      }
      processed.push({ restaurant_id: r.id, status, recipient_count: recipients.length });
    }

    return Response.json({
      ok: true, mode: MODE, rome_now: `${parts.dateISO} ${parts.hhmm}`,
      due: due.length, processed, durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    console.error(`[whatsapp-reminders] ${(e as Error).message}`);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
