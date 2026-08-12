import { getAuthUserId } from "@convex-dev/auth/server";
import {
  ConfigurationSnapshotSchema,
  ScheduleInputSchema,
  type ConfigurationSnapshot,
  type ScheduleInput,
} from "@open-social-agent/contracts";
import {
  latestDueOccurrence,
  nextOccurrence,
  occurrenceKey,
} from "@open-social-agent/scheduling";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { scheduleInput } from "./validators";

const schedule = v.object({
  _id: v.id("schedules"),
  _creationTime: v.number(),
  userId: v.id("users"),
  profileId: v.id("automationProfiles"),
  ...scheduleInput,
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("archived"),
  ),
  revision: v.number(),
  nextRunAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("AUTH_REQUIRED");
  return userId;
}

function scheduleValue(record: Doc<"schedules">): ScheduleInput {
  return ScheduleInputSchema.parse({
    name: record.name,
    cadence: record.cadence,
    timezone: record.timezone,
    localTime: record.localTime,
    weekday: record.weekday,
    advancedCron: record.advancedCron,
  });
}

function validatedSchedule(candidate: unknown, afterEpochMs = Date.now()) {
  const parsed = ScheduleInputSchema.safeParse(candidate);
  if (!parsed.success) throw new ConvexError("SCHEDULE_INVALID");
  try {
    return {
      input: parsed.data,
      nextRunAt: nextOccurrence(parsed.data, afterEpochMs),
    };
  } catch {
    throw new ConvexError("SCHEDULE_INVALID");
  }
}

function configurationSnapshot(
  profile: Doc<"automationProfiles">,
  currentSchedule: Doc<"schedules">,
): ConfigurationSnapshot {
  return ConfigurationSnapshotSchema.parse({
    schemaVersion: 1,
    profileRevision: profile.revision,
    scheduleRevision: currentSchedule.revision,
    profile: {
      name: profile.name,
      destination: profile.destination,
      content: profile.content,
      research: profile.research,
      model: profile.model,
    },
    schedule: scheduleValue(currentSchedule),
  });
}

export const listMine = query({
  args: {
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  returns: v.array(schedule),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("schedules")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", args.status),
      )
      .order("desc")
      .take(100);
  },
});

