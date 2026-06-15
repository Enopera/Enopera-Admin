import { assertEquals } from "jsr:@std/assert@1";
import { normalizeE164, sendWhatsAppTemplate } from "./whatsapp.ts";

const CASES: Array<[string | null, string | null]> = [
  ["+393331234567", "+393331234567"],
  ["+39 333 123 4567", "+393331234567"],
  ["+39-333-1234567", "+393331234567"],
  ["3331234567", "+393331234567"],
  ["333 123 4567", "+393331234567"],
  ["0612345", null],
  ["abc", null],
  ["", null],
  [null, null],
  ["+1 202 555 0142", "+12025550142"],
];

Deno.test("normalizeE164 canonical vectors", () => {
  for (const [input, expected] of CASES) {
    assertEquals(normalizeE164(input), expected, `input=${JSON.stringify(input)}`);
  }
});

Deno.test("sendWhatsAppTemplate dry-run does not call out", async () => {
  // Ensure dry-run mode (no WHATSAPP_MODE set).
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    throw new Error("fetch must not be called in dry-run");
  }) as typeof fetch;
  try {
    const r = await sendWhatsAppTemplate({
      to: "+393331234567", templateName: "order_reminder", lang: "it",
      variables: ["Osteria del Ponte"],
    });
    assertEquals(r.ok, true);
    assertEquals(r.id, "dry-run");
    assertEquals(called, false);
  } finally {
    globalThis.fetch = original;
  }
});
