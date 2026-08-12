import { getAuthUserId } from "@convex-dev/auth/server";
import {
  ConfigurationSnapshotSchema,
  DraftOutputSchema,
  HarnessExecutionResultSchema,
  type ProviderExecutionResult,
} from "@open-social-agent/contracts";
import { ConvexError, v } from "convex/values";
import {
  mutation,
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { draftOutput } from "./validators";
import type { Doc, Id } from "./_generated/dataModel";
import { evaluateHarnessExecution } from "@open-social-agent/harness";

const outputDocument = v.object({
  _id: v.id("outputs"),
  _creationTime: v.number(),
  userId: v.id("users"),
  runId: v.id("runs"),
  original: draftOutput,
  originalHash: v.string(),
  currentRevision: v.number(),
  status: v.union(v.literal("active"), v.literal("archived")),
  providerResponseId: v.string(),
  requestedModel: v.string(),
  actualModel: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  latencyMs: v.number(),
  providerRequestId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("AUTH_REQUIRED");
  return userId;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const listMine = query({
  args: { status: v.union(v.literal("active"), v.literal("archived")) },
  returns: v.array(outputDocument),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("outputs")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", args.status),
      )
      .order("desc")
      .take(100);
  },
});

export const saveHarnessResultInternal = internalMutation({
  args: {
    userId: v.id("users"), runId: v.id("runs"),
    runnerRegistrationId: v.id("runnerRegistrations"), executionRequestId: v.string(),
    executionJson: v.string(),
  },
  returns: v.object({
    outputId: v.id("outputs"),
    state: v.union(v.literal("awaiting_approval"), v.literal("blocked")),
  }),
  handler: async (ctx, args) => {
    const { userId } = args;
    if (args.executionJson.length > 200_000) throw new ConvexError("OUTPUT_TOO_LARGE");
    const run = await ctx.db.get("runs", args.runId);
    const claim = await ctx.db.query("harnessClaims").withIndex("by_runId", (q) => q.eq("runId", args.runId)).unique();
    if (!run || run.userId !== userId || run.state !== "claimed" || !claim ||
      claim.userId !== userId || claim.runnerRegistrationId !== args.runnerRegistrationId ||
      claim.requestId !== args.executionRequestId || claim.status !== "claimed" ||
      claim.leaseExpiresAt <= Date.now()) {
      throw new ConvexError("RUN_NOT_COMPOSABLE");
    }
    const existing = await ctx.db.query("outputs").withIndex("by_runId", (q) => q.eq("runId", run._id)).unique();
    if (existing) throw new ConvexError("RUN_ALREADY_COMPOSED");
    let raw: unknown;
    try { raw = JSON.parse(args.executionJson); } catch { throw new ConvexError("OUTPUT_INVALID"); }
    const parsed = HarnessExecutionResultSchema.safeParse(raw);
    if (!parsed.success) throw new ConvexError("OUTPUT_INVALID");
    let snapshotRaw: unknown;
    try { snapshotRaw = JSON.parse(run.configurationSnapshotJson); } catch { throw new ConvexError("RUN_SNAPSHOT_INVALID"); }
    const snapshot = ConfigurationSnapshotSchema.safeParse(snapshotRaw);
    if (!snapshot.success) throw new ConvexError("RUN_SNAPSHOT_INVALID");
    const recentOutputs = await ctx.db.query("outputs").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "active")).order("desc").take(20);
    const serverEvaluation = evaluateHarnessExecution({
      snapshot: snapshot.data,
      research: parsed.data.research,
      composition: parsed.data.composition,
      recentBodies: recentOutputs.map((output) => output.original.body),
    });
    if (JSON.stringify(serverEvaluation) !== JSON.stringify(parsed.data.evaluation)) {
      throw new ConvexError("EVALUATION_MISMATCH");
    }
    const state: "awaiting_approval" | "blocked" = parsed.data.evaluation.state === "passed" ? "awaiting_approval" : "blocked";
    const outputId = await persistComposition(ctx, userId, run, parsed.data.composition, state);
    const now = Date.now();
    if (parsed.data.research) {
      const research = parsed.data.research;
      await ctx.db.insert("toolExecutions", {
        userId, runId: run._id, tool: "web_search", status: "completed",
        responseId: research.responseId, requestedModel: research.requestedModel,
        actualModel: research.actualModel, inputTokens: research.usage.inputTokens,
        outputTokens: research.usage.outputTokens, totalTokens: research.usage.totalTokens,
        latencyMs: research.latencyMs, toolCalls: research.toolCalls,
        queriesJson: JSON.stringify(research.queries), createdAt: now,
      });
      for (const evidence of research.evidence) {
        await ctx.db.insert("evidenceItems", {
          userId, runId: run._id, evidenceId: evidence.id, url: evidence.url,
          title: evidence.title, domain: evidence.domain, retrievedAt: evidence.retrievedAt,
          publishedAt: evidence.publishedAt ?? undefined, contentHash: evidence.contentHash,
          createdAt: now,
        });
      }
    }
    await ctx.db.insert("evaluations", {
      userId, runId: run._id, outputId,
      state: parsed.data.evaluation.state, codes: parsed.data.evaluation.codes,
      warnings: parsed.data.evaluation.warnings,
      duplicateScore: parsed.data.evaluation.duplicateScore,
      citedEvidenceIds: parsed.data.evaluation.citedEvidenceIds,
      createdAt: now,
    });
    await ctx.db.patch(claim._id, { status: "completed", updatedAt: now });
    return { outputId, state };
  },
});

