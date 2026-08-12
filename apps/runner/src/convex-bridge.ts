import {
  RunnerClaimRequestSchema,
  RunnerClaimResponseSchema,
  RunnerReceiptRequestSchema,
  type RunnerClaimResponse,
} from "@open-social-agent/contracts";

export class RunnerBridgeError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
  }
}

export async function claimApprovedRun(input: {
  siteUrl: string;
  runnerId: string;
  token: string;
  requestId: string;
  fetchImpl?: typeof fetch;
}): Promise<RunnerClaimResponse | null> {
  const request = RunnerClaimRequestSchema.parse({
    runnerId: input.runnerId,
    requestId: input.requestId,
  });
  const response = await boundedFetch(
    new URL("/runner/claim", validatedSiteUrl(input.siteUrl)),
    request,
    input.token,
    input.fetchImpl,
  );
  if (response.status === 204) return null;
  if (!response.ok) throw await bridgeError(response, "RUNNER_CLAIM_FAILED");
  return RunnerClaimResponseSchema.parse(await boundedResponseJson(response));
}

export async function submitPublicationReceipt(input: {
  siteUrl: string;
  token: string;
  receipt: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ receiptId: string }> {
  const receipt = RunnerReceiptRequestSchema.parse(input.receipt);
  const response = await boundedFetch(
    new URL("/runner/receipts", validatedSiteUrl(input.siteUrl)),
    receipt,
    input.token,
    input.fetchImpl,
  );
  if (!response.ok) throw await bridgeError(response, "RUNNER_RECEIPT_FAILED");
  const body = await boundedResponseJson(response);
  if (
    !body ||
    typeof body !== "object" ||
    !("receiptId" in body) ||
    typeof body.receiptId !== "string"
  ) {
    throw new RunnerBridgeError("RUNNER_BRIDGE_RESPONSE_INVALID");
  }
  return { receiptId: body.receiptId };
}

function validatedSiteUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new RunnerBridgeError("CONVEX_SITE_URL_INVALID");
  }
  return url;
}

async function boundedFetch(
  url: URL,
  body: unknown,
  token: string,
  fetchImpl = fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function boundedResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 64_000) {
    throw new RunnerBridgeError("RUNNER_BRIDGE_RESPONSE_TOO_LARGE");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RunnerBridgeError("RUNNER_BRIDGE_RESPONSE_INVALID");
  }
}

async function bridgeError(response: Response, fallback: string) {
  try {
    const body = await boundedResponseJson(response);
    const code =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof body.error.code === "string"
        ? body.error.code
        : fallback;
    return new RunnerBridgeError(code, response.status);
  } catch {
    return new RunnerBridgeError(fallback, response.status);
  }
}
