import { createSecretStore } from "@open-social-agent/secrets";
import { join } from "node:path";
import { loadRunnerConfig } from "./config";
import { buildRunner } from "./server";

const config = loadRunnerConfig();
const secretStore = createSecretStore({
  fallbackFilePath: join(config.dataDirectory, "secrets.v1.json"),
  fallbackEncryptionKey: config.fallbackEncryptionKey,
  forceEncryptedFile: config.forceEncryptedStore,
});
const { app, pairingCode } = buildRunner({ config, secretStore });

await app.listen({ host: config.host, port: config.port });
process.stdout.write(
  `Open Social Agent runner ready at http://localhost:${config.port}\n` +
    `Pairing code: ${pairingCode} (expires in 10 minutes)\n` +
    `Authorized web origin: ${config.webOrigin}\n`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
