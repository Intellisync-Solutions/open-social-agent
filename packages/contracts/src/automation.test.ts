import { describe, expect, it } from "vitest";
import { ComputerCallSchema, ScheduleInputSchema } from "./automation";

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

  it("bounds computer action batches and safety evidence", () => {
    expect(
      ComputerCallSchema.safeParse({
        type: "computer_call",
        call_id: "call_1",
        actions: [{ type: "screenshot" }],
        pending_safety_checks: [],
      }).success,
    ).toBe(true);
    expect(
      ComputerCallSchema.safeParse({
        type: "computer_call",
        call_id: "call_1",
        actions: Array.from({ length: 26 }, () => ({ type: "screenshot" })),
        pending_safety_checks: [],
      }).success,
    ).toBe(false);
  });
});
