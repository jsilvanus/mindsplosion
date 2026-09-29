/**
 * Recurrence for schedules and alarms: a subset of iCalendar RRULE (RFC 5545).
 *
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (weekly only, e.g. MO,WE,FR),
 * COUNT and UNTIL. The "RRULE:" prefix is optional, and the shorthands daily, weekly, weekdays,
 * monthly and yearly are accepted. Anything else is rejected so that an unsupported rule is never
 * silently ignored.
 *
 * Occurrences keep the wall-clock time of the first one in the item's IANA time zone (default UTC),
 * so a 09:00 Europe/Helsinki meeting stays at 09:00 across daylight saving changes. A monthly or
 * yearly rule skips months (or years) that do not have the start's day, as RFC 5545 does.
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Recurrence {
  freq: Frequency;
  interval: number;
  /** Weekdays for WEEKLY rules, 0 = Sunday … 6 = Saturday. */
  byDay?: number[];
  count?: number;
  until?: Date;
}

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrenceError";
  }
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const SHORTHANDS: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export function parseRecurrence(text: string): Recurrence {
  const raw = text.trim();
  const rule = SHORTHANDS[raw.toLowerCase()] ?? raw.replace(/^RRULE:/i, "");
  const parts = new Map<string, string>();
  for (const part of rule.split(";")) {
    if (!part.trim()) continue;
    const [key, value] = part.split("=");
    if (!key || value === undefined || value === "") throw new RecurrenceError(`Invalid recurrence part "${part}"`);
    parts.set(key.trim().toUpperCase(), value.trim().toUpperCase());
  }

  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    throw new RecurrenceError("Recurrence needs FREQ=DAILY, WEEKLY, MONTHLY or YEARLY");
  }
  const result: Recurrence = { freq, interval: 1 };

  for (const [key, value] of parts) {
    switch (key) {
      case "FREQ":
        break;
      case "INTERVAL": {
        const interval = Number(value);
        if (!Number.isInteger(interval) || interval < 1 || interval > 1000) throw new RecurrenceError("INTERVAL must be a positive integer");
        result.interval = interval;
        break;
      }
      case "COUNT": {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1) throw new RecurrenceError("COUNT must be a positive integer");
        result.count = count;
        break;
      }
      case "UNTIL": {
        const until = parseUntil(value);
        if (!until) throw new RecurrenceError("UNTIL must be a date (YYYYMMDD) or UTC time (YYYYMMDDTHHMMSSZ)");
        result.until = until;
        break;
      }
      case "BYDAY": {
        if (freq !== "WEEKLY") throw new RecurrenceError("BYDAY is supported only with FREQ=WEEKLY");
        const days = value.split(",").map((day) => WEEKDAYS.indexOf(day.trim()));
        if (days.some((day) => day < 0)) throw new RecurrenceError("BYDAY takes weekday codes such as MO,WE,FR");
        result.byDay = [...new Set(days)].sort((a, b) => a - b);
        break;
      }
      case "WKST":
        if (value !== "MO") throw new RecurrenceError("Only WKST=MO is supported");
        break;
      default:
        throw new RecurrenceError(`Unsupported recurrence part ${key}`);
    }
  }
  if (result.count !== undefined && result.until !== undefined) throw new RecurrenceError("Use COUNT or UNTIL, not both");
  return result;
}

function parseUntil(value: string): Date | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value);
  if (!match) return undefined;
  const [, y, m, d, hh, mm, ss] = match;
  // A date-only UNTIL includes that whole day.
  const date = hh === undefined
    ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59))
    : new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/** Throws RecurrenceError for an unknown IANA time zone. */
export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new RecurrenceError(`Unknown time zone "${timeZone}" (use an IANA name such as Europe/Helsinki)`);
  }
}

interface Wall {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function toWall(date: Date, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year!,
    month: parts.month! - 1,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
    ms: date.getUTCMilliseconds(),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const w = toWall(date, timeZone);
  return Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second, w.ms) - date.getTime();
}

/** The instant that shows as this wall-clock time in the zone (the earlier one when ambiguous). */
function fromWall(w: Wall, timeZone: string): Date {
  const guess = Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second, w.ms);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(Math.min(first, second));
}

/** Wall date plus n days, normalized (Date.UTC handles month/year overflow). */
function addDays(w: Wall, days: number): Wall {
  const d = new Date(Date.UTC(w.year, w.month, w.day + days));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

const MAX_STEPS = 100_000;

/**
 * Occurrence start times in order, beginning with `start`. Stops at COUNT/UNTIL, after `to`,
 * or after a safety limit of steps. Without a rule, yields only `start`.
 */
export function* occurrences(start: Date, rule: Recurrence | undefined, timeZone = "UTC", to?: Date): Generator<Date> {
  if (!rule) {
    if (!to || start <= to) yield start;
    return;
  }
  const base = toWall(start, timeZone);
  let emitted = 0;
  const emit = (date: Date): "ok" | "stop" => {
    if (rule.until && date > rule.until) return "stop";
    if (to && date > to) return "stop";
    if (rule.count !== undefined && emitted >= rule.count) return "stop";
    emitted += 1;
    return "ok";
  };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const candidates: Wall[] = [];
    if (rule.freq === "DAILY") {
      candidates.push(addDays(base, step * rule.interval));
    } else if (rule.freq === "WEEKLY") {
      if (!rule.byDay) {
        candidates.push(addDays(base, step * 7 * rule.interval));
      } else {
        // Weeks start on Monday; the first week is the one containing the start.
        const weekday = new Date(Date.UTC(base.year, base.month, base.day)).getUTCDay();
        const monday = addDays(base, -((weekday + 6) % 7) + step * 7 * rule.interval);
        for (const day of [...rule.byDay].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
          candidates.push(addDays(monday, (day + 6) % 7));
        }
      }
    } else if (rule.freq === "MONTHLY") {
      const months = base.month + step * rule.interval;
      const year = base.year + Math.floor(months / 12);
      const month = ((months % 12) + 12) % 12;
      if (base.day <= daysInMonth(year, month)) candidates.push({ ...base, year, month });
    } else {
      const year = base.year + step * rule.interval;
      if (base.day <= daysInMonth(year, base.month)) candidates.push({ ...base, year });
    }

    for (const wall of candidates) {
      const date = step === 0 && candidates.length === 1 ? start : fromWall(wall, timeZone);
      if (date < start) continue;
      if (emit(date) === "stop") return;
      yield date;
    }
  }
}

/** Occurrences with start in [from, to]. */
export function occurrencesBetween(start: Date, rule: Recurrence | undefined, timeZone: string | undefined, from: Date, to: Date, limit = 500): Date[] {
  const result: Date[] = [];
  for (const date of occurrences(start, rule, timeZone, to)) {
    if (date >= from) result.push(date);
    if (result.length >= limit) break;
  }
  return result;
}

/** The last occurrence at or before `at`, if any. */
export function lastOccurrenceAtOrBefore(start: Date, rule: Recurrence | undefined, timeZone: string | undefined, at: Date): Date | undefined {
  let last: Date | undefined;
  for (const date of occurrences(start, rule, timeZone, at)) last = date;
  return last;
}
