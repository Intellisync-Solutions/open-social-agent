import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";

const terminalStates = new Set([
  "live",
  "pending",
  "blocked",
  "failed",
  "rejected",
  "cancelled",
]);

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("AUTH_REQUIRED");
  return userId;
}

export const setArchivedMine = mutation({
  args: { runId: v.id("runs"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const run = await ctx.db.get("runs", args.runId);
    if (!run || run.userId !== userId) throw new ConvexError("RUN_NOT_FOUND");
    if (!terminalStates.has(run.state))
      throw new ConvexError("RUN_NOT_TERMINAL");
    await ctx.db.patch(run._id, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const cancelMine = mutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const run = await ctx.db.get("runs", args.runId);
    if (!run || run.userId !== userId) throw new ConvexError("RUN_NOT_FOUND");
    if (run.state !== "queued") throw new ConvexError("RUN_NOT_CANCELLABLE");
    await ctx.db.patch(run._id, { state: "cancelled", updatedAt: Date.now() });
    return null;
  },
});

export const purgeMine = mutation({
  args: { runId: v.id("runs"), confirmTrace: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const run = await ctx.db.get("runs", args.runId);
    if (!run || run.userId !== userId) throw new ConvexError("RUN_NOT_FOUND");
    if (
      run.archivedAt === undefined ||
      args.confirmTrace !== run.traceId.slice(0, 12)
    ) {
      throw new ConvexError("PURGE_CONFIRMATION_REQUIRED");
    }
    const related = await Promise.all([
      ctx.db
        .query("outputs")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("toolExecutions")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("evidenceItems")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("evaluations")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("approvals")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("publicationReceipts")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("executionClaims")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("harnessClaims")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .first(),
    ]);
    if (related.some(Boolean)) throw new ConvexError("RUN_AUDIT_EVIDENCE_RETAINED");
    await ctx.db.delete(run._id);
    return null;
  },
});
