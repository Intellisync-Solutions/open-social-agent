import { describe, expect, it, vi } from "vitest";
import { claimApprovedRun, submitPublicationReceipt } from "./convex-bridge";

const token = "a".repeat(43);
const runnerId = "runner_device_identifier_01";

describe("runner Convex bridge", () => {
  it("authenticates and validates an approved claim", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "user_1",
          registrationId: "registration_1",
          runId: "run_1",
          approvalId: "approval_1",
          outputId: "output_1",
          revision: 1,
          body: "Approved body.",
          bodyHash: "b".repeat(64),
          destinationUrl: "https://social.example/feed/acme",
          approvalExpiresAt: Date.now() + 60_000,
          leaseExpiresAt: Date.now() + 60_000,
          executionRequestId: "execution-request-0001",
          modelId: "gpt-5.6",
        }),
        { status: 200 },
      ),
    );
    const claim = await claimApprovedRun({
      siteUrl: "https://example.convex.site",
      runnerId,
      token,
      requestId: "execution-request-0001",
      fetchImpl,
    });
    expect(claim?.body).toBe("Approved body.");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://example.convex.site/runner/claim"),
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({ authorization: `Bearer ${token}` }),
      }),
    );
  });

  it("treats an empty queue as a truthful no-op", async () => {
    expect(
      await claimApprovedRun({
        siteUrl: "https://example.convex.site",
        runnerId,
        token,
        requestId: "execution-request-0002",
        fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      }),
    ).toBeNull();
  });

  it("submits only a validated terminal receipt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ receiptId: "receipt_1" }), { status: 201 }),
    );
    await expect(
      submitPublicationReceipt({
        siteUrl: "https://example.convex.site",
        token,
        receipt: {
          runnerId,
          runId: "run_1",
          approvalId: "approval_1",
          executionRequestId: "execution-request-0001",
          state: "live",
          destinationUrl: "https://social.example/feed/acme",
          bodyHash: "b".repeat(64),
          directUrl: "https://social.example/feed/acme/post/1",
          errorCode: null,
          requestedModel: "gpt-5.6",
          actualModel: "gpt-5.6-2026-08-01",
          inputTokens: 20,
          outputTokens: 5,
          totalTokens: 25,
          turns: 2,
          actionsExecuted: 3,
        },
        fetchImpl,
      }),
    ).resolves.toEqual({ receiptId: "receipt_1" });
  });

  it("rejects non-HTTPS bridge origins", async () => {
    await expect(
      claimApprovedRun({
        siteUrl: "http://example.convex.site",
        runnerId,
        token,
        requestId: "execution-request-0003",
      }),
    ).rejects.toThrow("CONVEX_SITE_URL_INVALID");
  });
});
