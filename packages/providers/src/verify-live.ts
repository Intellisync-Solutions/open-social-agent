import type { ConfigurationSnapshot } from "@open-social-agent/contracts";
import { createOpenAIProvider, modelPresets } from "./index";

if (process.env.RUN_LIVE_GENERATION_TEST !== "1") {
  throw new Error(
    "Live generation verification is disabled. Set RUN_LIVE_GENERATION_TEST=1 explicitly.",
  );
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is not available.");

const snapshot: ConfigurationSnapshot = {
  schemaVersion: 1,
  profileRevision: 1,
  scheduleRevision: 1,
  profile: {
    name: "Guarded verification",
    destination: {
      feedUrl: "https://example.com/verification-only",
      allowedOrigin: "https://example.com",
    },
    content: {
      topics: ["evidence-led software delivery"],
      persona: "A careful software maintainer",
      tone: "Plain and factual",
      style: "One short sentence",
      structure: "One claim",
      customInstructions: "State that this is a local verification draft.",
      exclusions: ["marketing claims", "calls to action"],
    },
    research: {
      webSearchEnabled: false,
      allowedDomains: [],
      citationsRequired: false,
      freshnessDays: 1,
      maxSources: 1,
    },
    model: {
      provider: "openai",
      preset: "economy",
      modelId: modelPresets.economy.modelId,
      reasoningEffort: modelPresets.economy.reasoningEffort,
      maxOutputTokens: 128,
      perRunTokenGate: 1_024,
      dailyTokenGate: 1_024,
    },
  },
  schedule: {
    name: "Verification only",
    cadence: "daily",
    timezone: "America/Toronto",
    localTime: "09:30",
  },
};

try {
  const result = await createOpenAIProvider().compose({
    apiKey,
    snapshot,
    evidencePacket: "No external evidence admitted for this verification.",
  });
  console.log(
    JSON.stringify({
      status: "verified",
      requestedModel: result.requestedModel,
      actualModel: result.actualModel,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      bodyCharacters: result.output.body.length,
      searchUsed: false,
      externalWrite: false,
    }),
  );
} catch (error) {
  const bounded =
    error && typeof error === "object"
      ? {
          status: "status" in error ? error.status : undefined,
          code: "code" in error ? error.code : undefined,
          param: "param" in error ? error.param : undefined,
          type: "type" in error ? error.type : undefined,
        }
      : {};
  console.error(
    `Guarded structured-output generation verification failed: ${JSON.stringify(bounded)}.`,
  );
  process.exitCode = 1;
}