export const failHarnessInternal = internalMutation({
  args: {
    userId: v.id("users"), runId: v.id("runs"),
    runnerRegistrationId: v.id("runnerRegistrations"), executionRequestId: v.string(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("runs", args.runId);
    const claim = await ctx.db.query("harnessClaims").withIndex("by_runId", (q) => q.eq("runId", args.runId)).unique();
    if (!run || !claim || run.userId !== args.userId || run.state !== "claimed" ||
      claim.userId !== args.userId || claim.runnerRegistrationId !== args.runnerRegistrationId ||
      claim.requestId !== args.executionRequestId || claim.status !== "claimed" ||
      claim.leaseExpiresAt <= Date.now() || !/^[A-Z0-9_]{1,120}$/.test(args.errorCode)) {
      throw new ConvexError("HARNESS_FAILURE_AUTHORITY_INVALID");
    }
    const now = Date.now();
    await ctx.db.patch(claim._id, { status: "completed", updatedAt: now });
    await ctx.db.patch(run._id, { state: "failed", updatedAt: now });
    return null;
  },
});

async function persistComposition(
  ctx: MutationCtx,
  userId: Id<"users">,
  run: Doc<"runs">,
  execution: ProviderExecutionResult,
  state: "awaiting_approval" | "blocked",
) {
  DraftOutputSchema.parse(execution.output);
  const originalHash = await sha256(JSON.stringify(execution.output));
  const bodyHash = await sha256(execution.output.body);
  const now = Date.now();
  const outputId = await ctx.db.insert("outputs", {
    userId, runId: run._id, original: execution.output, originalHash,
    currentRevision: 1, status: "active", providerResponseId: execution.responseId,
    requestedModel: execution.requestedModel, actualModel: execution.actualModel,
    inputTokens: execution.usage.inputTokens, outputTokens: execution.usage.outputTokens,
    totalTokens: execution.usage.totalTokens, latencyMs: execution.latencyMs,
    providerRequestId: execution.requestId ?? undefined, createdAt: now, updatedAt: now,
  });
  await ctx.db.insert("outputRevisions", {
    userId, outputId, revision: 1, body: execution.output.body, bodyHash,
    actor: "model", createdAt: now,
  });
  await ctx.db.patch(run._id, { state, updatedAt: now });
  return outputId;
}

export const reviseMine = mutation({
  args: { outputId: v.id("outputs"), body: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const output = await ctx.db.get("outputs", args.outputId);
    if (!output || output.userId !== userId) {
      throw new ConvexError("OUTPUT_NOT_FOUND");
    }
    const body = args.body.trim();
    if (output.status !== "active" || body.length < 1 || body.length > 8_000) {
      throw new ConvexError("OUTPUT_REVISION_INVALID");
    }
    const revision = output.currentRevision + 1;
    const now = Date.now();
    await ctx.db.insert("outputRevisions", {
      userId,
      outputId: output._id,
      revision,
      body,
      bodyHash: await sha256(body),
      actor: "user",
      createdAt: now,
    });
    await ctx.db.patch(output._id, { currentRevision: revision, updatedAt: now });
    return revision;
  },
});

export const setArchivedMine = mutation({
  args: { outputId: v.id("outputs"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const output = await ctx.db.get("outputs", args.outputId);
    if (!output || output.userId !== userId) {
      throw new ConvexError("OUTPUT_NOT_FOUND");
    }
    await ctx.db.patch(output._id, {
      status: args.archived ? "archived" : "active",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const purgeMine = mutation({
  args: { outputId: v.id("outputs"), confirmHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const output = await ctx.db.get("outputs", args.outputId);
    if (!output || output.userId !== userId) {
      throw new ConvexError("OUTPUT_NOT_FOUND");
    }
    if (
      output.status !== "archived" ||
      args.confirmHash !== output.originalHash.slice(0, 12)
    ) {
      throw new ConvexError("PURGE_CONFIRMATION_REQUIRED");
    }
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_outputId", (q) => q.eq("outputId", output._id))
      .take(1);
    if (approvals.length > 0) {
      throw new ConvexError("OUTPUT_HAS_APPROVAL");
    }
    const revisions = await ctx.db
      .query("outputRevisions")
      .withIndex("by_outputId_and_revision", (q) =>
        q.eq("outputId", output._id),
      )
      .take(100);
    if (revisions.length >= 100) {
      throw new ConvexError("OUTPUT_REVISION_LIMIT_EXCEEDED");
    }
    for (const revision of revisions) await ctx.db.delete(revision._id);
    await ctx.db.delete(output._id);
    await ctx.db.patch(output.runId, {
      state: "cancelled",
      updatedAt: Date.now(),
    });
    return null;
  },
});
