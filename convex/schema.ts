import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

export default defineSchema({
  ...authTables,
  onboardingDrafts: defineTable({
    userId: v.id("users"),
    schemaVersion: v.literal(1),
    currentStep: onboardingStep,
    completedSteps: v.array(onboardingStep),
    draftJson: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
