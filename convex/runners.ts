import { getAuthUserId } from "@convex-dev/auth/server";
import {
  ConfigurationSnapshotSchema,
  openAIComputerModel,
  RunnerRegistrationInputSchema,
  RunnerRequestIdSchema,
} from "@open-social-agent/contracts";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const registrationDocument = v.object({
  _id: v.id("runnerRegistrations"),
  _creationTime: v.number(),
  userId: v.id("users"),
  runnerId: v.string(),
  label: v.string(),
  status: v.union(v.literal("active"), v.literal("revoked")),
  lastSeenAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const provisionMine = mutation({
  args: { label: v.string() },
  returns: v.object({
    registrationId: v.id("runnerRegistrations"),
    runnerId: v.string(),
    token: v.string(),
    profileScope: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const label = args.label.trim();
    if (label.length < 1 || label.length > 80) {
      throw new ConvexError("RUNNER_REGISTRATION_INVALID");
    }
    const registrations = await ctx.db
      .query("runnerRegistrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(11);
    if (registrations.length >= 10) throw new ConvexError("RUNNER_LIMIT_REACHED");
    const runnerId = randomIdentifier(48);
    const token = randomIdentifier(43);
    const now = Date.now();
    const registrationId = await ctx.db.insert("runnerRegistrations", {
      userId,
      runnerId,
      tokenHash: await sha256(token),
      label,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { registrationId, runnerId, token, profileScope: String(userId) };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(registrationDocument),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const registrations = await ctx.db
      .query("runnerRegistrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(10);
    return registrations.map(({ tokenHash: _tokenHash, ...registration }) => registration);
  },
});

export const revokeMine = mutation({
  args: { registrationId: v.id("runnerRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const registration = await ctx.db.get("runnerRegistrations", args.registrationId);
    if (!registration || registration.userId !== userId) {
      throw new ConvexError("RUNNER_NOT_FOUND");
    }
    await ctx.db.patch(registration._id, {
      status: "revoked",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const authorizeInternal = internalQuery({
  args: { runnerId: v.string(), tokenHash: v.string() },
  returns: v.union(v.null(), v.object({
    registrationId: v.id("runnerRegistrations"),
    userId: v.id("users"),
  })),
  handler: async (ctx, args) => {
    const parsed = RunnerRegistrationInputSchema.pick({
      runnerId: true,
      tokenHash: true,
    }).safeParse(args);
    if (!parsed.success) return null;
    const registration = await ctx.db
      .query("runnerRegistrations")
      .withIndex("by_runnerId", (q) => q.eq("runnerId", parsed.data.runnerId))
      .unique();
    return registration && registration.status === "active" && registration.tokenHash === parsed.data.tokenHash
      ? { registrationId: registration._id, userId: registration.userId }
      : null;
  },
});

export const claimApprovedInternal = internalMutation({
  args: {
    registrationId: v.id("runnerRegistrations"),
    userId: v.id("users"),
    runnerId: v.string(),
    requestId: v.string(),
    now: v.number(),
  },
  returns: v.union(v.null(), v.object({
    userId: v.id("users"),
    registrationId: v.id("runnerRegistrations"),
    runId: v.id("runs"),
    approvalId: v.id("approvals"),
    outputId: v.id("outputs"),
    revision: v.number(),
    body: v.string(),
    bodyHash: v.string(),
    destinationUrl: v.string(),
    approvalExpiresAt: v.number(),
    leaseExpiresAt: v.number(),
    executionRequestId: v.string(),
    modelId: v.string(),
  })),
  handler: async (ctx, args) => {
    if (!RunnerRequestIdSchema.safeParse(args.requestId).success) {
      throw new ConvexError("REQUEST_ID_INVALID");
    }
    const registration = await ctx.db.get("runnerRegistrations", args.registrationId);
    if (
      !registration ||
      registration.userId !== args.userId ||
      registration.runnerId !== args.runnerId ||
      registration.status !== "active"
    ) {
      throw new ConvexError("RUNNER_AUTH_INVALID");
    }
    const runnerClaims = await ctx.db
      .query("executionClaims")
      .withIndex("by_runnerId_and_requestId", (q) => q.eq("runnerId", args.runnerId))
      .take(20);
    for (const claim of runnerClaims) {
      if (claim.status === "claimed" && claim.leaseExpiresAt <= args.now) {
        await closeStaleClaim(ctx, claim, await ctx.db.get("runs", claim.runId), args.now);
      }
    }
    const replay = await ctx.db
      .query("executionClaims")
      .withIndex("by_runnerId_and_requestId", (q) =>
        q.eq("runnerId", args.runnerId).eq("requestId", args.requestId),
      )
      .unique();
    if (replay) return await claimPayload(ctx, replay, args.now);
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_userId_and_state", (q) =>
        q.eq("userId", args.userId).eq("state", "approved"),
      )
      .order("asc")
      .take(10);
    for (const run of runs) {
      const approval = await ctx.db
        .query("approvals")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .unique();
      if (!approval || approval.decision !== "approved" || approval.expiresAt <= args.now) {
        await ctx.db.patch(run._id, { state: "blocked", updatedAt: args.now });
        continue;
      }
      const output = await ctx.db.get("outputs", approval.outputId);
      const revision = await ctx.db
        .query("outputRevisions")
        .withIndex("by_outputId_and_revision", (q) =>
          q.eq("outputId", approval.outputId).eq("revision", approval.revision),
        )
        .unique();
      if (!output || !revision || output.userId !== args.userId || output.status !== "active" || output.currentRevision !== approval.revision || revision.bodyHash !== approval.bodyHash) {
        await ctx.db.patch(run._id, { state: "blocked", updatedAt: args.now });
        continue;
      }
      const existing = await ctx.db.query("executionClaims").withIndex("by_runId", (q) => q.eq("runId", run._id)).unique();
      if (existing) continue;
      const leaseExpiresAt = Math.min(args.now + 10 * 60 * 1000, approval.expiresAt);
      const claimId = await ctx.db.insert("executionClaims", {
        userId: args.userId,
        runnerRegistrationId: registration._id,
        runnerId: args.runnerId,
        runId: run._id,
        approvalId: approval._id,
        requestId: args.requestId,
        leaseExpiresAt,
        status: "claimed",
        createdAt: args.now,
        updatedAt: args.now,
      });
      await ctx.db.patch(run._id, { state: "executing", updatedAt: args.now });
      await ctx.db.patch(registration._id, { lastSeenAt: args.now, updatedAt: args.now });
      return await claimPayload(ctx, (await ctx.db.get("executionClaims", claimId))!, args.now);
    }
    return null;
  },
});

export const claimQueuedInternal = internalMutation({
  args: {
    registrationId: v.id("runnerRegistrations"), userId: v.id("users"),
    runnerId: v.string(), requestId: v.string(), now: v.number(),
  },
  returns: v.union(v.null(), v.object({
    userId: v.id("users"), registrationId: v.id("runnerRegistrations"),
    runId: v.id("runs"), executionRequestId: v.string(), leaseExpiresAt: v.number(),
    snapshotJson: v.string(), recentBodies: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    if (!RunnerRequestIdSchema.safeParse(args.requestId).success) throw new ConvexError("REQUEST_ID_INVALID");
    const registration = await ctx.db.get("runnerRegistrations", args.registrationId);
    if (!registration || registration.userId !== args.userId || registration.runnerId !== args.runnerId || registration.status !== "active") {
      throw new ConvexError("RUNNER_AUTH_INVALID");
    }
    const staleClaims = await ctx.db.query("harnessClaims").withIndex("by_runnerId_and_requestId", (q) => q.eq("runnerId", args.runnerId)).take(20);
    for (const stale of staleClaims) {
      if (stale.status !== "claimed" || stale.leaseExpiresAt > args.now) continue;
      const staleRun = await ctx.db.get("runs", stale.runId);
      await ctx.db.patch(stale._id, { status: "completed", updatedAt: args.now });
      if (staleRun?.state === "claimed") {
        await ctx.db.patch(staleRun._id, { state: "failed", updatedAt: args.now });
      }
    }
    const replay = await ctx.db.query("harnessClaims").withIndex("by_runnerId_and_requestId", (q) => q.eq("runnerId", args.runnerId).eq("requestId", args.requestId)).unique();
    if (replay) return await harnessClaimPayload(ctx, replay, args.now);
    const userClaims = await ctx.db
      .query("harnessClaims")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "claimed"),
      )
      .take(20);
    for (const active of userClaims) {
      if (active.leaseExpiresAt > args.now) return null;
      const activeRun = await ctx.db.get("runs", active.runId);
      await ctx.db.patch(active._id, {
        status: "completed",
        updatedAt: args.now,
      });
      if (activeRun?.state === "claimed") {
        await ctx.db.patch(activeRun._id, {
          state: "failed",
          blockedCode: "HARNESS_LEASE_EXPIRED",
          updatedAt: args.now,
        });
      }
    }
    const run = (await ctx.db.query("runs").withIndex("by_userId_and_state", (q) => q.eq("userId", args.userId).eq("state", "queued")).order("asc").take(1))[0];
    if (!run) return null;
    let snapshotRaw: unknown;
    try {
      snapshotRaw = JSON.parse(run.configurationSnapshotJson);
    } catch {
      await ctx.db.patch(run._id, {
        state: "blocked",
        blockedCode: "RUN_SNAPSHOT_INVALID",
        updatedAt: args.now,
      });
      return null;
    }
    const snapshot = ConfigurationSnapshotSchema.safeParse(snapshotRaw);
    if (!snapshot.success) {
      await ctx.db.patch(run._id, {
        state: "blocked",
        blockedCode: "RUN_SNAPSHOT_INVALID",
        updatedAt: args.now,
      });
      return null;
    }
    const startOfUtcDay = Math.floor(args.now / 86_400_000) * 86_400_000;
    const [dailyOutputs, dailyTools] = await Promise.all([
      ctx.db
        .query("outputs")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", args.userId).gte("createdAt", startOfUtcDay),
        )
        .take(500),
      ctx.db
        .query("toolExecutions")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", args.userId).gte("createdAt", startOfUtcDay),
        )
        .take(500),
    ]);
    if (dailyOutputs.length >= 500 || dailyTools.length >= 500) {
      await ctx.db.patch(run._id, {
        state: "blocked",
        blockedCode: "DAILY_USAGE_SCAN_LIMIT",
        updatedAt: args.now,
      });
      return null;
    }
    const consumedTokens = [...dailyOutputs, ...dailyTools].reduce(
      (total, record) => total + record.totalTokens,
      0,
    );
    if (
      consumedTokens + snapshot.data.profile.model.perRunTokenGate >
      snapshot.data.profile.model.dailyTokenGate
    ) {
      await ctx.db.patch(run._id, {
        state: "blocked",
        blockedCode: "DAILY_TOKEN_GATE_REACHED",
        updatedAt: args.now,
      });
      return null;
    }
    const existing = await ctx.db.query("harnessClaims").withIndex("by_runId", (q) => q.eq("runId", run._id)).unique();
    if (existing) return null;
    const leaseExpiresAt = args.now + 15 * 60 * 1000;
    const claimId = await ctx.db.insert("harnessClaims", {
      userId: args.userId, runnerRegistrationId: registration._id, runnerId: args.runnerId,
      runId: run._id, requestId: args.requestId, leaseExpiresAt, status: "claimed",
      createdAt: args.now, updatedAt: args.now,
    });
    await ctx.db.patch(run._id, { state: "claimed", updatedAt: args.now });
    await ctx.db.patch(registration._id, { lastSeenAt: args.now, updatedAt: args.now });
    return await harnessClaimPayload(ctx, (await ctx.db.get("harnessClaims", claimId))!, args.now);
  },
});

async function harnessClaimPayload(ctx: MutationCtx, claim: Doc<"harnessClaims">, now: number) {
  const run = await ctx.db.get("runs", claim.runId);
  if (claim.status !== "claimed" || claim.leaseExpiresAt <= now || !run || run.state !== "claimed" || run.userId !== claim.userId) return null;
  const registration = await ctx.db.get(
    "runnerRegistrations",
    claim.runnerRegistrationId,
  );
  if (
    !registration ||
    registration.status !== "active" ||
    registration.userId !== claim.userId ||
    registration.runnerId !== claim.runnerId
  )
    return null;
  let snapshot: unknown;
  try { snapshot = JSON.parse(run.configurationSnapshotJson); } catch { return null; }
  const parsed = ConfigurationSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const outputs = await ctx.db.query("outputs").withIndex("by_userId_and_status", (q) => q.eq("userId", claim.userId).eq("status", "active")).order("desc").take(20);
  return {
    userId: claim.userId, registrationId: claim.runnerRegistrationId, runId: run._id,
    executionRequestId: claim.requestId, leaseExpiresAt: claim.leaseExpiresAt,
    snapshotJson: JSON.stringify(parsed.data), recentBodies: outputs.map((output) => output.original.body),
  };
}

async function claimPayload(
  ctx: MutationCtx,
  claim: Doc<"executionClaims">,
  now: number,
) {
  if (claim.status !== "claimed") return null;
  const run = await ctx.db.get("runs", claim.runId);
  const approval = await ctx.db.get("approvals", claim.approvalId);
  const registration = await ctx.db.get(
    "runnerRegistrations",
    claim.runnerRegistrationId,
  );
  if (
    claim.leaseExpiresAt <= now ||
    !run ||
    !approval ||
    run.state !== "executing" ||
    approval.expiresAt <= now ||
    run.userId !== claim.userId ||
    approval.userId !== claim.userId ||
    !registration ||
    registration.status !== "active" ||
    registration.userId !== claim.userId ||
    registration.runnerId !== claim.runnerId
  ) {
    await closeStaleClaim(ctx, claim, run, now);
    return null;
  }
  const output = await ctx.db.get("outputs", approval.outputId);
  const revision = await ctx.db
    .query("outputRevisions")
    .withIndex("by_outputId_and_revision", (q) =>
      q.eq("outputId", approval.outputId).eq("revision", approval.revision),
    )
    .unique();
  if (!output || !revision || output.userId !== claim.userId || output.status !== "active" || output.currentRevision !== approval.revision || revision.bodyHash !== approval.bodyHash) {
    await closeStaleClaim(ctx, claim, run, now);
    return null;
  }
  return {
    userId: claim.userId,
    registrationId: claim.runnerRegistrationId,
    runId: run._id,
    approvalId: approval._id,
    outputId: output._id,
    revision: approval.revision,
    body: revision.body,
    bodyHash: revision.bodyHash,
    destinationUrl: approval.destinationUrl,
    approvalExpiresAt: approval.expiresAt,
    leaseExpiresAt: claim.leaseExpiresAt,
    executionRequestId: claim.requestId,
    modelId: openAIComputerModel,
  };
}

async function closeStaleClaim(
  ctx: MutationCtx,
  claim: Doc<"executionClaims">,
  run: Doc<"runs"> | null,
  now: number,
) {
  await ctx.db.patch(claim._id, { status: "completed", updatedAt: now });
  if (run?.state === "executing") {
    await ctx.db.patch(run._id, { state: "blocked", updatedAt: now });
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomIdentifier(length: number) {
  let value = "";
  while (value.length < length) {
    value += crypto.randomUUID().replaceAll("-", "");
  }
  return value.slice(0, length);
}
