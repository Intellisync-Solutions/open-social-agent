import { ProviderProbeError, runProviderProbe } from "./provider-probe";

if (process.env.RUN_LIVE_PROVIDER_TEST !== "1") {
  throw new Error(
    "Live provider verification is disabled. Set RUN_LIVE_PROVIDER_TEST=1 explicitly.",
  );
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not available to this process.");
}

try {
  const modelsVisible = await runProviderProbe({
    apiKey,
    baseURL: "https://api.openai.com/v1",
  });
  console.log(
    `Provider authentication verified: ${modelsVisible} model(s) visible; no generation requested.`,
  );
} catch (error) {
  if (error instanceof ProviderProbeError) {
    console.error(
      `Provider authentication verification failed: ${error.message}; status=${error.status ?? "unavailable"}.`,
    );
  } else {
    console.error("Provider authentication verification failed: network error.");
  }
  process.exitCode = 1;
}
