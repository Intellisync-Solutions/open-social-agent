import { getAuthUserId } from "@convex-dev/auth/server";
import { AutomationProfileInputSchema } from "@open-social-agent/contracts";
import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { profileInput } from "./validators";

const profile = v.object({
  _id: v.id("automationProfiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  ...profileInput,
  status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("AUTH_REQUIRED");
  return userId;
}

function validateProfile(args: unknown) {
  const parsed = AutomationProfileInputSchema.safeParse(args);
  if (!parsed.success) throw new ConvexError("PROFILE_INVALID");
  const feed = new URL(parsed.data.destination.feedUrl);
  if (
    feed.protocol !== "https:" ||
    feed.origin !== parsed.data.destination.allowedOrigin
  ) {
    throw new ConvexError("DESTINATION_INVALID");
  }
  if (
    parsed.data.model.maxOutputTokens > parsed.data.model.perRunTokenGate ||
    parsed.data.model.perRunTokenGate > parsed.data.model.dailyTokenGate
  ) {
    throw new ConvexError("MODEL_POLICY_INVALID");
  }
}

export const listMine = query({
  args: { status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")) },
  returns: v.array(profile),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.query("automationProfiles").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", args.status)).order("desc").take(100);
  },
});

export const createMine = mutation({
  args: profileInput,
  returns: v.id("automationProfiles"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    validateProfile(args);
    const now = Date.now();
    return await ctx.db.insert("automationProfiles", { ...args, userId, status: "active", revision: 1, createdAt: now, updatedAt: now });
  },
});

export const updateMine = mutation({
  args: { profileId: v.id("automationProfiles"), ...profileInput },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("automationProfiles", args.profileId);
    if (!current || current.userId !== userId) throw new ConvexError("PROFILE_NOT_FOUND");
    if (current.status === "archived") throw new ConvexError("PROFILE_ARCHIVED");
    const { profileId, ...input } = args;
    validateProfile(input);
    await ctx.db.patch(profileId, { ...input, revision: current.revision + 1, updatedAt: Date.now() });
    return null;
  },
});

export const setStatusMine = mutation({
  args: { profileId: v.id("automationProfiles"), status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("automationProfiles", args.profileId);
    if (!current || current.userId !== userId) throw new ConvexError("PROFILE_NOT_FOUND");
    if (args.status !== "active") {
      const linked = await ctx.db
        .query("schedules")
        .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
        .take(100);
      if (linked.some((item) => item.status === "active")) {
        throw new ConvexError("PROFILE_HAS_ACTIVE_SCHEDULE");
      }
    }
    await ctx.db.patch(args.profileId, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

export const purgeMine = mutation({
  args: { profileId: v.id("automationProfiles"), confirmName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get("automationProfiles", args.profileId);
    if (!current || current.userId !== userId) throw new ConvexError("PROFILE_NOT_FOUND");
    if (current.status !== "archived" || current.name !== args.confirmName) throw new ConvexError("PURGE_CONFIRMATION_REQUIRED");
    const linked = await ctx.db.query("schedules").withIndex("by_profileId", (q) => q.eq("profileId", args.profileId)).take(1);
    if (linked.length > 0) throw new ConvexError("PROFILE_IN_USE");
    await ctx.db.delete(args.profileId);
    return null;
  },
});
