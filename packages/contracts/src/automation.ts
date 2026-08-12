import { z } from "zod";
import {
  ModelPresetSchema,
  ReasoningEffortSchema,
  ScheduleCadenceSchema,
} from "./onboarding";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const modelPresetPolicies = {
  economy: { modelId: "gpt-5.6-luna", reasoningEffort: "low" },
  balanced: { modelId: "gpt-5.6-terra", reasoningEffort: "medium" },
  quality: { modelId: "gpt-5.6-sol", reasoningEffort: "high" },
} as const;

export const openAIComputerModel = "gpt-5.6" as const;

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

export const DraftOutputSchema = z.object({
  body: z.string().trim().min(1).max(8_000),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(12),
  riskFlags: z.array(z.string().trim().min(1).max(120)).max(12),
  sourceMap: z
    .array(
      z.object({
        claim: z.string().trim().min(1).max(500),
        sourceUrls: z.array(z.string().url()).max(8),
      }),
    )
    .max(30),
});

export const ProviderExecutionResultSchema = z.object({
  responseId: z.string().min(1).max(200),
  requestedModel: z.string().min(1).max(120),
  actualModel: z.string().min(1).max(120),
  output: DraftOutputSchema,
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  latencyMs: z.number().int().nonnegative(),
  requestId: z.string().max(200).nullable(),
});

export const ApprovalDecisionInputSchema = z.object({
  runId: z.string().min(1),
  outputId: z.string().min(1),
  revision: z.number().int().positive(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  destinationUrl: z.string().url(),
  expiresAt: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
});

const screenCoordinate = z.number().int().min(0).max(10_000);
const modifierKeys = z.array(z.string().min(1).max(30)).max(8).nullable().optional();

export const ComputerActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: screenCoordinate,
    y: screenCoordinate,
    button: z.enum(["left", "right", "wheel", "back", "forward"]),
    keys: modifierKeys,
  }),
  z.object({
    type: z.literal("double_click"),
    x: screenCoordinate,
    y: screenCoordinate,
    keys: modifierKeys,
  }),
  z.object({
    type: z.literal("drag"),
    path: z
      .array(z.object({ x: screenCoordinate, y: screenCoordinate }))
      .min(2)
      .max(100),
    keys: modifierKeys,
  }),
  z.object({ type: z.literal("keypress"), keys: z.array(z.string().min(1).max(30)).min(1).max(8) }),
  z.object({ type: z.literal("move"), x: screenCoordinate, y: screenCoordinate, keys: modifierKeys }),
  z.object({ type: z.literal("screenshot") }),
  z.object({
    type: z.literal("scroll"),
    x: screenCoordinate,
    y: screenCoordinate,
    scroll_x: z.number().int().min(-10_000).max(10_000),
    scroll_y: z.number().int().min(-10_000).max(10_000),
    keys: modifierKeys,
  }),
  z.object({ type: z.literal("type"), text: z.string().max(8_000) }),
  z.object({ type: z.literal("wait") }),
]);

export const BrowserActionSchema = z.union([
  ComputerActionSchema,
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
]);

export const ComputerSafetyCheckSchema = z.object({
  id: z.string().min(1).max(200),
  code: z.string().max(200).nullable().optional(),
  message: z.string().max(1_000).nullable().optional(),
});

export const ComputerCallSchema = z.object({
  type: z.literal("computer_call"),
  call_id: z.string().min(1).max(200),
  actions: z.array(ComputerActionSchema).min(1).max(25),
  pending_safety_checks: z.array(ComputerSafetyCheckSchema).max(20),
});

export const PublicationReceiptStateSchema = z.enum([
  "live",
  "pending",
  "blocked",
  "failed",
]);

export const RunnerPublicationRequestSchema = z.object({
  approvalId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  destinationUrl: z.string().url(),
  approvedBody: z.string().min(1).max(8_000),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
  browserKind: z.enum(["brave", "chrome", "edge", "chromium"]),
});

export const RunnerPublicationEvidenceSchema = z.object({
  approvalId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  state: PublicationReceiptStateSchema,
  destinationUrl: z.string().url(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  directUrl: z.string().url().nullable(),
  attemptedAt: z.number().int().nonnegative(),
  verifiedAt: z.number().int().nonnegative().nullable(),
  errorCode: z.string().max(120).nullable(),
  traceId: z.string().min(1).max(200),
});

export const RunnerComposeInputSchema = z.object({
  snapshot: z.lazy(() => ConfigurationSnapshotSchema),
  evidencePacket: z.string().max(64_000),
});

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
export type DraftOutput = z.infer<typeof DraftOutputSchema>;
export type ProviderExecutionResult = z.infer<
  typeof ProviderExecutionResultSchema
>;
export type ComputerAction = z.infer<typeof ComputerActionSchema>;
export type ComputerSafetyCheck = z.infer<typeof ComputerSafetyCheckSchema>;
export type ConfigurationSnapshot = z.infer<
  typeof ConfigurationSnapshotSchema
>;
