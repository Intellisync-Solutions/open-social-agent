import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  contentPolicy,
  destinationPolicy,
  lifecycleStatus,
  modelPolicy,
  researchPolicy,
  runState,
  scheduleCadence,
} from "./validators";

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
  automationProfiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    destination: destinationPolicy,
    content: contentPolicy,
    research: researchPolicy,
    model: modelPolicy,
    status: lifecycleStatus,
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_and_status", ["userId", "status"]),
  schedules: defineTable({
    userId: v.id("users"),
    profileId: v.id("automationProfiles"),
    name: v.string(),
    cadence: scheduleCadence,
    timezone: v.string(),
    localTime: v.string(),
    weekday: v.optional(v.number()),
    advancedCron: v.optional(v.string()),
    status: lifecycleStatus,
    revision: v.number(),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_profileId", ["profileId"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"]),
  runs: defineTable({
    userId: v.id("users"),
    scheduleId: v.id("schedules"),
    occurrenceKey: v.string(),
    scheduledFor: v.number(),
    state: runState,
    configurationSnapshotJson: v.string(),
    traceId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_state", ["userId", "state"])
    .index("by_scheduleId", ["scheduleId"])
    .index("by_occurrenceKey", ["occurrenceKey"]),
});
