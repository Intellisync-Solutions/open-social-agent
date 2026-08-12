import { z } from "zod";
import {
  ModelPresetSchema,
  ReasoningEffortSchema,
  ScheduleCadenceSchema,
} from "./onboarding";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const DestinationPolicySchema = z.object({
  feedUrl: z.string().url(),
  allowedOrigin: z.string().url(),
});

export const ContentPolicySchema = z.object({
  topics: z.array(boundedText(120)).min(1).max(25),
  persona: boundedText(500),
  tone: boundedText(160),
  style: boundedText(500),
  structure: boundedText(500),
  customInstructions: z.string().trim().max(4_000),
  exclusions: z.array(boundedText(160)).max(50),
});

export const ResearchPolicySchema = z.object({
  webSearchEnabled: z.boolean(),
  allowedDomains: z.array(boundedText(253)).max(50),
  citationsRequired: z.boolean(),
  freshnessDays: z.number().int().min(1).max(365),
  maxSources: z.number().int().min(1).max(20),
});

export const ModelPolicySchema = z.object({
  provider: z.enum(["openai", "responses-compatible"]),
  preset: ModelPresetSchema,
  modelId: boundedText(120),
  reasoningEffort: ReasoningEffortSchema,
  maxOutputTokens: z.number().int().min(128).max(32_000),
  perRunTokenGate: z.number().int().min(256).max(128_000),
  dailyTokenGate: z.number().int().min(256).max(2_000_000),
});

export const AutomationProfileInputSchema = z.object({
  name: boundedText(100),
  destination: DestinationPolicySchema,
  content: ContentPolicySchema,
  research: ResearchPolicySchema,
  model: ModelPolicySchema,
});

export const ScheduleInputSchema = z
  .object({
    name: boundedText(100),
    cadence: ScheduleCadenceSchema,
    timezone: boundedText(80),
    localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    weekday: z.number().int().min(0).max(6).optional(),
    advancedCron: z.string().trim().max(120).optional(),
  })
  .superRefine((value, context) => {
    if (value.cadence === "weekly" && value.weekday === undefined) {
      context.addIssue({
        code: "custom",
        path: ["weekday"],
        message: "Weekly schedules require a weekday.",
      });
    }
    if (value.cadence === "advanced" && !value.advancedCron) {
      context.addIssue({
        code: "custom",
        path: ["advancedCron"],
        message: "Advanced schedules require a five-field cron expression.",
      });
    }
  });

export const RunStateSchema = z.enum([
  "queued",
  "claimed",
  "researching",
  "composing",
  "evaluating",
  "awaiting_approval",
  "approved",
  "executing",
  "verifying",
  "live",
  "pending",
  "blocked",
  "failed",
  "rejected",
  "cancelled",
]);

export const ConfigurationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  profileRevision: z.number().int().positive(),
  scheduleRevision: z.number().int().positive(),
  profile: AutomationProfileInputSchema,
  schedule: ScheduleInputSchema,
});

export type AutomationProfileInput = z.infer<
  typeof AutomationProfileInputSchema
>;
export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type ConfigurationSnapshot = z.infer<
  typeof ConfigurationSnapshotSchema
>;
