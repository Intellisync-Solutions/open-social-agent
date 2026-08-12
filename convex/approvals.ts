import { getAuthUserId } from "@convex-dev/auth/server";
import { ApprovalDecisionInputSchema } from "@open-social-agent/contracts";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const decideMine = mutation({
  args: {
    runId: v.id("runs"),
    outputId: v.id("outputs"),
    revision: v.number(),
    bodyHash: v.string(),
    destinationUrl: v.string(),
    expiresAt: v.number(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
  },
  returns: v.id("approvals"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const parsed = ApprovalDecisionInputSchema.safeParse({
      ...args,
      runId: String(args.runId),
      outputId: String(args.outputId),
    });
    if (!parsed.success) throw new ConvexError("APPROVAL_INVALID");
    const run = await ctx.db.get("runs", args.runId);
    const output = await ctx.db.get("outputs", args.outputId);
    if (!run || !output || run.userId !== userId || output.userId !== userId || output.runId !== run._id) {
      throw new ConvexError("APPROVAL_TARGET_NOT_FOUND");
    }
    if (run.state !== "awaiting_approval" || output.status !== "active") {
      throw new ConvexError("APPROVAL_STATE_INVALID");
    }
    const revision = await ctx.db
      .query("outputRevisions")
      .withIndex("by_outputId_and_revision", (q) =>
        q.eq("outputId", output._id).eq("revision", args.revision),
      )
      .unique();
    if (!revision || output.currentRevision !== args.revision || revision.bodyHash !== args.bodyHash) {
      throw new ConvexError("APPROVAL_STALE");
    }
    let snapshot: {
      profile?: { destination?: { feedUrl?: string } };
    };
    try {
      snapshot = JSON.parse(run.configurationSnapshotJson) as typeof snapshot;
    } catch {
      throw new ConvexError("RUN_SNAPSHOT_INVALID");
    }
    if (snapshot.profile?.destination?.feedUrl !== args.destinationUrl) {
      throw new ConvexError("DESTINATION_NOT_AUTHORIZED");
    }
    const now = Date.now();
    if (args.expiresAt <= now || args.expiresAt > now + 15 * 60 * 1000) {
      throw new ConvexError("APPROVAL_EXPIRY_INVALID");
    }
    const prior = await ctx.db.query("approvals").withIndex("by_runId", (q) => q.eq("runId", run._id)).take(1);
    if (prior.length > 0) throw new ConvexError("APPROVAL_ALREADY_DECIDED");
    const approvalId = await ctx.db.insert("approvals", { ...args, userId, createdAt: now });
    await ctx.db.patch(run._id, { state: args.decision, updatedAt: now });
    return approvalId;
  },
});

export const getExecutableMine = query({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.null(),
    v.object({
      approvalId: v.id("approvals"),
      outputId: v.id("outputs"),
      revision: v.number(),
      body: v.string(),
      bodyHash: v.string(),
      destinationUrl: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const run = await ctx.db.get("runs", args.runId);
    if (!run || run.userId !== userId || run.state !== "approved") return null;
    const approval = await ctx.db.query("approvals").withIndex("by_runId", (q) => q.eq("runId", run._id)).unique();
    if (!approval || approval.userId !== userId || approval.decision !== "approved" || approval.expiresAt <= Date.now()) return null;
    const output = await ctx.db.get("outputs", approval.outputId);
    const revision = await ctx.db.query("outputRevisions").withIndex("by_outputId_and_revision", (q) => q.eq("outputId", approval.outputId).eq("revision", approval.revision)).unique();
    if (!output || !revision || output.userId !== userId || output.status !== "active" || output.currentRevision !== approval.revision || revision.bodyHash !== approval.bodyHash) return null;
    return { approvalId: approval._id, outputId: output._id, revision: approval.revision, body: revision.body, bodyHash: revision.bodyHash, destinationUrl: approval.destinationUrl, expiresAt: approval.expiresAt };
  },
});
