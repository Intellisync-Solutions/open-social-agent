import { describe, expect, it, vi } from "vitest";
import { runOpenAIComputerLoop } from "./computer";

const screen = {
  imageDataUrl: "data:image/png;base64,c2NyZWVu",
  currentUrl: "https://social.example/feed/acme/post/123",
};

function response(
  id: string,
  output: unknown[],
  usage = { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
) {
  return { id, model: "gpt-5.6", status: "completed", output, usage };
}

describe("OpenAI computer loop", () => {
  it("executes ordered calls and returns a bounded usage receipt", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        response("resp_1", [
          {
            type: "computer_call",
            call_id: "call_1",
            pending_safety_checks: [],
            actions: [
              { type: "click", x: 120, y: 80, button: "left" },
              { type: "type", text: "Approved body." },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(response("resp_2", []));
    const execute = vi.fn().mockResolvedValue(undefined);
    const result = await runOpenAIComputerLoop({
      apiKey: "synthetic-test-key",
      model: "gpt-5.6",
      destinationUrl: "https://social.example/feed/acme",
      approvedBody: "Approved body.",
      environment: { execute, screenshot: vi.fn().mockResolvedValue(screen) },
      clientFactory: () => ({ responses: { create } }) as never,
    });
    expect(execute).toHaveBeenCalledWith([
      { type: "click", x: 120, y: 80, button: "left" },
      { type: "type", text: "Approved body." },
    ]);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        include: ["reasoning.encrypted_content"],
        input: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: "input_image", detail: "original" }),
            ]),
          }),
        ],
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        store: false,
        parallel_tool_calls: false,
        include: ["reasoning.encrypted_content"],
        input: expect.arrayContaining([
          expect.objectContaining({ type: "computer_call", call_id: "call_1" }),
          expect.objectContaining({ type: "computer_call_output", call_id: "call_1" }),
        ]),
      }),
    );
    expect(JSON.stringify(create.mock.calls[1]?.[0])).not.toContain(
      "acknowledged_safety_checks",
    );
    expect(result).toMatchObject({
      state: "completed",
      responseId: "resp_2",
      turns: 2,
      actionsExecuted: 2,
      usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
    });
  });

  it("blocks before execution when a provider safety check is pending", async () => {
    const create = vi.fn().mockResolvedValue(
      response("resp_safe", [
        {
          type: "computer_call",
          call_id: "call_safe",
          actions: [{ type: "screenshot" }],
          pending_safety_checks: [
            { id: "safe_1", code: "confirm", message: "Confirm action." },
          ],
        },
      ]),
    );
    const execute = vi.fn();
    const result = await runOpenAIComputerLoop({
      apiKey: "synthetic-test-key",
      model: "gpt-5.6",
      destinationUrl: "https://social.example/feed/acme",
      approvedBody: "Approved body.",
      environment: { execute, screenshot: vi.fn().mockResolvedValue(screen) },
      clientFactory: () => ({ responses: { create } }) as never,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: "blocked",
      errorCode: "COMPUTER_SAFETY_CONFIRMATION_REQUIRED",
      pendingSafetyChecks: [{ id: "safe_1" }],
    });
  });

  it("blocks malformed or oversized action batches", async () => {
    const create = vi.fn().mockResolvedValue(
      response("resp_bad", [
        {
          type: "computer_call",
          call_id: "call_bad",
          actions: Array.from({ length: 26 }, () => ({ type: "screenshot" })),
          pending_safety_checks: [],
        },
      ]),
    );
    const result = await runOpenAIComputerLoop({
      apiKey: "synthetic-test-key",
      model: "gpt-5.6",
      destinationUrl: "https://social.example/feed/acme",
      approvedBody: "Approved body.",
      environment: {
        execute: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(screen),
      },
      clientFactory: () => ({ responses: { create } }) as never,
    });
    expect(result).toMatchObject({
      state: "blocked",
      errorCode: "COMPUTER_RESPONSE_INVALID",
      actionsExecuted: 0,
    });
  });
});
