import { z } from "zod";
import { ConfigurationSnapshotSchema, HarnessExecutionResultSchema } from "./automation";

export const RunnerProviderKindSchema = z.enum([
  "openai",
  "responses-compatible",
]);

export const RunnerPairRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const RunnerSecretInputSchema = z.object({
  provider: RunnerProviderKindSchema,
  apiKey: z.string().trim().min(20).max(512),
});

export const RunnerSecretStatusSchema = z.object({
  provider: RunnerProviderKindSchema,
  configured: z.boolean(),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{8}$/)
    .nullable(),
});

export const ProviderCapabilityProbeSchema = z.object({
  provider: RunnerProviderKindSchema,
  baseUrl: z.string().url().max(500).optional(),
});

export const ProviderCapabilityResultSchema = z.object({
  provider: RunnerProviderKindSchema,
  reachable: z.boolean(),
  authenticated: z.boolean(),
  modelsVisible: z.number().int().nonnegative(),
  checkedAt: z.number().int().nonnegative(),
  capabilityClaims: z.object({
    responses: z.literal("unverified"),
    structuredOutput: z.literal("unverified"),
    webSearch: z.literal("unverified"),
    computer: z.literal("unverified"),
    usage: z.literal("unverified"),
  }),
});

export const RunnerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{20,80}$/);
export const RunnerDeviceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const RunnerTokenHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RunnerRequestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);

export const RunnerRegistrationInputSchema = z.object({
  runnerId: RunnerIdSchema,
  tokenHash: RunnerTokenHashSchema,
  label: z.string().trim().min(1).max(80),
});

export const RunnerProvisionInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export const RunnerProvisionResultSchema = z.object({
  registrationId: z.string().min(1).max(200),
  runnerId: RunnerIdSchema,
  token: RunnerDeviceTokenSchema,
});

export const RunnerClaimRequestSchema = z.object({
  runnerId: RunnerIdSchema,
  requestId: RunnerRequestIdSchema,
});

export const RunnerClaimResponseSchema = z.object({
  userId: z.string().min(1).max(200),
  registrationId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  approvalId: z.string().min(1).max(200),
  outputId: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  body: z.string().min(1).max(8_000),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  destinationUrl: z.string().url(),
  approvalExpiresAt: z.number().int().positive(),
  leaseExpiresAt: z.number().int().positive(),
  executionRequestId: RunnerRequestIdSchema,
  modelId: z.string().min(1).max(120),
});

export const RunnerReceiptRequestSchema = z.object({
  runnerId: RunnerIdSchema,
  runId: z.string().min(1).max(200),
  approvalId: z.string().min(1).max(200),
  executionRequestId: RunnerRequestIdSchema,
  state: z.enum(["live", "pending", "blocked", "failed"]),
  destinationUrl: z.string().url(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  directUrl: z.string().url().nullable(),
  errorCode: z.string().max(120).nullable(),
  requestedModel: z.string().min(1).max(120),
  actualModel: z.string().min(1).max(120),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  turns: z.number().int().min(0).max(20),
  actionsExecuted: z.number().int().nonnegative().max(500),
}).refine(
  (value) => value.totalTokens === value.inputTokens + value.outputTokens,
  { message: "Token totals must match provider usage." },
);

export const RunnerDeviceRegistrationSchema = z.object({
  runnerId: RunnerIdSchema,
  token: RunnerDeviceTokenSchema,
  siteUrl: z.string().url().max(500),
});

export const RunnerProcessRequestSchema = z.object({
  requestId: RunnerRequestIdSchema,
  browserKind: z.enum(["brave", "chrome", "edge", "chromium"]),
});

export const RunnerHarnessClaimRequestSchema = z.object({
  runnerId: RunnerIdSchema,
  requestId: RunnerRequestIdSchema,
});

export const RunnerHarnessClaimResponseSchema = z.object({
  userId: z.string().min(1).max(200),
  registrationId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  executionRequestId: RunnerRequestIdSchema,
  leaseExpiresAt: z.number().int().positive(),
  snapshot: ConfigurationSnapshotSchema,
  recentBodies: z.array(z.string().min(1).max(8_000)).max(20),
});

export const RunnerHarnessReceiptRequestSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("completed"),
    runnerId: RunnerIdSchema,
    runId: z.string().min(1).max(200),
    executionRequestId: RunnerRequestIdSchema,
    result: HarnessExecutionResultSchema,
  }),
  z.object({
    state: z.literal("failed"),
    runnerId: RunnerIdSchema,
    runId: z.string().min(1).max(200),
    executionRequestId: RunnerRequestIdSchema,
    errorCode: z.string().regex(/^[A-Z0-9_]+$/).max(120),
  }),
]);

export const RunnerHarnessProcessRequestSchema = z.object({
  requestId: RunnerRequestIdSchema,
});

export type RunnerProviderKind = z.infer<typeof RunnerProviderKindSchema>;
export type RunnerSecretInput = z.infer<typeof RunnerSecretInputSchema>;
export type RunnerClaimResponse = z.infer<typeof RunnerClaimResponseSchema>;
export type RunnerHarnessClaimResponse = z.infer<typeof RunnerHarnessClaimResponseSchema>;
