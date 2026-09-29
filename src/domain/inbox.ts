import type { Alarm, ContextTarget, Schedule, Task } from "./model.js";
import { lastOccurrenceAtOrBefore, occurrences, occurrencesBetween, parseRecurrence, type Recurrence } from "./recurrence.js";

/**
 * The inbox answers "what is going on and what is coming up": alarms that are ringing, schedules
 * happening now or starting within the horizon, and tasks that are overdue or due soon.
 * Pure function over the caller's visible items, so it is the same for stdio and HTTP.
 */

export interface InboxOptions {
  now: Date;
  /** How far ahead "upcoming" looks, in days (default 7). */
  horizonDays?: number;
  /** Upper bound on upcoming entries per list (default 50). */
  limit?: number;
}

export interface InboxAlarm {
  id: string;
  title: string;
  /** When this occurrence rang (ringing) or will ring (upcoming). */
  at: string;
  recurring: boolean;
  target?: ContextTarget;
}

export interface InboxEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  recurring: boolean;
  target?: ContextTarget;
}

export interface InboxTask {
  id: string;
  title: string;
  status: Task["status"];
  dueAt: string;
  priority?: number;
  projectId?: string;
  goalId?: string;
}

export interface Inbox {
  now: string;
  until: string;
  summary: { ringingAlarms: number; ongoing: number; upcoming: number; overdueTasks: number; dueSoonTasks: number; upcomingAlarms: number };
  alarms: { ringing: InboxAlarm[]; upcoming: InboxAlarm[] };
  schedules: { ongoing: InboxEvent[]; upcoming: InboxEvent[] };
  tasks: { overdue: InboxTask[]; dueSoon: InboxTask[] };
  /** Items whose recurrence could not be read; they are left out of the lists above. */
  problems: { type: "schedule" | "alarm"; id: string; title: string; error: string }[];
}

const DAY_MS = 86_400_000;

function rule(text: string | undefined): Recurrence | undefined {
  return text ? parseRecurrence(text) : undefined;
}

export function buildInbox(input: { schedules: Schedule[]; alarms: Alarm[]; tasks: Task[] }, options: InboxOptions): Inbox {
  const now = options.now;
  const until = new Date(now.getTime() + (options.horizonDays ?? 7) * DAY_MS);
  const limit = options.limit ?? 50;
  const problems: Inbox["problems"] = [];

  const ringing: InboxAlarm[] = [];
  const upcomingAlarms: InboxAlarm[] = [];
  for (const alarm of input.alarms) {
    let recurrence: Recurrence | undefined;
    try {
      recurrence = rule(alarm.recurrence);
    } catch (error) {
      problems.push({ type: "alarm", id: alarm.id, title: alarm.title, error: (error as Error).message });
      continue;
    }
    const base = { id: alarm.id, title: alarm.title, recurring: Boolean(recurrence), ...(alarm.target ? { target: alarm.target } : {}) };
    const start = new Date(alarm.triggerAt);
    const dismissed = alarm.dismissedAt ? new Date(alarm.dismissedAt) : undefined;

    // Ringing: the latest occurrence that has passed and was not dismissed after it rang.
    const last = lastOccurrenceAtOrBefore(start, recurrence, alarm.timezone, now);
    if (last && (!dismissed || dismissed < last)) ringing.push({ ...base, at: last.toISOString() });

    // Upcoming: only the next occurrence, so a daily alarm does not fill the inbox.
    if (!recurrence && dismissed && dismissed >= start) continue;
    for (const next of occurrences(start, recurrence, alarm.timezone, until)) {
      if (next > now) {
        upcomingAlarms.push({ ...base, at: next.toISOString() });
        break;
      }
    }
  }

  const ongoing: InboxEvent[] = [];
  const upcoming: InboxEvent[] = [];
  for (const schedule of input.schedules) {
    let recurrence: Recurrence | undefined;
    try {
      recurrence = rule(schedule.recurrence);
    } catch (error) {
      problems.push({ type: "schedule", id: schedule.id, title: schedule.title, error: (error as Error).message });
      continue;
    }
    const start = new Date(schedule.startAt);
    const duration = schedule.endAt ? new Date(schedule.endAt).getTime() - start.getTime() : 0;
    const base = { id: schedule.id, title: schedule.title, recurring: Boolean(recurrence), ...(schedule.target ? { target: schedule.target } : {}) };
    const event = (occurrence: Date): InboxEvent => ({
      ...base,
      startAt: occurrence.toISOString(),
      ...(schedule.endAt ? { endAt: new Date(occurrence.getTime() + duration).toISOString() } : {}),
    });

    if (duration > 0) {
      const current = lastOccurrenceAtOrBefore(start, recurrence, schedule.timezone, now);
      if (current && current.getTime() + duration > now.getTime()) ongoing.push(event(current));
    }
    for (const occurrence of occurrencesBetween(start, recurrence, schedule.timezone, new Date(now.getTime() + 1), until, limit)) {
      upcoming.push(event(occurrence));
    }
  }

  const overdue: InboxTask[] = [];
  const dueSoon: InboxTask[] = [];
  for (const task of input.tasks) {
    if (!task.dueAt || task.status === "done" || task.status === "cancelled") continue;
    const due = new Date(task.dueAt);
    const item: InboxTask = {
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt,
      ...(task.priority !== undefined ? { priority: task.priority } : {}),
      ...(task.projectId ? { projectId: task.projectId } : {}),
      ...(task.goalId ? { goalId: task.goalId } : {}),
    };
    if (due < now) overdue.push(item);
    else if (due <= until) dueSoon.push(item);
  }

  const byAt = (a: InboxAlarm, b: InboxAlarm) => a.at.localeCompare(b.at);
  const byStart = (a: InboxEvent, b: InboxEvent) => a.startAt.localeCompare(b.startAt);
  const byDue = (a: InboxTask, b: InboxTask) => a.dueAt.localeCompare(b.dueAt);
  ringing.sort(byAt);
  upcomingAlarms.sort(byAt);
  ongoing.sort(byStart);
  upcoming.sort(byStart);
  overdue.sort(byDue);
  dueSoon.sort(byDue);

  const alarms = { ringing, upcoming: upcomingAlarms.slice(0, limit) };
  const schedules = { ongoing, upcoming: upcoming.slice(0, limit) };
  const tasks = { overdue, dueSoon: dueSoon.slice(0, limit) };
  return {
    now: now.toISOString(),
    until: until.toISOString(),
    summary: {
      ringingAlarms: ringing.length,
      ongoing: ongoing.length,
      upcoming: schedules.upcoming.length,
      overdueTasks: overdue.length,
      dueSoonTasks: tasks.dueSoon.length,
      upcomingAlarms: alarms.upcoming.length,
    },
    alarms,
    schedules,
    tasks,
    problems,
  };
}
