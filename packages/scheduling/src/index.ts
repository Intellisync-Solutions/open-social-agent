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
