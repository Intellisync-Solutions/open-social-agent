import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { receiptState, runState } from "./validators";

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("AUTH_REQUIRED");
  return userId;
}

const draftSummary = v.object({
  outputId: v.id("outputs"),
  runId: v.id("runs"),
  status: v.union(v.literal("active"), v.literal("archived")),
  runState,
  body: v.string(),
  bodyHash: v.string(),
  revision: v.number(),
  destinationUrl: v.string(),
  assumptions: v.array(v.string()),
  riskFlags: v.array(v.string()),
  sourceMap: v.array(
    v.object({ claim: v.string(), evidenceIds: v.array(v.string()) }),
  ),
  evaluation: v.union(
    v.null(),
    v.object({
      state: v.union(v.literal("passed"), v.literal("blocked")),
      codes: v.array(v.string()),
      warnings: v.array(v.string()),
      duplicateScore: v.number(),
      citedEvidenceIds: v.array(v.string()),
    }),
  ),
  evidence: v.array(
    v.object({
      evidenceId: v.string(),
      url: v.string(),
      title: v.string(),
      domain: v.string(),
      retrievedAt: v.number(),
      publishedAt: v.optional(v.number()),
    }),
  ),
  requestedModel: v.string(),
  actualModel: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  latencyMs: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listDraftsMine = query({
  args: { status: v.union(v.literal("active"), v.literal("archived")) },
  returns: v.array(draftSummary),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const outputs = await ctx.db
      .query("outputs")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", args.status),
      )
      .order("desc")
      .take(50);

    return await Promise.all(
      outputs.map(async (output) => {
        const [run, revision, evaluation, evidence] = await Promise.all([
          ctx.db.get("runs", output.runId),
          ctx.db
            .query("outputRevisions")
            .withIndex("by_outputId_and_revision", (q) =>
              q
                .eq("outputId", output._id)
                .eq("revision", output.currentRevision),
            )
            .unique(),
          ctx.db
            .query("evaluations")
            .withIndex("by_runId", (q) => q.eq("runId", output.runId))
            .unique(),
          ctx.db
            .query("evidenceItems")
            .withIndex("by_runId", (q) => q.eq("runId", output.runId))
            .take(20),
        ]);
        if (
          !run ||
          run.userId !== userId ||
          !revision ||
          revision.userId !== userId
        ) {
          throw new ConvexError("DRAFT_HISTORY_INCONSISTENT");
        }
        let destinationUrl = "";
        try {
          const snapshot = JSON.parse(run.configurationSnapshotJson) as {
            profile?: { destination?: { feedUrl?: string } };
          };
          destinationUrl = snapshot.profile?.destination?.feedUrl ?? "";
        } catch {
          throw new ConvexError("RUN_SNAPSHOT_INVALID");
        }
        return {
          outputId: output._id,
          runId: run._id,
          status: output.status,
          runState: run.state,
          body: revision.body,
          bodyHash: revision.bodyHash,
          revision: revision.revision,
          destinationUrl,
          assumptions: output.original.assumptions,
          riskFlags: output.original.riskFlags,
          sourceMap: output.original.sourceMap,
          evaluation:
            evaluation && evaluation.userId === userId
              ? {
                  state: evaluation.state,
                  codes: evaluation.codes,
                  warnings: evaluation.warnings,
                  duplicateScore: evaluation.duplicateScore,
                  citedEvidenceIds: evaluation.citedEvidenceIds,
                }
              : null,
          evidence: evidence
            .filter((item) => item.userId === userId)
            .map((item) => ({
              evidenceId: item.evidenceId,
              url: item.url,
              title: item.title,
              domain: item.domain,
              retrievedAt: item.retrievedAt,
              publishedAt: item.publishedAt,
            })),
          requestedModel: output.requestedModel,
          actualModel: output.actualModel,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          totalTokens: output.totalTokens,
          latencyMs: output.latencyMs,
          createdAt: output.createdAt,
          updatedAt: output.updatedAt,
        };
      }),
    );
  },
});

const runSummary = v.object({
  runId: v.id("runs"),
  scheduleId: v.id("schedules"),
  scheduleName: v.string(),
  profileName: v.string(),
  state: runState,
  scheduledFor: v.number(),
  traceId: v.string(),
  missedOccurrences: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  outputId: v.optional(v.id("outputs")),
  receipt: v.union(
    v.null(),
    v.object({
      state: receiptState,
      directUrl: v.optional(v.string()),
      errorCode: v.optional(v.string()),
      attemptedAt: v.number(),
      verifiedAt: v.optional(v.number()),
    }),
  ),
});

