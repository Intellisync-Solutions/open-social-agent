import { describe, expect, it } from "vitest";
import { ScheduleInputSchema } from "./automation";

describe("automation contracts", () => {
  it("requires a weekday for weekly schedules", () => {
    expect(
      ScheduleInputSchema.safeParse({
        name: "Weekly signal",
        cadence: "weekly",
        timezone: "America/Toronto",
        localTime: "09:30",
      }).success,
    ).toBe(false);
  });

  it("requires a cron expression for advanced schedules", () => {
    expect(
      ScheduleInputSchema.safeParse({
        name: "Advanced signal",
        cadence: "advanced",
        timezone: "America/Toronto",
        localTime: "09:30",
      }).success,
    ).toBe(false);
  });
});
