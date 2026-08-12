import { describe, expect, it } from "vitest";
import { nextOccurrence, occurrenceKey, toCronPattern } from "./index";

const daily = {
  name: "Daily signal",
  cadence: "daily" as const,
  timezone: "America/Toronto",
  localTime: "09:30",
};

describe("deterministic scheduling", () => {
  it("preserves local wall time across spring daylight-saving transition", () => {
    const next = nextOccurrence(daily, Date.parse("2026-03-07T15:00:00Z"));
    expect(new Date(next).toISOString()).toBe("2026-03-08T13:30:00.000Z");
  });

  it("preserves local wall time across fall daylight-saving transition", () => {
    const next = nextOccurrence(daily, Date.parse("2026-10-31T14:00:00Z"));
    expect(new Date(next).toISOString()).toBe("2026-11-01T14:30:00.000Z");
  });

  it("builds a weekly five-field cron pattern", () => {
    expect(
      toCronPattern({ ...daily, cadence: "weekly", weekday: 2 }),
    ).toBe("30 9 * * 2");
  });

  it("rejects advanced cron with a seconds field", () => {
    expect(() =>
      toCronPattern({
        ...daily,
        cadence: "advanced",
        advancedCron: "0 30 9 * * *",
      }),
    ).toThrow("SCHEDULE_CRON_INVALID");
  });

  it("derives a stable occurrence key", () => {
    expect(occurrenceKey("schedule-1", 1_800_000, 3)).toBe(
      "schedule-1:1800000:3",
    );
  });
});
