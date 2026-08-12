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
  });
}
