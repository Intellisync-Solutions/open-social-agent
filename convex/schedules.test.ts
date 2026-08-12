import type { AutomationProfileInput } from "@open-social-agent/contracts";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "./schema";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}).glob("./**/*.ts");
const profileInput: AutomationProfileInput = {
  name: "Build with Evidence",
  destination: {
    feedUrl: "https://social.example/feed/acme",
    allowedOrigin: "https://social.example",
  },
  content: {
    topics: ["AI operations"],
    persona: "Evidence-led operator",
    tone: "Clear",
    style: "Concise",
    structure: "Claim, evidence, implication",
    customInstructions: "Do not overclaim.",
    exclusions: ["unsupported claims"],
  },
  research: {
    webSearchEnabled: true,
    allowedDomains: ["openai.com"],
    citationsRequired: true,
    freshnessDays: 7,
    maxSources: 8,
  },
  model: {
    provider: "openai",
    preset: "balanced",
    modelId: "configured-at-runtime",
    reasoningEffort: "medium",
    maxOutputTokens: 1_200,
    perRunTokenGate: 12_000,
    dailyTokenGate: 50_000,
  },
};

const createProfile = makeFunctionReference<"mutation">(
  "automationProfiles:createMine",
);
const createSchedule = makeFunctionReference<"mutation">(
  "schedules:createMine",
);
const runNow = makeFunctionReference<"mutation">("schedules:runNowMine");
const enqueueDue = makeFunctionReference<
  "mutation",
  { now: number; limit: number },
  { created: number; advanced: number }
>("schedules:enqueueDue");
const listProfiles = makeFunctionReference<"query">(
  "automationProfiles:listMine",
);
const saveModelResult = makeFunctionReference<"mutation">(
  "outputs:saveModelResultMine",
);
const reviseOutput = makeFunctionReference<"mutation">("outputs:reviseMine");

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  const aliceId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "alice@example.com" }),
  );
  const bobId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "bob@example.com" }),
  );
  return {
    t,
    alice: t.withIdentity({ subject: String(aliceId), issuer: "test" }),
    bob: t.withIdentity({ subject: String(bobId), issuer: "test" }),
  };
}

describe("auth-scoped automation persistence", () => {
  it("keeps profiles isolated by authenticated user", async () => {
    const { alice, bob } = await authenticatedTest();
    await alice.mutation(createProfile, profileInput);
    expect(await alice.query(listProfiles, { status: "active" })).toHaveLength(
      1,
    );
    expect(await bob.query(listProfiles, { status: "active" })).toHaveLength(0);
  });

  it("creates one idempotent manual run with an immutable snapshot", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const requestId = "manual-request-0001";
    const first = await alice.mutation(runNow, { scheduleId, requestId });
    const second = await alice.mutation(runNow, { scheduleId, requestId });
    expect(second).toBe(first);
    const persisted = await t.run(async (ctx) => await ctx.db.get("runs", first));
    expect(persisted?.state).toBe("queued");
    expect(JSON.parse(persisted?.configurationSnapshotJson ?? "{}")).toMatchObject(
      {
        schemaVersion: 1,
        profileRevision: 1,
        scheduleRevision: 1,
        profile: { name: profileInput.name },
        schedule: { name: "Daily signal" },
      },
    );
  });

  it("does not let another user run a schedule", async () => {
    const { alice, bob } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    await expect(
      bob.mutation(runNow, {
        scheduleId,
        requestId: "manual-request-0002",
      }),
    ).rejects.toThrow("SCHEDULE_NOT_RUNNABLE");
  });

  it("enqueues one run per due occurrence and advances the schedule", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const dueAt = Date.parse("2026-08-12T13:30:00Z");
    await t.run(async (ctx) => {
      await ctx.db.patch(scheduleId, { status: "active", nextRunAt: dueAt });
    });
    expect(
      await t.mutation(enqueueDue, { now: dueAt + 1, limit: 10 }),
    ).toEqual({ created: 1, advanced: 1 });
    expect(
      await t.mutation(enqueueDue, { now: dueAt + 1, limit: 10 }),
    ).toEqual({ created: 0, advanced: 0 });
    const runs = await t.run(async (ctx) =>
      await ctx.db
        .query("runs")
        .withIndex("by_scheduleId", (q) => q.eq("scheduleId", scheduleId))
        .take(2),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.scheduledFor).toBe(dueAt);
  });

  it("preserves original model output while user edits create revisions", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const runId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-request-output-0001",
    });
    const outputId = await alice.mutation(saveModelResult, {
      runId,
      executionJson: JSON.stringify({
        responseId: "resp_test",
        requestedModel: "gpt-5.6-terra",
        actualModel: "gpt-5.6-terra",
        output: {
          body: "Original model output.",
          assumptions: [],
          riskFlags: [],
          sourceMap: [],
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        latencyMs: 25,
        requestId: "req_test",
      }),
    });
    expect(
      await alice.mutation(reviseOutput, {
        outputId,
        body: "User-edited revision.",
      }),
    ).toBe(2);
    const state = await t.run(async (ctx) => ({
      output: await ctx.db.get("outputs", outputId),
      revisions: await ctx.db
        .query("outputRevisions")
        .withIndex("by_outputId_and_revision", (q) =>
          q.eq("outputId", outputId),
        )
        .take(3),
      run: await ctx.db.get("runs", runId),
    }));
    expect(state.output?.original.body).toBe("Original model output.");
    expect(state.output?.currentRevision).toBe(2);
    expect(state.revisions.map((item) => item.body)).toEqual([
      "Original model output.",
      "User-edited revision.",
    ]);
    expect(state.run?.state).toBe("awaiting_approval");
  });
});
