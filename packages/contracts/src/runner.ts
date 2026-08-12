import { z } from "zod";

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

export type RunnerProviderKind = z.infer<typeof RunnerProviderKindSchema>;
export type RunnerSecretInput = z.infer<typeof RunnerSecretInputSchema>;
