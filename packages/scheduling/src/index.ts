import {
  ScheduleInputSchema,
  type ScheduleInput,
} from "@open-social-agent/contracts";
import { Cron } from "croner";

export function toCronPattern(input: ScheduleInput): string {
  const parsed = ScheduleInputSchema.parse(input);
  if (parsed.cadence === "advanced") {
    const fields = parsed.advancedCron?.trim().split(/\s+/) ?? [];
    if (fields.length !== 5) {
      throw new Error("SCHEDULE_CRON_INVALID");
    }
    return fields.join(" ");
  }
  const [hour, minute] = parsed.localTime.split(":").map(Number);
  return parsed.cadence === "weekly"
    ? `${minute} ${hour} * * ${parsed.weekday}`
    : `${minute} ${hour} * * *`;
}

export function nextOccurrence(
  input: ScheduleInput,
  afterEpochMs: number,
): number {
  const parsed = ScheduleInputSchema.parse(input);
  let cron: Cron;
  try {
    cron = new Cron(toCronPattern(parsed), {
      timezone: parsed.timezone,
      catch: false,
    });
  } catch {
    throw new Error("SCHEDULE_CRON_INVALID");
  }
  const next = cron.nextRun(new Date(afterEpochMs));
  if (!next) throw new Error("SCHEDULE_NEXT_RUN_UNAVAILABLE");
  return next.getTime();
}

export function latestDueOccurrence(
  input: ScheduleInput,
  earliestDueAt: number,
  now: number,
): { scheduledFor: number; nextRunAt: number; skipped: number } {
  const parsed = ScheduleInputSchema.parse(input);
  if (
    !Number.isSafeInteger(earliestDueAt) ||
    !Number.isSafeInteger(now) ||
    earliestDueAt > now
  ) {
    throw new Error("SCHEDULE_DUE_WINDOW_INVALID");
  }
  let cron: Cron;
  try {
    cron = new Cron(toCronPattern(parsed), {
      timezone: parsed.timezone,
      catch: false,
    });
  } catch {
    throw new Error("SCHEDULE_CRON_INVALID");
  }
  const latest = cron.previousRuns(1, new Date(now + 1_000))[0];
  const scheduledFor =
    latest && latest.getTime() >= earliestDueAt
      ? latest.getTime()
      : earliestDueAt;
  const nextRunAt = nextOccurrence(parsed, scheduledFor);
  const skipped = countOccurrencesBetween(cron, earliestDueAt, scheduledFor);
  return { scheduledFor, nextRunAt, skipped };
}

function countOccurrencesBetween(
  cron: Cron,
  earliestDueAt: number,
  scheduledFor: number,
) {
  if (scheduledFor <= earliestDueAt) return 0;
  const previous = cron.previousRuns(101, new Date(scheduledFor + 1_000));
  const count = previous.filter(
    (item) => item.getTime() >= earliestDueAt,
  ).length;
  return Math.max(0, Math.min(100, count - 1));
}

export function occurrenceKey(
  scheduleId: string,
  scheduledFor: number,
  revision: number,
): string {
  if (!scheduleId || !Number.isSafeInteger(scheduledFor) || revision < 1) {
    throw new Error("SCHEDULE_OCCURRENCE_INVALID");
  }
  return `${scheduleId}:${scheduledFor}:${revision}`;
}
