import type { ConfigurationSnapshot } from "@open-social-agent/contracts";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIProvider, modelPresets } from "./index";

const snapshot = {
  schemaVersion: 1,
  profileRevision: 1,
  scheduleRevision: 1,
  profile: {
    name: "Signal",
    destination: {
      feedUrl: "https://social.example/feed/acme",
      allowedOrigin: "https://social.example",
    },
    content: {
      topics: ["AI operations"],
      persona: "Operator",
      tone: "Clear",
      style: "Concise",
      structure: "Claim, evidence, implication",
      customInstructions: "Do not overclaim.",
      exclusions: ["unsupported claims"],
    },
    research: {
      webSearchEnabled: false,
      allowedDomains: [],
      citationsRequired: false,
      freshnessDays: 7,
      maxSources: 8,
    },
    model: {
      provider: "openai",
      preset: "balanced",
      modelId: modelPresets.balanced.modelId,
      reasoningEffort: "medium",
      maxOutputTokens: 1_200,
      perRunTokenGate: 12_000,
      dailyTokenGate: 50_000,
    },
  },
  schedule: {
    name: "Daily",
    cadence: "daily",
    timezone: "America/Toronto",
    localTime: "09:30",
  },
} satisfies ConfigurationSnapshot;

describe("OpenAI provider adapter", () => {
  it("uses centralized preset model IDs", () => {
    expect(modelPresets).toEqual({
      economy: { modelId: "gpt-5.6-luna", reasoningEffort: "low" },
      balanced: { modelId: "gpt-5.6-terra", reasoningEffort: "medium" },
      quality: { modelId: "gpt-5.6-sol", reasoningEffort: "high" },
    });
  });

  it("requests strict structured output with storage disabled", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_test",
      model: "gpt-5.6-terra",
      output_text: JSON.stringify({
        body: "Evidence first.",
        assumptions: [],
        riskFlags: [],
        sourceMap: [{ claim: "Evidence first.", evidenceIds: ["ev_0123456789abcdef"] }],
      }),
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      _request_id: "req_test",
    });
    const provider = createOpenAIProvider({
      clientFactory: () => ({ responses: { create } }) as never,
    });
    const result = await provider.compose({
      apiKey: "synthetic-test-key",
      snapshot,
      evidencePacket: JSON.stringify({ evidence: [{ id: "ev_0123456789abcdef" }] }),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-terra",
        max_output_tokens: 1_200,
        reasoning: { effort: "medium" },
        store: false,
        text: { format: expect.objectContaining({ type: "json_schema", strict: true }) },
      }),
    );
    const request = create.mock.calls[0]?.[0];
    expect(JSON.stringify(request.text.format.schema)).not.toMatch(
      /maxLength|maxItems|format|\$schema/,
    );
    expect(result).toMatchObject({
      requestedModel: "gpt-5.6-terra",
      actualModel: "gpt-5.6-terra",
      usage: { totalTokens: 30 },
      output: { body: "Evidence first." },
    });
  });
});