export const createMine = mutation({
  args: { profileId: v.id("automationProfiles"), ...scheduleInput },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const profile = await ctx.db.get("automationProfiles", args.profileId);
    if (!profile || profile.userId !== userId || profile.status !== "active") {
      throw new ConvexError("PROFILE_NOT_ACTIVE");
    }
    const linked = await ctx.db
      .query("schedules")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .take(100);
    if (linked.length >= 100) throw new ConvexError("SCHEDULE_LIMIT_REACHED");
    const { profileId, ...candidate } = args;
    const { input, nextRunAt } = validatedSchedule(candidate);
    const now = Date.now();
    return await ctx.db.insert("schedules", {
      ...input,
      profileId,
      userId,
      status: "paused",
      revision: 1,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMine = mutation({
  args: { scheduleId: v.id("schedules"), ...scheduleInput },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("schedules", args.scheduleId);
    if (!current || current.userId !== userId) {
      throw new ConvexError("SCHEDULE_NOT_FOUND");
    }
    if (current.status === "archived") {
      throw new ConvexError("SCHEDULE_ARCHIVED");
    }
    const { scheduleId, ...candidate } = args;
    const { input, nextRunAt } = validatedSchedule(candidate);
    await ctx.db.patch(scheduleId, {
      ...input,
      nextRunAt,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setStatusMine = mutation({
  args: {
    scheduleId: v.id("schedules"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("schedules", args.scheduleId);
    if (!current || current.userId !== userId) {
      throw new ConvexError("SCHEDULE_NOT_FOUND");
    }
    let nextRunAt = current.nextRunAt;
    if (args.status === "active") {
      const profile = await ctx.db.get("automationProfiles", current.profileId);
      if (
        !profile ||
        profile.userId !== userId ||
        profile.status !== "active"
      ) {
        throw new ConvexError("PROFILE_NOT_ACTIVE");
      }
      nextRunAt = nextOccurrence(scheduleValue(current), Date.now());
    }
    await ctx.db.patch(args.scheduleId, {
      status: args.status,
      nextRunAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const purgeMine = mutation({
  args: { scheduleId: v.id("schedules"), confirmName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("schedules", args.scheduleId);
    if (!current || current.userId !== userId) {
      throw new ConvexError("SCHEDULE_NOT_FOUND");
    }
    if (current.status !== "archived" || current.name !== args.confirmName) {
      throw new ConvexError("PURGE_CONFIRMATION_REQUIRED");
    }
    const historicalRun = await ctx.db
      .query("runs")
      .withIndex("by_scheduleId", (q) => q.eq("scheduleId", args.scheduleId))
      .first();
    if (historicalRun) throw new ConvexError("SCHEDULE_HAS_RUN_HISTORY");
    await ctx.db.delete(args.scheduleId);
    return null;
  },
});

export const runNowMine = mutation({
  args: { scheduleId: v.id("schedules"), requestId: v.string() },
  returns: v.id("runs"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(args.requestId)) {
      throw new ConvexError("REQUEST_ID_INVALID");
    }
    const current = await ctx.db.get("schedules", args.scheduleId);
    if (
      !current ||
      current.userId !== userId ||
      current.status === "archived"
    ) {
      throw new ConvexError("SCHEDULE_NOT_RUNNABLE");
    }
    const profile = await ctx.db.get("automationProfiles", current.profileId);
    if (!profile || profile.userId !== userId || profile.status !== "active") {
      throw new ConvexError("PROFILE_NOT_ACTIVE");
    }
    const key = `manual:${occurrenceKey(String(current._id), 0, current.revision)}:${args.requestId}`;
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_occurrenceKey", (q) => q.eq("occurrenceKey", key))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("runs", {
      userId,
      scheduleId: current._id,
      occurrenceKey: key,
      scheduledFor: now,
      state: "queued",
      configurationSnapshotJson: JSON.stringify(
        configurationSnapshot(profile, current),
      ),
      traceId: args.requestId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const enqueueDue = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({
    created: v.number(),
    advanced: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 50), 100));
    const due = await ctx.db
      .query("schedules")
      .withIndex("by_status_and_nextRunAt", (q) =>
        q.eq("status", "active").lte("nextRunAt", now),
      )
      .take(limit);
    let created = 0;
    let advanced = 0;
    let skipped = 0;
    for (const current of due) {
      if (current.nextRunAt === undefined) continue;
      const profile = await ctx.db.get("automationProfiles", current.profileId);
      const due = latestDueOccurrence(
        scheduleValue(current),
        current.nextRunAt,
        now,
      );
      if (
        !profile ||
        profile.userId !== current.userId ||
        profile.status !== "active"
      ) {
        await ctx.db.patch(current._id, {
          status: "paused",
          nextRunAt: due.nextRunAt,
          updatedAt: now,
        });
        advanced += 1;
        continue;
      }
      const key = occurrenceKey(
        String(current._id),
        due.scheduledFor,
        current.revision,
      );
      const existing = await ctx.db
        .query("runs")
        .withIndex("by_occurrenceKey", (q) => q.eq("occurrenceKey", key))
        .unique();
      if (!existing) {
        await ctx.db.insert("runs", {
          userId: current.userId,
          scheduleId: current._id,
          occurrenceKey: key,
          scheduledFor: due.scheduledFor,
          state: "queued",
          configurationSnapshotJson: JSON.stringify(
            configurationSnapshot(profile, current),
          ),
          traceId: key,
          missedOccurrences: due.skipped > 0 ? due.skipped : undefined,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }
      await ctx.db.patch(current._id, {
        nextRunAt: due.nextRunAt,
        updatedAt: now,
      });
      advanced += 1;
      skipped += due.skipped;
    }
    return { created, advanced, skipped };
  },
});
