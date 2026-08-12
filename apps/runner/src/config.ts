import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const runnerConfigSchema = z.object({
  host: z.literal("127.0.0.1").default("127.0.0.1"),
  port: z.coerce.number().int().min(1024).max(65535).default(43117),
  webOrigin: z
    .string()
    .url()
    .refine((value) => !value.includes("*"), "Wildcards are not allowed."),
  dataDirectory: z.string().min(1),
  forceEncryptedStore: z.boolean(),
  fallbackEncryptionKey: z.string().optional(),
  generationEnabled: z.boolean(),
  computerEnabled: z.boolean(),
  pollingEnabled: z.boolean(),
  pollingIntervalMs: z
    .number()
    .int()
    .min(15_000)
    .max(15 * 60_000),
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;

export function loadRunnerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RunnerConfig {
  return runnerConfigSchema.parse({
    host: "127.0.0.1",
    port: environment.OSA_RUNNER_PORT ?? 43117,
    webOrigin: environment.OSA_WEB_ORIGIN ?? "http://localhost:3000",
    dataDirectory:
      environment.OSA_DATA_DIR ?? join(homedir(), ".open-social-agent"),
    forceEncryptedStore: environment.OSA_SECRET_STORE === "encrypted-file",
    fallbackEncryptionKey: environment.LOCAL_SECRET_ENCRYPTION_KEY,
    generationEnabled: environment.OSA_ENABLE_GENERATION === "1",
    computerEnabled: environment.OSA_ENABLE_COMPUTER === "1",
    pollingEnabled: environment.OSA_ENABLE_POLLING === "1",
    pollingIntervalMs: environment.OSA_POLL_INTERVAL_MS
      ? Number(environment.OSA_POLL_INTERVAL_MS)
      : 60_000,
  });
}
