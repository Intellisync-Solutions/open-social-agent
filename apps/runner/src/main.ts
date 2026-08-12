import { createSecretStore } from "@open-social-agent/secrets";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { loadRunnerConfig } from "./config";
import { buildRunner } from "./server";

const config = loadRunnerConfig();
const secretStore = createSecretStore({
  fallbackFilePath: join(config.dataDirectory, "secrets.v1.json"),
  fallbackEncryptionKey: config.fallbackEncryptionKey,
  forceEncryptedFile: config.forceEncryptedStore,
});
const { app, pairingCode, processNextHarness } = buildRunner({
  config,
  secretStore,
});

await app.listen({ host: config.host, port: config.port });
process.stdout.write(
  `Open Social Agent runner ready at http://localhost:${config.port}\n` +
    `Pairing code: ${pairingCode} (expires in 10 minutes)\n` +
    `Authorized web origin: ${config.webOrigin}\n` +
    `Queued-run polling: ${config.pollingEnabled ? `enabled every ${config.pollingIntervalMs}ms` : "disabled"}\n`,
);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollBusy = false;
if (config.pollingEnabled) {
  const poll = async () => {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const requestId = `poll_${randomBytes(18).toString("base64url")}`;
      const result = await processNextHarness(requestId);
      if (result.state === "failed")
        process.stderr.write(
          "Queued-run processing failed; durable run evidence was updated when a claim existed.\n",
        );
    } finally {
      pollBusy = false;
    }
  };
  pollTimer = setInterval(() => void poll(), config.pollingIntervalMs);
  pollTimer.unref();
  void poll();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (pollTimer) clearInterval(pollTimer);
    void app.close().finally(() => process.exit(0));
  });
}
