import { describe, expect, it } from "vitest";
import { buildInbox } from "../src/domain/inbox.js";
import { occurrencesBetween, parseRecurrence, RecurrenceError, lastOccurrenceAtOrBefore } from "../src/domain/recurrence.js";
import type { Alarm, Schedule, Task } from "../src/domain/model.js";

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("recurrence", () => {
  it("parses shorthands and RRULE subsets", () => {
    expect(parseRecurrence("daily")).toEqual({ freq: "DAILY", interval: 1 });
    expect(parseRecurrence("weekdays")).toEqual({ freq: "WEEKLY", interval: 1, byDay: [1, 2, 3, 4, 5] });
    expect(parseRecurrence("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,MO;COUNT=4")).toEqual({ freq: "WEEKLY", interval: 2, byDay: [1, 4], count: 4 });
  });

  it("rejects what it does not support", () => {
    expect(() => parseRecurrence("FREQ=HOURLY")).toThrow(RecurrenceError);
    expect(() => parseRecurrence("FREQ=MONTHLY;BYMONTHDAY=1")).toThrow(RecurrenceError);
    expect(() => parseRecurrence("FREQ=DAILY;BYDAY=MO")).toThrow(RecurrenceError);
    expect(() => parseRecurrence("FREQ=DAILY;COUNT=2;UNTIL=20260101")).toThrow(RecurrenceError);
  });

  it("keeps the wall-clock time across a daylight saving change", () => {
    // 09:00 in Helsinki: UTC+3 in summer, UTC+2 after 2026-10-25.
    const start = new Date("2026-10-23T06:00:00Z");
    const dates = occurrencesBetween(start, parseRecurrence("daily"), "Europe/Helsinki", start, new Date("2026-10-27T00:00:00Z"));
    expect(iso(dates)).toEqual([
      "2026-10-23T06:00:00.000Z",
      "2026-10-24T06:00:00.000Z",
      "2026-10-25T07:00:00.000Z",
      "2026-10-26T07:00:00.000Z",
    ]);
  });

  it("expands weekly BYDAY, INTERVAL and COUNT", () => {
    // Monday 2026-09-28 10:00 UTC, every second week on Monday and Thursday, four times.
    const start = new Date("2026-09-28T10:00:00Z");
    const dates = occurrencesBetween(start, parseRecurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=4"), "UTC", start, new Date("2027-01-01T00:00:00Z"));
    expect(iso(dates)).toEqual([
      "2026-09-28T10:00:00.000Z",
      "2026-10-01T10:00:00.000Z",
      "2026-10-12T10:00:00.000Z",
      "2026-10-15T10:00:00.000Z",
    ]);
  });

  it("skips months without the start day and stops at UNTIL", () => {
    const start = new Date("2026-01-31T12:00:00Z");
    const dates = occurrencesBetween(start, parseRecurrence("FREQ=MONTHLY;UNTIL=20260630"), "UTC", start, new Date("2027-01-01T00:00:00Z"));
    expect(iso(dates)).toEqual(["2026-01-31T12:00:00.000Z", "2026-03-31T12:00:00.000Z", "2026-05-31T12:00:00.000Z"]);
  });

  it("finds the last occurrence before a time", () => {
    const start = new Date("2026-09-01T08:00:00Z");
    expect(lastOccurrenceAtOrBefore(start, parseRecurrence("daily"), "UTC", new Date("2026-09-10T07:59:00Z"))?.toISOString()).toBe("2026-09-09T08:00:00.000Z");
    expect(lastOccurrenceAtOrBefore(start, undefined, "UTC", new Date("2026-08-01T00:00:00Z"))).toBeUndefined();
  });
});

describe("inbox", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const base = { createdByPrincipalId: "p", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
  const alarm = (a: Partial<Alarm> & Pick<Alarm, "id" | "triggerAt">): Alarm => ({ title: a.id, ...base, ...a });
  const schedule = (s: Partial<Schedule> & Pick<Schedule, "id" | "startAt">): Schedule => ({ title: s.id, ...base, ...s });
  const task = (t: Partial<Task> & Pick<Task, "id">): Task => ({ title: t.id, status: "todo", ...base, ...t });

  it("sorts alarms, schedules and tasks into what is now and what is coming", () => {
    const inbox = buildInbox({
      alarms: [
        alarm({ id: "rang", triggerAt: "2026-09-29T09:00:00Z" }),
        alarm({ id: "dismissed", triggerAt: "2026-09-29T09:00:00Z", dismissedAt: "2026-09-29T10:00:00Z" }),
        alarm({ id: "daily", triggerAt: "2026-09-01T08:00:00Z", recurrence: "daily", dismissedAt: "2026-09-28T09:00:00Z" }),
        alarm({ id: "later", triggerAt: "2026-10-02T09:00:00Z" }),
        alarm({ id: "far", triggerAt: "2026-12-01T09:00:00Z" }),
      ],
      schedules: [
        schedule({ id: "meeting", startAt: "2026-09-29T11:30:00Z", endAt: "2026-09-29T12:30:00Z" }),
        schedule({ id: "standup", startAt: "2026-09-01T07:00:00Z", endAt: "2026-09-01T07:15:00Z", recurrence: "weekdays" }),
        schedule({ id: "bad", startAt: "2026-09-01T07:00:00Z", recurrence: "FREQ=HOURLY" }),
      ],
      tasks: [
        task({ id: "late", dueAt: "2026-09-28T00:00:00Z" }),
        task({ id: "soon", dueAt: "2026-10-01T00:00:00Z" }),
        task({ id: "done", dueAt: "2026-09-28T00:00:00Z", status: "done" }),
        task({ id: "undated" }),
      ],
    }, { now, horizonDays: 7 });

    expect(inbox.alarms.ringing.map((a) => a.id)).toEqual(["daily", "rang"]);
    expect(inbox.alarms.ringing.find((a) => a.id === "daily")?.at).toBe("2026-09-29T08:00:00.000Z");
    expect(inbox.alarms.upcoming.map((a) => a.id)).toEqual(["daily", "later"]);
    expect(inbox.schedules.ongoing.map((s) => s.id)).toEqual(["meeting"]);
    // Weekdays from Wed 30 Sep to Tue 6 Oct: Wed, Thu, Fri, Mon, Tue.
    expect(inbox.schedules.upcoming.filter((s) => s.id === "standup").map((s) => s.startAt.slice(0, 10))).toEqual([
      "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06",
    ]);
    expect(inbox.schedules.upcoming[0]?.endAt).toBe("2026-09-30T07:15:00.000Z");
    expect(inbox.tasks.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(inbox.tasks.dueSoon.map((t) => t.id)).toEqual(["soon"]);
    expect(inbox.problems).toEqual([{ type: "schedule", id: "bad", title: "bad", error: expect.stringContaining("FREQ") }]);
    expect(inbox.summary.ringingAlarms).toBe(2);
  });
});
