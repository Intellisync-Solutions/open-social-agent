import { z } from "zod";

export const onboardingStepIds = [
  "welcome",
  "provider",
  "browser",
  "destination",
  "voice",
  "research",
  "schedule",
  "review",
] as const;

export const OnboardingStepIdSchema = z.enum(onboardingStepIds);

export const ProviderKindSchema = z.enum(["openai", "responses-compatible"]);
export const BrowserKindSchema = z.enum([
  "chrome",
  "brave",
  "edge",
  "chromium",
]);
export const ModelPresetSchema = z.enum([
  "economy",
  "balanced",
  "quality",
  "advanced",
]);
export const ReasoningEffortSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export const ScheduleCadenceSchema = z.enum(["daily", "weekly", "advanced"]);

export const OnboardingDraftSchema = z.object({
  schemaVersion: z.literal(1),
  currentStep: OnboardingStepIdSchema,
  completedSteps: z.array(OnboardingStepIdSchema),
  provider: z.object({
    kind: ProviderKindSchema,
    baseUrl: z.string().url().optional(),
    modelPreset: ModelPresetSchema,
    modelId: z.string().trim().min(1).max(120),
    reasoningEffort: ReasoningEffortSchema,
    maxOutputTokens: z.number().int().min(128).max(32_000),
    perRunTokenGate: z.number().int().min(256).max(128_000),
    secretConfigured: z.boolean(),
    secretFingerprint: z
      .string()
      .regex(/^[a-f0-9]{8}$/)
      .optional(),
  }),
  browser: z.object({
    kind: BrowserKindSchema,
    profileLabel: z.string().trim().min(1).max(80),
    authorized: z.boolean(),
  }),
  destination: z.object({
    feedUrl: z.string().url(),
    allowedOrigin: z.string().url(),
  }),
  voice: z.object({
    persona: z.string().trim().min(1).max(500),
    tone: z.string().trim().min(1).max(160),
    style: z.string().trim().min(1).max(500),
    structure: z.string().trim().min(1).max(500),
    customInstructions: z.string().trim().max(4_000),
  }),
  research: z.object({
    webSearchEnabled: z.boolean(),
    allowedDomains: z.array(z.string().trim().min(1).max(253)).max(50),
    citationsRequired: z.boolean(),
    freshnessDays: z.number().int().min(1).max(365),
    topics: z.array(z.string().trim().min(1).max(120)).min(1).max(25),
  }),
  schedule: z.object({
    cadence: ScheduleCadenceSchema,
    timezone: z.string().trim().min(1).max(80),
    localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    weekday: z.number().int().min(0).max(6).optional(),
    advancedCron: z.string().trim().max(120).optional(),
    enabled: z.boolean(),
  }),
  updatedAt: z.number().int().nonnegative(),
});

export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

export function deriveAllowedOrigin(feedUrl: string): string {
  const url = new URL(feedUrl);
  if (url.protocol !== "https:") {
    throw new Error("Destination must use HTTPS.");
  }
  url.username = "";
  url.password = "";
  return url.origin;
}
