import { getAuthUserId } from "@convex-dev/auth/server";
import {
  DraftOutputSchema,
  ProviderExecutionResultSchema,
} from "@open-social-agent/contracts";
import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { draftOutput } from "./validators";

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

export const saveModelResultMine = mutation({
  args: {
    runId: v.id("runs"),
    executionJson: v.string(),
  },
  returns: v.id("outputs"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.executionJson.length > 100_000) {
      throw new ConvexError("OUTPUT_TOO_LARGE");
    }
    const run = await ctx.db.get("runs", args.runId);
    if (!run || run.userId !== userId || run.state !== "queued") {
      throw new ConvexError("RUN_NOT_COMPOSABLE");
    }
    const existing = await ctx.db
      .query("outputs")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .unique();
    if (existing) return existing._id;
    let execution: unknown;
    try {
      execution = JSON.parse(args.executionJson);
    } catch {
      throw new ConvexError("OUTPUT_INVALID");
    }
    const parsed = ProviderExecutionResultSchema.safeParse(execution);
    if (!parsed.success) throw new ConvexError("OUTPUT_INVALID");
    DraftOutputSchema.parse(parsed.data.output);
    const originalJson = JSON.stringify(parsed.data.output);
    const originalHash = await sha256(originalJson);
    const bodyHash = await sha256(parsed.data.output.body);
    const now = Date.now();
    const outputId = await ctx.db.insert("outputs", {
      userId,
      runId: args.runId,
      original: parsed.data.output,
      originalHash,
      currentRevision: 1,
      status: "active",
      providerResponseId: parsed.data.responseId,
      requestedModel: parsed.data.requestedModel,
      actualModel: parsed.data.actualModel,
      inputTokens: parsed.data.usage.inputTokens,
      outputTokens: parsed.data.usage.outputTokens,
      totalTokens: parsed.data.usage.totalTokens,
      latencyMs: parsed.data.latencyMs,
      providerRequestId: parsed.data.requestId ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("outputRevisions", {
      userId,
      outputId,
      revision: 1,
      body: parsed.data.output.body,
      bodyHash,
      actor: "model",
      createdAt: now,
    });
    await ctx.db.patch(args.runId, {
      state: "awaiting_approval",
      updatedAt: now,
    });
    return outputId;
  },
});

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
