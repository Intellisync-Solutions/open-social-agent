import type { ConfigurationSnapshot } from "@open-social-agent/contracts";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIResearchProvider, extractResearchEvidence } from "./research";

const snapshot = {
  schemaVersion: 1,
  profileRevision: 1,
  scheduleRevision: 1,
  profile: {
    name: "Signal",
    destination: { feedUrl: "https://social.example/feed", allowedOrigin: "https://social.example" },
    content: { topics: ["AI operations"], persona: "Operator", tone: "Clear", style: "Concise", structure: "Claim, evidence", customInstructions: "", exclusions: [] },
    research: { webSearchEnabled: true, allowedDomains: ["openai.com"], citationsRequired: true, freshnessDays: 7, maxSources: 2 },
    model: { provider: "openai", preset: "balanced", modelId: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 1_200, perRunTokenGate: 12_000, dailyTokenGate: 50_000 },
  },
  schedule: { name: "Daily", cadence: "daily", timezone: "America/Toronto", localTime: "09:30" },
} satisfies ConfigurationSnapshot;

describe("OpenAI research adapter", () => {
  it("forces bounded domain-filtered search and admits only cited allowlisted sources", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_research",
      model: "gpt-5.6-terra",
      output_text: "A grounded OpenAI update [source].",
      output: [
        { type: "web_search_call", status: "completed", action: { type: "search", queries: ["OpenAI update"], sources: [{ type: "url", url: "https://openai.com/news" }] } },
        { type: "message", content: [{ type: "output_text", text: "A grounded OpenAI update [source].", annotations: [
          { type: "url_citation", start_index: 2, end_index: 20, url: "https://openai.com/news#item", title: "OpenAI news" },
          { type: "url_citation", start_index: 2, end_index: 20, url: "https://attacker.example/injection", title: "Reject me" },
        ] }] },
      ],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      _request_id: "req_research",
    });
    const result = await createOpenAIResearchProvider({ clientFactory: () => ({ responses: { create } }) as never }).research({
      apiKey: "synthetic-key",
      snapshot,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      tools: [expect.objectContaining({ type: "web_search", filters: { allowed_domains: ["openai.com"] } })],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      store: false,
    }));
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({ domain: "openai.com", publishedAt: null });
    expect(result.queries).toEqual(["OpenAI update"]);
  });

  it("normalizes duplicate citations into deterministic evidence IDs", () => {
    const output = [{ type: "message", content: [{ type: "output_text", annotations: [
      { type: "url_citation", url: "https://openai.com/a#one", title: "A", start_index: 0, end_index: 3 },
      { type: "url_citation", url: "https://openai.com/a#two", title: "A", start_index: 0, end_index: 3 },
    ] }] }];
    expect(extractResearchEvidence(output, "abc", ["openai.com"], 8, 100).evidence).toHaveLength(1);
  });
});
