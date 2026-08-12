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
const setOutputArchived = makeFunctionReference<"mutation">(
  "outputs:setArchivedMine",
);
const purgeOutput = makeFunctionReference<"mutation">("outputs:purgeMine");
const decideApproval = makeFunctionReference<"mutation">("approvals:decideMine");
const recordReceipt = makeFunctionReference<"mutation">(
  "receipts:recordVerified",
);
const provisionRunner = makeFunctionReference<"mutation">("runners:provisionMine");
const listRunners = makeFunctionReference<"query">("runners:listMine");
const claimApproved = makeFunctionReference<"mutation">(
  "runners:claimApprovedInternal",
);

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

  it("rejects stale approval after an output edit", async () => {
    const { alice, t } = await authenticatedTest();
    const profileId = await alice.mutation(createProfile, profileInput);
    const scheduleId = await alice.mutation(createSchedule, { profileId, name: "Daily signal", cadence: "daily", timezone: "America/Toronto", localTime: "09:30" });
    const runId = await alice.mutation(runNow, { scheduleId, requestId: "manual-request-approval-01" });
    const outputId = await alice.mutation(saveModelResult, {
      runId,
      executionJson: JSON.stringify({ responseId: "resp_test", requestedModel: "gpt-5.6-terra", actualModel: "gpt-5.6-terra", output: { body: "Original.", assumptions: [], riskFlags: [], sourceMap: [] }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 10, requestId: "req_test" }),
    });
    const original = await t.run(async (ctx) => await ctx.db.query("outputRevisions").withIndex("by_outputId_and_revision", (q) => q.eq("outputId", outputId).eq("revision", 1)).unique());
    await alice.mutation(reviseOutput, { outputId, body: "Edited." });
    await expect(alice.mutation(decideApproval, {
      runId, outputId, revision: 1, bodyHash: original!.bodyHash, destinationUrl: profileInput.destination.feedUrl, expiresAt: Date.now() + 60_000, decision: "approved",
    })).rejects.toThrow("APPROVAL_STALE");
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
    const outputId = await alice.mutation(saveModelResult, {
      runId,
      executionJson: JSON.stringify({
        responseId: "resp_test",
        requestedModel: "gpt-5.6-terra",
        actualModel: "gpt-5.6-terra",
        output: {
          body: "Approved body.",
          assumptions: [],
          riskFlags: [],
          sourceMap: [],
        },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 10,
        requestId: "req_test",
      }),
    });
    const revision = await t.run(async (ctx) =>
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
    const userId = (await t.run(async (ctx) => await ctx.db.get("runs", runId)))!
      .userId;
    const provisioned = await alice.mutation(provisionRunner, { label: "Test runner" });
    const { runnerId, registrationId } = provisioned;
    expect(await alice.query(listRunners, {})).toEqual([
      expect.not.objectContaining({ tokenHash: expect.anything() }),
    ]);
    const executionRequestId = "execution-request-0001";
    const claim = await t.mutation(claimApproved, {
      registrationId,
      userId,
      runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    });
    expect(claim).toMatchObject({ runId, approvalId });
    expect(await t.mutation(claimApproved, {
      registrationId,
      userId,
      runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    })).toEqual(claim);
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
    expect(await t.mutation(claimApproved, {
      registrationId,
      userId,
      runnerId,
      requestId: executionRequestId,
      now: Date.now(),
    })).toBeNull();
    await alice.mutation(setOutputArchived, { outputId, archived: true });
    const output = await t.run(async (ctx) => await ctx.db.get("outputs", outputId));
    await expect(
      alice.mutation(purgeOutput, {
        outputId,
        confirmHash: output!.originalHash.slice(0, 12),
      }),
    ).rejects.toThrow("OUTPUT_HAS_APPROVAL");
  });
});
