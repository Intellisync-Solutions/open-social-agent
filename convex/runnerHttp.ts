import {
  RunnerClaimRequestSchema,
  RunnerDeviceTokenSchema,
  RunnerReceiptRequestSchema,
} from "@open-social-agent/contracts";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const responseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export const claim = httpAction(async (ctx, request) => {
  const body = await boundedJson(request);
  const parsed = RunnerClaimRequestSchema.safeParse(body);
  if (!parsed.success) return error(400, "RUNNER_CLAIM_INVALID");
  const authority = await authorize(ctx, request, parsed.data.runnerId);
  if (!authority) return error(401, "RUNNER_AUTH_INVALID");
  try {
    const claim = await ctx.runMutation(internal.runners.claimApprovedInternal, {
      ...authority,
      runnerId: parsed.data.runnerId,
      requestId: parsed.data.requestId,
      now: Date.now(),
    });
    if (!claim) return new Response(null, { status: 204, headers: responseHeaders });
    return new Response(JSON.stringify(claim), { status: 200, headers: responseHeaders });
  } catch {
    return error(409, "RUNNER_CLAIM_REJECTED");
  }
});

export const receipt = httpAction(async (ctx, request) => {
  const body = await boundedJson(request);
  const parsed = RunnerReceiptRequestSchema.safeParse(body);
  if (!parsed.success) return error(400, "RUNNER_RECEIPT_INVALID");
  const authority = await authorize(ctx, request, parsed.data.runnerId);
  if (!authority) return error(401, "RUNNER_AUTH_INVALID");
  try {
    const receiptId = await ctx.runMutation(internal.receipts.recordVerified, {
      userId: authority.userId,
      runnerRegistrationId: authority.registrationId,
      runId: parsed.data.runId as never,
      approvalId: parsed.data.approvalId as never,
      executionRequestId: parsed.data.executionRequestId,
      state: parsed.data.state,
      destinationUrl: parsed.data.destinationUrl,
      bodyHash: parsed.data.bodyHash,
      directUrl: parsed.data.directUrl ?? undefined,
      errorCode: parsed.data.errorCode ?? undefined,
      requestedModel: parsed.data.requestedModel,
      actualModel: parsed.data.actualModel,
      inputTokens: parsed.data.inputTokens,
      outputTokens: parsed.data.outputTokens,
      totalTokens: parsed.data.totalTokens,
      turns: parsed.data.turns,
      actionsExecuted: parsed.data.actionsExecuted,
    });
    return new Response(JSON.stringify({ receiptId }), { status: 201, headers: responseHeaders });
  } catch {
    return error(409, "RUNNER_RECEIPT_REJECTED");
  }
});

async function authorize(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  runnerId: string,
) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!RunnerDeviceTokenSchema.safeParse(token).success) return null;
  return await ctx.runQuery(internal.runners.authorizeInternal, {
    runnerId,
    tokenHash: await sha256(token),
  });
}

async function boundedJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 32_768) return null;
  const text = await request.text();
  if (text.length > 32_768) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function error(status: number, code: string) {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: responseHeaders,
  });
}
