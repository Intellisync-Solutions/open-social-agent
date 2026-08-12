import { v } from "convex/values";

export const destinationPolicy = v.object({
  feedUrl: v.string(),
  allowedOrigin: v.string(),
});

export const contentPolicy = v.object({
  topics: v.array(v.string()),
  persona: v.string(),
  tone: v.string(),
  style: v.string(),
  structure: v.string(),
  customInstructions: v.string(),
  exclusions: v.array(v.string()),
});

export const researchPolicy = v.object({
  webSearchEnabled: v.boolean(),
  allowedDomains: v.array(v.string()),
  citationsRequired: v.boolean(),
  freshnessDays: v.number(),
  maxSources: v.number(),
});

export const providerKind = v.union(
  v.literal("openai"),
  v.literal("responses-compatible"),
);
export const modelPreset = v.union(
  v.literal("economy"),
  v.literal("balanced"),
  v.literal("quality"),
  v.literal("advanced"),
);
export const reasoningEffort = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
);
export const modelPolicy = v.object({
  provider: providerKind,
  preset: modelPreset,
  modelId: v.string(),
  reasoningEffort,
  maxOutputTokens: v.number(),
  perRunTokenGate: v.number(),
  dailyTokenGate: v.number(),
});

export const profileInput = {
  name: v.string(),
  destination: destinationPolicy,
  content: contentPolicy,
  research: researchPolicy,
  model: modelPolicy,
};

export const scheduleCadence = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("advanced"),
);
export const scheduleInput = {
  name: v.string(),
  cadence: scheduleCadence,
  timezone: v.string(),
  localTime: v.string(),
  weekday: v.optional(v.number()),
  advancedCron: v.optional(v.string()),
};

export const lifecycleStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

export const runState = v.union(
  v.literal("queued"),
  v.literal("claimed"),
  v.literal("researching"),
  v.literal("composing"),
  v.literal("evaluating"),
  v.literal("awaiting_approval"),
  v.literal("approved"),
  v.literal("executing"),
  v.literal("verifying"),
  v.literal("live"),
  v.literal("pending"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("rejected"),
  v.literal("cancelled"),
);

export const draftOutput = v.object({
  body: v.string(),
  assumptions: v.array(v.string()),
  riskFlags: v.array(v.string()),
  sourceMap: v.array(
    v.object({ claim: v.string(), evidenceIds: v.array(v.string()) }),
  ),
});

export const approvalDecision = v.union(
  v.literal("approved"),
  v.literal("rejected"),
);

export const receiptState = v.union(
  v.literal("live"),
  v.literal("pending"),
  v.literal("blocked"),
  v.literal("failed"),
);
