import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { receiptState } from "./validators";

function isAuthorizedDirectUrl(directUrl: string, destinationUrl: string) {
  try {
    const direct = new URL(directUrl);
    const destination = new URL(destinationUrl);
    const basePath = destination.pathname.endsWith("/")
      ? destination.pathname
      : `${destination.pathname}/`;
    return (
      direct.protocol === "https:" &&
      direct.username === "" &&
      direct.password === "" &&
      direct.origin === destination.origin &&
      direct.pathname.startsWith(basePath) &&
      direct.href !== destination.href
    );
  } catch {
    return false;
  }
}

export const recordVerified = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    approvalId: v.id("approvals"),
    runnerRegistrationId: v.id("runnerRegistrations"),
    executionRequestId: v.string(),
    state: receiptState,
    destinationUrl: v.string(),
    bodyHash: v.string(),
    directUrl: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    requestedModel: v.string(),
    actualModel: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    turns: v.number(),
    actionsExecuted: v.number(),
  },
  returns: v.id("publicationReceipts"),
  handler: async (ctx, args) => {
    const { userId } = args;
    const run = await ctx.db.get("runs", args.runId);
    const approval = await ctx.db.get("approvals", args.approvalId);
    const claim = await ctx.db
      .query("executionClaims")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .unique();
    if (!run || !approval || !claim || run.userId !== userId || approval.userId !== userId || approval.runId !== run._id || approval.decision !== "approved" || claim.userId !== userId || claim.runnerRegistrationId !== args.runnerRegistrationId || claim.approvalId !== approval._id || claim.requestId !== args.executionRequestId || claim.status !== "claimed" || claim.leaseExpiresAt <= Date.now() || run.state !== "executing") {
      throw new ConvexError("RECEIPT_AUTHORITY_INVALID");
    }
    if (approval.destinationUrl !== args.destinationUrl || approval.bodyHash !== args.bodyHash) {
      throw new ConvexError("RECEIPT_APPROVAL_MISMATCH");
    }
    if (
      !Number.isInteger(args.inputTokens) || args.inputTokens < 0 ||
      !Number.isInteger(args.outputTokens) || args.outputTokens < 0 ||
      !Number.isInteger(args.totalTokens) || args.totalTokens !== args.inputTokens + args.outputTokens ||
      !Number.isInteger(args.turns) || args.turns < 0 || args.turns > 20 ||
      !Number.isInteger(args.actionsExecuted) || args.actionsExecuted < 0 || args.actionsExecuted > 500
    ) {
      throw new ConvexError("RECEIPT_USAGE_INVALID");
    }
    const output = await ctx.db.get("outputs", approval.outputId);
    const revision = await ctx.db
      .query("outputRevisions")
      .withIndex("by_outputId_and_revision", (q) =>
        q.eq("outputId", approval.outputId).eq("revision", approval.revision),
      )
      .unique();
    if (
      !output ||
      !revision ||
      output.userId !== userId ||
      output.currentRevision !== approval.revision ||
      revision.bodyHash !== approval.bodyHash
    ) {
      throw new ConvexError("APPROVAL_STALE");
    }
    const existing = await ctx.db.query("publicationReceipts").withIndex("by_runId", (q) => q.eq("runId", run._id)).take(1);
    if (existing.length > 0) throw new ConvexError("RECEIPT_ALREADY_RECORDED");
    if (
      args.state === "live" &&
      (!args.directUrl ||
        !isAuthorizedDirectUrl(args.directUrl, args.destinationUrl))
    ) {
      throw new ConvexError("DIRECT_VERIFICATION_REQUIRED");
    }
    const now = Date.now();
    const receiptId = await ctx.db.insert("publicationReceipts", {
      runId: args.runId,
      approvalId: args.approvalId,
      state: args.state,
      destinationUrl: args.destinationUrl,
      bodyHash: args.bodyHash,
      directUrl: args.directUrl,
      errorCode: args.errorCode,
      requestedModel: args.requestedModel,
      actualModel: args.actualModel,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      turns: args.turns,
      actionsExecuted: args.actionsExecuted,
      userId,
      attemptedAt: now,
      verifiedAt: args.state === "live" ? now : undefined,
    });
    await ctx.db.patch(claim._id, {
      status: "completed",
      updatedAt: now,
    });
    await ctx.db.patch(run._id, { state: args.state, updatedAt: now });
    return receiptId;
  },
});

export const getMine = query({
  args: { runId: v.id("runs") },
  returns: v.union(v.null(), v.object({
    _id: v.id("publicationReceipts"), _creationTime: v.number(), userId: v.id("users"), runId: v.id("runs"), approvalId: v.id("approvals"), state: receiptState, destinationUrl: v.string(), bodyHash: v.string(), directUrl: v.optional(v.string()), attemptedAt: v.number(), verifiedAt: v.optional(v.number()), errorCode: v.optional(v.string()), requestedModel: v.string(), actualModel: v.string(), inputTokens: v.number(), outputTokens: v.number(), totalTokens: v.number(), turns: v.number(), actionsExecuted: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("AUTH_REQUIRED");
    const receipt = await ctx.db.query("publicationReceipts").withIndex("by_runId", (q) => q.eq("runId", args.runId)).unique();
    return receipt?.userId === userId ? receipt : null;
  },
});
