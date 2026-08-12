import type { ConfigurationSnapshot } from "@open-social-agent/contracts";
import { describe, expect, it } from "vitest";
import {
  assertRunTransition,
  planZeroPostRun,
  validateCompositionInput,
} from "./index";

const snapshot: ConfigurationSnapshot = {
  schemaVersion: 1,
  profileRevision: 2,
  scheduleRevision: 4,
  profile: {
    name: "Build with Evidence",
    destination: {
      feedUrl: "https://social.example/feed/acme",
      allowedOrigin: "https://social.example",
    },
    content: {
      topics: ["AI operations"],
      persona: "Evidence-led operator",
      tone: "Clear",
      style: "Concise",
      structure: "Claim, evidence, implication",
      customInstructions: "Do not overclaim.",
      exclusions: ["unsupported claims"],
    },
    research: {
      webSearchEnabled: true,
      allowedDomains: ["openai.com"],
      citationsRequired: true,
      freshnessDays: 7,
      maxSources: 8,
    },
    model: {
      provider: "openai",
      preset: "balanced",
      modelId: "configured-at-runtime",
      reasoningEffort: "medium",
      maxOutputTokens: 1_200,
      perRunTokenGate: 12_000,
      dailyTokenGate: 50_000,
    },
  },
  schedule: {
    name: "Weekday signal",
    cadence: "daily",
    timezone: "America/Toronto",
    localTime: "09:30",
  },
};

describe("governed harness", () => {
  it("rejects non-adjacent state transitions", () => {
    expect(() => assertRunTransition("queued", "live")).toThrow(
      "RUN_TRANSITION_INVALID",
    );
  });

  it("creates a bounded zero-post plan with no external writes", () => {
    expect(planZeroPostRun(snapshot)).toMatchObject({
      mode: "zero-post",
      outputBudget: 1_200,
      contextBudget: 10_800,
      selectedTools: ["web_search"],
      nextState: "claimed",
      externalWrites: 0,
    });
  });

  it("fails closed when the output request exceeds the run gate", () => {
    expect(() =>
      planZeroPostRun({
        ...snapshot,
        profile: {
          ...snapshot.profile,
          model: {
            ...snapshot.profile.model,
            maxOutputTokens: 2_000,
            perRunTokenGate: 1_000,
          },
        },
      }),
    ).toThrow("BUDGET_DENIED");
  });

  it("blocks composition when citations are required without evidence", () => {
    expect(() => validateCompositionInput(snapshot, "")).toThrow(
      "GROUNDING_INSUFFICIENT",
    );
  });
});
