import { assertEquals } from "jsr:@std/assert@1";
import { computeRomeParts, isScheduledNow } from "./logic.ts";

Deno.test("computeRomeParts handles CET (winter, +1)", () => {
  // 2026-01-15 12:00 UTC -> Rome 13:00, Thursday (ISO 4)
  const p = computeRomeParts(new Date("2026-01-15T12:00:00Z"));
  assertEquals(p.dateISO, "2026-01-15");
  assertEquals(p.isoWeekday, 4);
  assertEquals(p.hhmm, "13:00");
});

Deno.test("computeRomeParts handles CEST (summer, +2)", () => {
  // 2026-07-15 12:00 UTC -> Rome 14:00, Wednesday (ISO 3)
  const p = computeRomeParts(new Date("2026-07-15T12:00:00Z"));
  assertEquals(p.dateISO, "2026-07-15");
  assertEquals(p.isoWeekday, 3);
  assertEquals(p.hhmm, "14:00");
});

Deno.test("computeRomeParts rolls the date across midnight", () => {
  // 2026-07-15 23:30 UTC -> Rome 01:30 next day (2026-07-16), Thursday (ISO 4)
  const p = computeRomeParts(new Date("2026-07-15T23:30:00Z"));
  assertEquals(p.dateISO, "2026-07-16");
  assertEquals(p.isoWeekday, 4);
  assertEquals(p.hhmm, "01:30");
});

const PARTS = { dateISO: "2026-07-15", isoWeekday: 3, hhmm: "17:05" };

Deno.test("isScheduledNow: due when enabled, weekday matches, time reached", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: true, reminderWeekdays: [3, 5], reminderTime: "17:00" }, PARTS), true);
});
Deno.test("isScheduledNow: not due before the configured time", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: true, reminderWeekdays: [3], reminderTime: "17:30" }, PARTS), false);
});
Deno.test("isScheduledNow: not due on a non-listed weekday", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: true, reminderWeekdays: [1, 2], reminderTime: "08:00" }, PARTS), false);
});
Deno.test("isScheduledNow: not due when disabled", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: false, reminderWeekdays: [3], reminderTime: "08:00" }, PARTS), false);
});
Deno.test("isScheduledNow: not due when reminderTime is null", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: true, reminderWeekdays: [3], reminderTime: null }, PARTS), false);
});
Deno.test("isScheduledNow: due exactly at the configured minute", () => {
  assertEquals(isScheduledNow(
    { reminderEnabled: true, reminderWeekdays: [3], reminderTime: "17:05" }, PARTS), true);
});
