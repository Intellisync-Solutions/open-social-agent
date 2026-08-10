import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const onboardingStep = v.union(
  v.literal("welcome"),
  v.literal("provider"),
  v.literal("browser"),
  v.literal("destination"),
  v.literal("voice"),
  v.literal("research"),
  v.literal("schedule"),
  v.literal("review"),
);

const onboardingDraft = v.object({
  _id: v.id("onboardingDrafts"),
  _creationTime: v.number(),
  userId: v.id("users"),
  schemaVersion: v.literal(1),
  currentStep: onboardingStep,
  completedSteps: v.array(onboardingStep),
  draftJson: v.string(),
  updatedAt: v.number(),
});

export const getMine = query({
  args: {},
  returns: v.union(v.null(), onboardingDraft),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("AUTH_REQUIRED");
    }
    return await ctx.db
      .query("onboardingDrafts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const saveMine = mutation({
  args: {
    schemaVersion: v.literal(1),
    currentStep: onboardingStep,
    completedSteps: v.array(onboardingStep),
    draftJson: v.string(),
    updatedAt: v.number(),
  },
  returns: v.id("onboardingDrafts"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("AUTH_REQUIRED");
    }
    if (args.draftJson.length > 32_000) {
      throw new ConvexError("ONBOARDING_DRAFT_TOO_LARGE");
    }
    const existing = await ctx.db
      .query("onboardingDrafts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing !== null) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("onboardingDrafts", { ...args, userId });
  },
});
