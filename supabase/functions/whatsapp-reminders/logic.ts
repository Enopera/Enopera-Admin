// Pure scheduling helpers for the whatsapp-reminders function.
// No I/O: fully unit-testable.

export interface RomeParts {
  dateISO: string; // "YYYY-MM-DD" in Europe/Rome
  isoWeekday: number; // 1=Mon .. 7=Sun
  hhmm: string; // "HH:MM" 24h in Europe/Rome
}

export interface ReminderConfig {
  reminderEnabled: boolean;
  reminderWeekdays: number[]; // ISO 1..7
  reminderTime: string | null; // "HH:MM" or "HH:MM:SS" or null
}

const ROME = "Europe/Rome";

// Decompose an instant into Europe/Rome date, ISO weekday, and HH:MM.
// Uses Intl so DST (CET/CEST) is handled automatically.
export function computeRomeParts(now: Date): RomeParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const dateISO = `${parts.year}-${parts.month}-${parts.day}`;
  // en-GB hour can be "24" at midnight in some runtimes; normalize to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const hhmm = `${hour}:${parts.minute}`;

  const WD: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const isoWeekday = WD[parts.weekday] ?? 0;

  return { dateISO, isoWeekday, hhmm };
}

// True when a restaurant's reminder is due at the given Rome instant:
// enabled, today's weekday is listed, and the configured time has been reached.
export function isScheduledNow(cfg: ReminderConfig, parts: RomeParts): boolean {
  if (!cfg.reminderEnabled) return false;
  if (!cfg.reminderTime) return false;
  if (!cfg.reminderWeekdays.includes(parts.isoWeekday)) return false;
  const target = cfg.reminderTime.slice(0, 5); // "HH:MM"
  return parts.hhmm >= target; // lexical compare is correct for zero-padded HH:MM
}
