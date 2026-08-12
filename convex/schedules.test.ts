import type { AutomationProfileInput } from "@open-social-agent/contracts";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "./schema";

const modules = (
  import.meta as ImportMeta & {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.ts");
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
  { now?: number; limit?: number },
  { created: number; advanced: number; skipped: number }
>("schedules:enqueueDue");
const listProfiles = makeFunctionReference<"query">(
  "automationProfiles:listMine",
);
const saveHarnessResult = makeFunctionReference<"mutation">(
  "outputs:saveHarnessResultInternal",
);
const reviseOutput = makeFunctionReference<"mutation">("outputs:reviseMine");
const setOutputArchived = makeFunctionReference<"mutation">(
  "outputs:setArchivedMine",
);
const purgeOutput = makeFunctionReference<"mutation">("outputs:purgeMine");
const decideApproval = makeFunctionReference<"mutation">(
  "approvals:decideMine",
);
const recordReceipt = makeFunctionReference<"mutation">(
  "receipts:recordVerified",
);
const provisionRunner = makeFunctionReference<"mutation">(
  "runners:provisionMine",
);
const listRunners = makeFunctionReference<"query">("runners:listMine");
const claimApproved = makeFunctionReference<"mutation">(
  "runners:claimApprovedInternal",
);
const claimQueued = makeFunctionReference<"mutation">(
  "runners:claimQueuedInternal",
);
const listWorkbenchRuns = makeFunctionReference<"query">(
  "workbench:listRunsMine",
);
const listWorkbenchDrafts = makeFunctionReference<"query">(
  "workbench:listDraftsMine",
);
const getWorkbenchDashboard = makeFunctionReference<"query">(
  "workbench:getDashboardMine",
);
const setRunArchived = makeFunctionReference<"mutation">(
  "runHistory:setArchivedMine",
);
const cancelRun = makeFunctionReference<"mutation">("runHistory:cancelMine");
const purgeRun = makeFunctionReference<"mutation">("runHistory:purgeMine");

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  const aliceId = await t.run(
    async (ctx) => await ctx.db.insert("users", { email: "alice@example.com" }),
  );
  const bobId = await t.run(
    async (ctx) => await ctx.db.insert("users", { email: "bob@example.com" }),
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
    const persisted = await t.run(
      async (ctx) => await ctx.db.get("runs", first),
    );
    expect(persisted?.state).toBe("queued");
    expect(
      JSON.parse(persisted?.configurationSnapshotJson ?? "{}"),
    ).toMatchObject({
      schemaVersion: 1,
      profileRevision: 1,
      scheduleRevision: 1,
      profile: { name: profileInput.name },
      schedule: { name: "Daily signal" },
    });
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

  it("cancels, archives, restores, and explicitly purges an evidence-free run", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Disposable dry run",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const runId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-disposable-history-01",
    });
    await alice.mutation(cancelRun, { runId });
    await alice.mutation(setRunArchived, { runId, archived: true });
    await alice.mutation(setRunArchived, { runId, archived: false });
    await alice.mutation(setRunArchived, { runId, archived: true });
    const run = await t.run(async (ctx) => await ctx.db.get("runs", runId));
    await alice.mutation(purgeRun, {
      runId,
      confirmTrace: run!.traceId.slice(0, 12),
    });
    expect(await t.run(async (ctx) => await ctx.db.get("runs", runId))).toBeNull();
  });

  it("blocks a claim before paid work when the UTC daily gate cannot cover one run", async () => {
    const { alice, t } = await authenticatedTest();
    const constrainedProfile = {
      ...profileInput,
      model: {
        ...profileInput.model,
        maxOutputTokens: 256,
        perRunTokenGate: 256,
        dailyTokenGate: 256,
      },
    };
    const profileId = await alice.mutation(createProfile, constrainedProfile);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily gate",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const firstRunId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-daily-gate-first-01",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", firstRunId),
    ))!.userId;
    await t.run(async (ctx) => {
      await ctx.db.patch(firstRunId, { state: "cancelled" });
      await ctx.db.insert("outputs", {
        userId,
        runId: firstRunId,
        original: {
          body: "Prior usage.",
          assumptions: [],
          riskFlags: [],
          sourceMap: [],
        },
        originalHash: "a".repeat(64),
        currentRevision: 1,
        status: "active",
        providerResponseId: "resp_prior_usage",
        requestedModel: "configured-at-runtime",
        actualModel: "configured-at-runtime",
        inputTokens: 1,
        outputTokens: 0,
        totalTokens: 1,
        latencyMs: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const secondRunId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-daily-gate-second-01",
    });
    const runner = await alice.mutation(provisionRunner, {
      label: "Daily gate runner",
    });
    expect(
      await t.mutation(claimQueued, {
        registrationId: runner.registrationId,
        userId,
        runnerId: runner.runnerId,
        requestId: "claim-daily-gate-second-01",
        now: Date.now(),
      }),
    ).toBeNull();
    expect(
      (await t.run(async (ctx) => await ctx.db.get("runs", secondRunId)))?.state,
    ).toBe("blocked");
    expect(
      (await t.run(async (ctx) => await ctx.db.get("runs", secondRunId)))
        ?.blockedCode,
    ).toBe("DAILY_TOKEN_GATE_REACHED");
  });

  it("allows only one active generation lease per operator", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Single lease",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const firstRunId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-single-lease-first-01",
    });
    const secondRunId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-single-lease-second-01",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", firstRunId),
    ))!.userId;
    const firstRunner = await alice.mutation(provisionRunner, {
      label: "First lease runner",
    });
    const secondRunner = await alice.mutation(provisionRunner, {
      label: "Second lease runner",
    });
    const now = Date.now();
    expect(
      await t.mutation(claimQueued, {
        registrationId: firstRunner.registrationId,
        userId,
        runnerId: firstRunner.runnerId,
        requestId: "claim-single-lease-first-01",
        now,
      }),
    ).toMatchObject({ runId: firstRunId });
    expect(
      await t.mutation(claimQueued, {
        registrationId: secondRunner.registrationId,
        userId,
        runnerId: secondRunner.runnerId,
        requestId: "claim-single-lease-second-01",
        now,
      }),
    ).toBeNull();
    expect(
      (await t.run(async (ctx) => await ctx.db.get("runs", secondRunId)))?.state,
    ).toBe("queued");
  });

  it("keeps composed workbench views isolated by authenticated user", async () => {
    const { alice, bob, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Private signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const runId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-private-workbench-01",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const runner = await alice.mutation(provisionRunner, {
      label: "Private workbench runner",
    });
    const executionRequestId = "private-workbench-harness-01";
    await t.mutation(claimQueued, {
      registrationId: runner.registrationId,
      userId,
      runnerId: runner.runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    });
    await t.mutation(saveHarnessResult, {
      userId,
      runId,
      runnerRegistrationId: runner.registrationId,
      executionRequestId,
      executionJson: harnessJson("Alice private AI operations draft."),
    });

    expect(await alice.query(listWorkbenchRuns, { limit: 10 })).toHaveLength(1);
    expect(await bob.query(listWorkbenchRuns, { limit: 10 })).toHaveLength(0);
    expect(
      await alice.query(listWorkbenchDrafts, { status: "active" }),
    ).toHaveLength(1);
    expect(await bob.query(listWorkbenchDrafts, { status: "active" })).toEqual(
      [],
    );
    expect(await bob.query(getWorkbenchDashboard, {})).toMatchObject({
      activeProfiles: 0,
      activeSchedules: 0,
      draftsAwaitingApproval: 0,
      liveReceipts: 0,
      recentRuns: [],
    });
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
    expect(await t.mutation(enqueueDue, { now: dueAt + 1, limit: 10 })).toEqual(
      { created: 1, advanced: 1, skipped: 0 },
    );
    expect(await t.mutation(enqueueDue, { now: dueAt + 1, limit: 10 })).toEqual(
      { created: 0, advanced: 0, skipped: 0 },
    );
    const runs = await t.run(
      async (ctx) =>
        await ctx.db
          .query("runs")
          .withIndex("by_scheduleId", (q) => q.eq("scheduleId", scheduleId))
          .take(2),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.scheduledFor).toBe(dueAt);
  });

  it("coalesces downtime into one latest due run instead of replaying backlog", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily signal",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const earliestDueAt = Date.parse("2026-08-10T13:30:00Z");
    const now = Date.parse("2026-08-12T15:00:00Z");
    await t.run(async (ctx) => {
      await ctx.db.patch(scheduleId, {
        status: "active",
        nextRunAt: earliestDueAt,
      });
    });
    expect(await t.mutation(enqueueDue, { now, limit: 10 })).toEqual({
      created: 1,
      advanced: 1,
      skipped: 2,
    });
    const runs = await t.run(
      async (ctx) =>
        await ctx.db
          .query("runs")
          .withIndex("by_scheduleId", (q) => q.eq("scheduleId", scheduleId))
          .take(10),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]?.scheduledFor).toBe(Date.parse("2026-08-12T13:30:00Z"));
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
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const runner = await alice.mutation(provisionRunner, {
      label: "Harness runner",
    });
    const harnessRequest = "harness-request-output-01";
    await t.mutation(claimQueued, {
      registrationId: runner.registrationId,
      userId,
      runnerId: runner.runnerId,
      requestId: harnessRequest,
      now: Date.now(),
    });
    const outputId = (
      await t.mutation(saveHarnessResult, {
        userId,
        runId,
        runnerRegistrationId: runner.registrationId,
        executionRequestId: harnessRequest,
        executionJson: harnessJson("AI operations original model output."),
      })
    ).outputId;
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
    expect(state.output?.original.body).toBe(
      "AI operations original model output.",
    );
    expect(state.output?.currentRevision).toBe(2);
    expect(state.revisions.map((item) => item.body)).toEqual([
      "AI operations original model output.",
      "User-edited revision.",
    ]);
    expect(state.run?.state).toBe("awaiting_approval");
  });

  it("purges an unapproved output without leaving dependent evidence dangling", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Purge draft",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const runId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-purge-output-run-01",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const runner = await alice.mutation(provisionRunner, {
      label: "Purge output runner",
    });
    const executionRequestId = "claim-purge-output-run-01";
    await t.mutation(claimQueued, {
      registrationId: runner.registrationId,
      userId,
      runnerId: runner.runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    });
    const outputId = (
      await t.mutation(saveHarnessResult, {
        userId,
        runId,
        runnerRegistrationId: runner.registrationId,
        executionRequestId,
        executionJson: harnessJson("AI operations purgeable draft."),
      })
    ).outputId;
    const output = await t.run(
      async (ctx) => await ctx.db.get("outputs", outputId),
    );
    await alice.mutation(setOutputArchived, { outputId, archived: true });
    await alice.mutation(purgeOutput, {
      outputId,
      confirmHash: output!.originalHash.slice(0, 12),
    });
    const state = await t.run(async (ctx) => ({
      run: await ctx.db.get("runs", runId),
      output: await ctx.db.get("outputs", outputId),
      tool: await ctx.db
        .query("toolExecutions")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .first(),
      evidence: await ctx.db
        .query("evidenceItems")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .first(),
      evaluation: await ctx.db
        .query("evaluations")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .first(),
    }));
    expect(state.output).toBeNull();
    expect(state.tool).toBeNull();
    expect(state.evidence).toBeNull();
    expect(state.evaluation).toBeNull();
    expect(state.run).toMatchObject({
      state: "cancelled",
      blockedCode: "OUTPUT_PURGED_BY_USER",
    });
  });

  it("persists research evidence and blocks a failed deterministic evaluation", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, {
      profileId,
      name: "Daily",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    });
    const runId = await alice.mutation(runNow, {
      scheduleId,
      requestId: "manual-harness-result-01",
    });
    const evidenceId = "ev_0123456789abcdef";
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const runner = await alice.mutation(provisionRunner, {
      label: "Harness runner",
    });
    const harnessRequest = "harness-request-blocked-01";
    await t.mutation(claimQueued, {
      registrationId: runner.registrationId,
      userId,
      runnerId: runner.runnerId,
      requestId: harnessRequest,
      now: Date.now(),
    });
    const result = await t.mutation(saveHarnessResult, {
      userId,
      runnerRegistrationId: runner.registrationId,
      executionRequestId: harnessRequest,
      runId,
      executionJson: JSON.stringify({
        research: {
          responseId: "resp_research",
          requestedModel: "gpt-5.6-terra",
          actualModel: "gpt-5.6-terra",
          brief: "AI operations evidence.",
          evidence: [
            {
              id: evidenceId,
              url: "https://openai.com/news",
              title: "OpenAI news",
              domain: "openai.com",
              retrievedAt: Date.now(),
              publishedAt: null,
              contentHash: "a".repeat(64),
            },
          ],
          queries: ["AI operations"],
          toolCalls: 1,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          latencyMs: 20,
          requestId: "req_research",
        },
        composition: {
          responseId: "resp_compose",
          requestedModel: "gpt-5.6-terra",
          actualModel: "gpt-5.6-terra",
          output: {
            body: "AI operations unsupported claims evidence.",
            assumptions: [],
            riskFlags: [],
            sourceMap: [
              {
                claim: "AI operations unsupported claims evidence.",
                evidenceIds: [evidenceId],
              },
            ],
          },
          usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
          latencyMs: 30,
          requestId: "req_compose",
        },
        evaluation: {
          state: "blocked",
          codes: ["EXCLUSION_VIOLATION"],
          warnings: ["FRESHNESS_UNVERIFIED"],
          duplicateScore: 0,
          citedEvidenceIds: [evidenceId],
        },
      }),
    });
    expect(result.state).toBe("blocked");
    const persisted = await t.run(async (ctx) => ({
      run: await ctx.db.get("runs", runId),
      tools: await ctx.db
        .query("toolExecutions")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .take(2),
      evidence: await ctx.db
        .query("evidenceItems")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .take(2),
      evaluation: await ctx.db
        .query("evaluations")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .unique(),
    }));
    expect(persisted.run?.state).toBe("blocked");
    expect(persisted.tools[0]).toMatchObject({
      tool: "web_search",
      totalTokens: 15,
    });
    expect(persisted.evidence[0]).toMatchObject({ evidenceId });
    expect(persisted.evidence[0]).not.toHaveProperty("publishedAt");
    expect(persisted.evaluation).toMatchObject({
      codes: ["EXCLUSION_VIOLATION"],
      warnings: ["FRESHNESS_UNVERIFIED"],
    });
  });

  it("rejects stale approval after an output edit", async () => {
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
      requestId: "manual-request-approval-01",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const runner = await alice.mutation(provisionRunner, {
      label: "Harness runner",
    });
    const harnessRequest = "harness-request-stale-01";
    await t.mutation(claimQueued, {
      registrationId: runner.registrationId,
      userId,
      runnerId: runner.runnerId,
      requestId: harnessRequest,
      now: Date.now(),
    });
    const outputId = (
      await t.mutation(saveHarnessResult, {
        userId,
        runId,
        runnerRegistrationId: runner.registrationId,
        executionRequestId: harnessRequest,
        executionJson: harnessJson("AI operations original."),
      })
    ).outputId;
    const original = await t.run(
      async (ctx) =>
        await ctx.db
          .query("outputRevisions")
          .withIndex("by_outputId_and_revision", (q) =>
            q.eq("outputId", outputId).eq("revision", 1),
          )
          .unique(),
    );
    await alice.mutation(reviseOutput, { outputId, body: "Edited." });
    await expect(
      alice.mutation(decideApproval, {
        runId,
        outputId,
        revision: 1,
        bodyHash: original!.bodyHash,
        destinationUrl: profileInput.destination.feedUrl,
        expiresAt: Date.now() + 60_000,
        decision: "approved",
      }),
    ).rejects.toThrow("APPROVAL_STALE");
  });

  it("records terminal evidence only against the exact approved revision", async () => {
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
      requestId: "manual-request-receipt-01",
    });
    const ownerId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const harnessRunner = await alice.mutation(provisionRunner, {
      label: "Harness runner",
    });
    const harnessRequest = "harness-request-receipt-01";
    await t.mutation(claimQueued, {
      registrationId: harnessRunner.registrationId,
      userId: ownerId,
      runnerId: harnessRunner.runnerId,
      requestId: harnessRequest,
      now: Date.now(),
    });
    const outputId = (
      await t.mutation(saveHarnessResult, {
        userId: ownerId,
        runId,
        runnerRegistrationId: harnessRunner.registrationId,
        executionRequestId: harnessRequest,
        executionJson: harnessJson("AI operations approved body."),
      })
    ).outputId;
    const revision = await t.run(
      async (ctx) =>
        await ctx.db
          .query("outputRevisions")
          .withIndex("by_outputId_and_revision", (q) =>
            q.eq("outputId", outputId).eq("revision", 1),
          )
          .unique(),
    );
    const approvalId = await alice.mutation(decideApproval, {
      runId,
      outputId,
      revision: 1,
      bodyHash: revision!.bodyHash,
      destinationUrl: profileInput.destination.feedUrl,
      expiresAt: Date.now() + 60_000,
      decision: "approved",
    });
    const userId = (await t.run(
      async (ctx) => await ctx.db.get("runs", runId),
    ))!.userId;
    const provisioned = await alice.mutation(provisionRunner, {
      label: "Test runner",
    });
    const { runnerId, registrationId } = provisioned;
    const listedRunners = await alice.query(listRunners, {});
    expect(listedRunners).toHaveLength(2);
    for (const listed of listedRunners) {
      expect(listed).not.toHaveProperty("tokenHash");
    }
    const executionRequestId = "execution-request-0001";
    const claim = await t.mutation(claimApproved, {
      registrationId,
      userId,
      runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    });
    expect(claim).toMatchObject({ runId, approvalId });
    expect(
      await t.mutation(claimApproved, {
        registrationId,
        userId,
        runnerId,
        requestId: executionRequestId,
        now: Date.now(),
      }),
    ).toEqual(claim);
    await expect(
      t.mutation(recordReceipt, {
        userId,
        runId,
        approvalId,
        runnerRegistrationId: registrationId,
        executionRequestId,
        state: "live",
        destinationUrl: profileInput.destination.feedUrl,
        bodyHash: revision!.bodyHash,
        directUrl: "https://attacker.example/post/receipt-1",
        requestedModel: "gpt-5.6",
        actualModel: "gpt-5.6-2026-08-01",
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
        turns: 2,
        actionsExecuted: 3,
      }),
    ).rejects.toThrow("DIRECT_VERIFICATION_REQUIRED");
    await t.mutation(recordReceipt, {
      userId,
      runId,
      approvalId,
      runnerRegistrationId: registrationId,
      executionRequestId,
      state: "live",
      destinationUrl: profileInput.destination.feedUrl,
      bodyHash: revision!.bodyHash,
      directUrl: "https://social.example/feed/acme/post/receipt-1",
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-2026-08-01",
      inputTokens: 20,
      outputTokens: 5,
      totalTokens: 25,
      turns: 2,
      actionsExecuted: 3,
    });
    const state = await t.run(async (ctx) => ({
      run: await ctx.db.get("runs", runId),
      receipt: await ctx.db
        .query("publicationReceipts")
        .withIndex("by_runId", (q) => q.eq("runId", runId))
        .unique(),
    }));
    expect(state.run?.state).toBe("live");
    expect(state.receipt?.verifiedAt).toBeTypeOf("number");
    expect(state.receipt?.directUrl).toContain("/post/receipt-1");
    expect(state.receipt).toMatchObject({
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-2026-08-01",
      totalTokens: 25,
      turns: 2,
      actionsExecuted: 3,
    });
    expect(
      await t.mutation(claimApproved, {
        registrationId,
        userId,
        runnerId,
        requestId: executionRequestId,
        now: Date.now(),
      }),
    ).toBeNull();
    await alice.mutation(setOutputArchived, { outputId, archived: true });
    const output = await t.run(
      async (ctx) => await ctx.db.get("outputs", outputId),
    );
    await expect(
      alice.mutation(purgeOutput, {
        outputId,
        confirmHash: output!.originalHash.slice(0, 12),
      }),
    ).rejects.toThrow("OUTPUT_HAS_APPROVAL");
  });
});

function harnessJson(body: string) {
  const evidenceId = "ev_0123456789abcdef";
  const retrievedAt = Date.now();
  return JSON.stringify({
    research: {
      responseId: "resp_research",
      requestedModel: "gpt-5.6-terra",
      actualModel: "gpt-5.6-terra",
      brief: "Grounded evidence.",
      evidence: [
        {
          id: evidenceId,
          url: "https://openai.com/news",
          title: "OpenAI news",
          domain: "openai.com",
          retrievedAt,
          publishedAt: retrievedAt,
          contentHash: "a".repeat(64),
        },
      ],
      queries: ["AI operations"],
      toolCalls: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      requestId: "req_research",
    },
    composition: {
      responseId: "resp_test",
      requestedModel: "gpt-5.6-terra",
      actualModel: "gpt-5.6-terra",
      output: {
        body,
        assumptions: [],
        riskFlags: [],
        sourceMap: [{ claim: body, evidenceIds: [evidenceId] }],
      },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: 10,
      requestId: "req_test",
    },
    evaluation: {
      state: "passed",
      codes: [],
      warnings: [],
      duplicateScore: 0,
      citedEvidenceIds: [evidenceId],
    },
  });
}
