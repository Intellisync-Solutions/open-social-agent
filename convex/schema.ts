import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  contentPolicy,
  approvalDecision,
  draftOutput,
  destinationPolicy,
  lifecycleStatus,
  modelPolicy,
  researchPolicy,
  receiptState,
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
  outputs: defineTable({
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
  })
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_runId", ["runId"]),
  outputRevisions: defineTable({
    userId: v.id("users"),
    outputId: v.id("outputs"),
    revision: v.number(),
    body: v.string(),
    bodyHash: v.string(),
    actor: v.union(v.literal("model"), v.literal("user")),
    createdAt: v.number(),
  }).index("by_outputId_and_revision", ["outputId", "revision"]),
  approvals: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    outputId: v.id("outputs"),
    revision: v.number(),
    bodyHash: v.string(),
    destinationUrl: v.string(),
    expiresAt: v.number(),
    decision: approvalDecision,
    createdAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_outputId", ["outputId"]),
  publicationReceipts: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    approvalId: v.id("approvals"),
    state: receiptState,
    destinationUrl: v.string(),
    bodyHash: v.string(),
    directUrl: v.optional(v.string()),
    attemptedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  }).index("by_runId", ["runId"]),
});
