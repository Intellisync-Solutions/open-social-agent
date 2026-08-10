import { describe, expect, it } from "vitest";
import { deriveAllowedOrigin, OnboardingDraftSchema } from "./onboarding";

describe("onboarding contracts", () => {
  it("derives the code-enforced destination origin", () => {
    expect(deriveAllowedOrigin("https://www.linkedin.com/feed/?trk=test")).toBe(
      "https://www.linkedin.com",
    );
  });

  it("rejects insecure destinations", () => {
    expect(() => deriveAllowedOrigin("http://example.com/feed")).toThrow(
      "Destination must use HTTPS.",
    );
  });

  it("rejects a provider secret added to a draft", () => {
    const result = OnboardingDraftSchema.strict().safeParse({
      schemaVersion: 1,
      currentStep: "welcome",
      completedSteps: [],
      provider: { apiKey: "must-not-cross-boundary" },
    });
    expect(result.success).toBe(false);
  });
});