export const listRunsMine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(runSummary),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 50), 100));
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return await Promise.all(
      runs.map(async (run) => {
        const [schedule, output, receipt] = await Promise.all([
          ctx.db.get("schedules", run.scheduleId),
          ctx.db
            .query("outputs")
            .withIndex("by_runId", (q) => q.eq("runId", run._id))
            .unique(),
          ctx.db
            .query("publicationReceipts")
            .withIndex("by_runId", (q) => q.eq("runId", run._id))
            .unique(),
        ]);
        let profile: Doc<"automationProfiles"> | null = null;
        if (schedule && schedule.userId === userId)
          profile = await ctx.db.get("automationProfiles", schedule.profileId);
        return {
          runId: run._id,
          scheduleId: run.scheduleId,
          scheduleName:
            schedule?.userId === userId ? schedule.name : "Deleted schedule",
          profileName:
            profile?.userId === userId ? profile.name : "Deleted profile",
          state: run.state,
          scheduledFor: run.scheduledFor,
          traceId: run.traceId,
          missedOccurrences: run.missedOccurrences,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          outputId: output?.userId === userId ? output._id : undefined,
          receipt:
            receipt?.userId === userId
              ? {
                  state: receipt.state,
                  directUrl: receipt.directUrl,
                  errorCode: receipt.errorCode,
                  attemptedAt: receipt.attemptedAt,
                  verifiedAt: receipt.verifiedAt,
                }
              : null,
        };
      }),
    );
  },
});

export const getDashboardMine = query({
  args: {},
  returns: v.object({
    activeProfiles: v.number(),
    activeSchedules: v.number(),
    draftsAwaitingApproval: v.number(),
    liveReceipts: v.number(),
    recentRuns: v.array(runSummary),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const [profiles, schedules, awaiting, receipts, recentRuns] =
      await Promise.all([
        ctx.db
          .query("automationProfiles")
          .withIndex("by_userId_and_status", (q) =>
            q.eq("userId", userId).eq("status", "active"),
          )
          .take(100),
        ctx.db
          .query("schedules")
          .withIndex("by_userId_and_status", (q) =>
            q.eq("userId", userId).eq("status", "active"),
          )
          .take(100),
        ctx.db
          .query("runs")
          .withIndex("by_userId_and_state", (q) =>
            q.eq("userId", userId).eq("state", "awaiting_approval"),
          )
          .take(100),
        ctx.db
          .query("publicationReceipts")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .order("desc")
          .take(100),
        ctx.db
          .query("runs")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .order("desc")
          .take(5),
      ]);
    const summaries = await Promise.all(
      recentRuns.map(async (run) => {
        const [schedule, output, receipt] = await Promise.all([
          ctx.db.get("schedules", run.scheduleId),
          ctx.db
            .query("outputs")
            .withIndex("by_runId", (q) => q.eq("runId", run._id))
            .unique(),
          ctx.db
            .query("publicationReceipts")
            .withIndex("by_runId", (q) => q.eq("runId", run._id))
            .unique(),
        ]);
        let profile: Doc<"automationProfiles"> | null = null;
        if (schedule?.userId === userId)
          profile = await ctx.db.get("automationProfiles", schedule.profileId);
        return {
          runId: run._id,
          scheduleId: run.scheduleId,
          scheduleName:
            schedule?.userId === userId ? schedule.name : "Deleted schedule",
          profileName:
            profile?.userId === userId ? profile.name : "Deleted profile",
          state: run.state,
          scheduledFor: run.scheduledFor,
          traceId: run.traceId,
          missedOccurrences: run.missedOccurrences,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          outputId: output?.userId === userId ? output._id : undefined,
          receipt:
            receipt?.userId === userId
              ? {
                  state: receipt.state,
                  directUrl: receipt.directUrl,
                  errorCode: receipt.errorCode,
                  attemptedAt: receipt.attemptedAt,
                  verifiedAt: receipt.verifiedAt,
                }
              : null,
        };
      }),
    );
    return {
      activeProfiles: profiles.length,
      activeSchedules: schedules.length,
      draftsAwaitingApproval: awaiting.length,
      liveReceipts: receipts.filter((receipt) => receipt.state === "live")
        .length,
      recentRuns: summaries,
    };
  },
});
