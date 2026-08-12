import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  detectInstalledBrowsers,
  directVerificationState,
  isolatedProfilePath,
  openIsolatedProfileForAuthorization,
  withApprovedComputerEnvironment,
  type BrowserAuthorizationSession,
} from "@open-social-agent/browser";
import {
  BrowserProfileAuthorizationRequestSchema,
  ProviderCapabilityProbeSchema,
  HarnessExecutionResultSchema,
  RunnerPairRequestSchema,
  RunnerProviderKindSchema,
  RunnerDeviceRegistrationSchema,
  RunnerProcessRequestSchema,
  RunnerHarnessProcessRequestSchema,
  RunnerSecretInputSchema,
  type RunnerProviderKind,
  type RunnerClaimResponse,
} from "@open-social-agent/contracts";
import type { SecretStore } from "@open-social-agent/secrets";
import {
  buildEvidencePacket,
  evaluateHarnessExecution,
  planZeroPostRun,
} from "@open-social-agent/harness";
import {
  createOpenAIProvider,
  createOpenAIResearchProvider,
  runOpenAIComputerLoop,
  type ProviderAdapter,
  type ResearchAdapter,
} from "@open-social-agent/providers";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { RunnerConfig } from "./config";
import {
  ProviderProbeError,
  runProviderProbe,
  validateProviderBaseUrl,
} from "./provider-probe";
import {
  claimApprovedRun,
  claimHarnessRun,
  submitHarnessReceipt,
  submitPublicationReceipt,
} from "./convex-bridge";

const sessionCookie = "osa_runner_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const pairingDurationMs = 10 * 60 * 1000;

export function buildRunner(options: {
  config: RunnerConfig;
  secretStore: SecretStore;
  pairingCode?: string;
  now?: () => number;
  providerProbe?: typeof runProviderProbe;
  providerAdapter?: ProviderAdapter;
  researchAdapter?: ResearchAdapter;
  processComputerLoop?: typeof runOpenAIComputerLoop;
  claimApprovedRun?: typeof claimApprovedRun;
  submitPublicationReceipt?: typeof submitPublicationReceipt;
  detectInstalledBrowsers?: typeof detectInstalledBrowsers;
  openIsolatedProfileForAuthorization?:
    typeof openIsolatedProfileForAuthorization;
  withApprovedComputerEnvironment?: typeof withApprovedComputerEnvironment;
  claimHarnessRun?: typeof claimHarnessRun;
  submitHarnessReceipt?: typeof submitHarnessReceipt;
}) {
  const app = Fastify({
    bodyLimit: 131_072,
    logger: false,
    requestIdHeader: false,
  });
  const now = options.now ?? Date.now;
  const providerProbe = options.providerProbe ?? runProviderProbe;
  const providerAdapter = options.providerAdapter ?? createOpenAIProvider();
  const researchAdapter =
    options.researchAdapter ?? createOpenAIResearchProvider();
  const processComputerLoop =
    options.processComputerLoop ?? runOpenAIComputerLoop;
  const claimRun = options.claimApprovedRun ?? claimApprovedRun;
  const submitReceipt =
    options.submitPublicationReceipt ?? submitPublicationReceipt;
  const detectBrowsers =
    options.detectInstalledBrowsers ?? detectInstalledBrowsers;
  const openAuthorizationProfile =
    options.openIsolatedProfileForAuthorization ??
    openIsolatedProfileForAuthorization;
  const withComputerEnvironment =
    options.withApprovedComputerEnvironment ?? withApprovedComputerEnvironment;
  const claimHarness = options.claimHarnessRun ?? claimHarnessRun;
  const submitHarness = options.submitHarnessReceipt ?? submitHarnessReceipt;
  const pairingCode =
    options.pairingCode ?? String(randomInt(100_000, 1_000_000));
  const pairingDigest = digest(pairingCode);
  const pairingExpiresAt = now() + pairingDurationMs;
  let pairingConsumed = false;
  const sessions = new Map<string, number>();
  const browserSessions = new Map<string, BrowserAuthorizationSession>();

  app.register(cookie, {
    secret: randomBytes(32).toString("hex"),
    hook: "onRequest",
  });
  app.register(cors, {
    origin: options.config.webOrigin,
    credentials: true,
    allowedHeaders: ["content-type", "x-osa-request"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });
  app.register(rateLimit, { global: false });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    if (request.headers.origin !== options.config.webOrigin) {
      return reply
        .code(403)
        .send(errorEnvelope(request.id, "ORIGIN_NOT_ALLOWED"));
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const expectedPurpose =
        request.url === "/v1/process-harness" ||
        request.url === "/v1/process-approved"
          ? "execution"
          : "settings";
      if (request.headers["x-osa-request"] !== expectedPurpose) {
        return reply
          .code(403)
          .send(errorEnvelope(request.id, "REQUEST_HEADER_REQUIRED"));
      }
    }
  });

  app.get("/health", async () => ({ status: "ready", version: 1 }));

  app.get("/v1/status", async () => ({
    status: "ready",
    version: 1,
    pairingRequired: true,
  }));

  app.post(
    "/v1/pair",
    { config: { rateLimit: { max: 5, timeWindow: 60_000 } } },
    async (request, reply) => {
      const parsed = RunnerPairRequestSchema.safeParse(request.body);
      if (
        pairingConsumed ||
        !parsed.success ||
        now() > pairingExpiresAt ||
        !safeEqual(digest(parsed.data.code), pairingDigest)
      ) {
        return reply
          .code(401)
          .send(errorEnvelope(request.id, "PAIRING_REJECTED"));
      }
      pairingConsumed = true;
      const session = randomBytes(32).toString("base64url");
      sessions.set(session, now() + sessionDurationMs);
      reply.setCookie(sessionCookie, session, {
        path: "/v1",
        httpOnly: true,
        sameSite: "strict",
        secure: options.config.webOrigin.startsWith("https:"),
        signed: true,
        maxAge: Math.floor(sessionDurationMs / 1000),
      });
      return { status: "paired", expiresAt: now() + sessionDurationMs };
    },
  );

  app.post(
    "/v1/runner-device",
    {
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const parsed = RunnerDeviceRegistrationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "RUNNER_DEVICE_INVALID"));
      }
      let siteUrl: string;
      try {
        const url = new URL(parsed.data.siteUrl);
        if (url.protocol !== "https:" || url.username || url.password) {
          throw new Error("invalid");
        }
        siteUrl = url.origin;
      } catch {
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "CONVEX_SITE_URL_INVALID"));
      }
      await options.secretStore.set("runner:device:token", parsed.data.token);
      await options.secretStore.set("runner:device:id", parsed.data.runnerId);
      await options.secretStore.set("runner:device:site", siteUrl);
      await options.secretStore.set(
        "runner:device:profile-scope",
        parsed.data.profileScope,
      );
      return reply.code(201).send({
        status: "registered",
        runnerId: parsed.data.runnerId,
        tokenStored: true,
      });
    },
  );

  app.post(
    "/v1/browser-profile/authorize",
    {
      config: { rateLimit: { max: 3, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const parsed = BrowserProfileAuthorizationRequestSchema.safeParse(
        request.body,
      );
      if (!parsed.success)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "BROWSER_PROFILE_INPUT_INVALID"));
      const profileScope = await options.secretStore.get(
        "runner:device:profile-scope",
      );
      if (!profileScope)
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "RUNNER_DEVICE_MISSING"));
      const browser = (await detectBrowsers()).find(
        (candidate) => candidate.kind === parsed.data.browserKind,
      );
      if (!browser)
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "BROWSER_NOT_AVAILABLE"));
      const existing = browserSessions.get(parsed.data.browserKind);
      if (existing)
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "BROWSER_PROFILE_ALREADY_OPEN"));
      try {
        const authorization = await openAuthorizationProfile({
          executablePath: browser.executablePath,
          profilePath: isolatedProfilePath(
            options.config.dataDirectory,
            profileScope,
            parsed.data.browserKind,
          ),
          destinationUrl: parsed.data.destinationUrl,
        });
        browserSessions.set(parsed.data.browserKind, authorization);
        authorization.onClose(() => {
          browserSessions.delete(parsed.data.browserKind);
        });
        const marker = {
          browserKind: parsed.data.browserKind,
          destinationOrigin: new URL(parsed.data.destinationUrl).origin,
          openedAt: now(),
        };
        await options.secretStore.set(
          "browser:profile-opened:v1",
          JSON.stringify(marker),
        );
        return reply.code(202).send({
          status: "opened",
          ...marker,
          loginVerified: false,
        });
      } catch {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "BROWSER_PROFILE_OPEN_FAILED"));
      }
    },
  );

  app.post(
    "/v1/process-approved",
    {
      config: { rateLimit: { max: 1, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      if (!options.config.computerEnabled) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "COMPUTER_DISABLED"));
      }
      const parsed = RunnerProcessRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "PROCESS_REQUEST_INVALID"));
      }
      const [runnerId, token, siteUrl, apiKey] = await Promise.all([
        options.secretStore.get("runner:device:id"),
        options.secretStore.get("runner:device:token"),
        options.secretStore.get("runner:device:site"),
        options.secretStore.get(secretRef("openai")),
      ]);
      if (!runnerId || !token || !siteUrl) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "RUNNER_DEVICE_MISSING"));
      }
      if (!apiKey) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "PROVIDER_SECRET_MISSING"));
      }
      const browser = (await detectBrowsers()).find(
        (candidate) => candidate.kind === parsed.data.browserKind,
      );
      if (!browser) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "BROWSER_NOT_AVAILABLE"));
      }
      let activeClaim: RunnerClaimResponse | null = null;
      let receiptAttempted = false;
      try {
        activeClaim = await claimRun({
          siteUrl,
          runnerId,
          token,
          requestId: parsed.data.requestId,
        });
        const claim = activeClaim;
        if (!claim) return reply.code(204).send();
        if (claim.approvalExpiresAt <= now() || claim.leaseExpiresAt <= now()) {
          throw new Error("APPROVAL_EXPIRED");
        }
        const profilePath = isolatedProfilePath(
          options.config.dataDirectory,
          claim.userId,
          parsed.data.browserKind,
        );
        const execution = await withComputerEnvironment(
          {
            executablePath: browser.executablePath,
            profilePath,
            destinationUrl: claim.destinationUrl,
            approvedBody: claim.body,
          },
          async (environment) => {
            const result = await processComputerLoop({
              apiKey,
              model: claim.modelId,
              destinationUrl: claim.destinationUrl,
              approvedBody: claim.body,
              environment,
            });
            return { result, renderedBody: await environment.renderedText() };
          },
        );
        const result = execution.result;
        const verification =
          result.state === "completed"
            ? directVerificationState({
                currentUrl: result.finalUrl,
                destinationUrl: claim.destinationUrl,
                renderedBody: execution.renderedBody,
                approvedBody: claim.body,
              })
            : "blocked";
        const directUrl = verification === "live" ? result.finalUrl : null;
        const state = result.state === "completed" ? verification : "blocked";
        receiptAttempted = true;
        await submitReceipt({
          siteUrl,
          token,
          receipt: {
            runnerId,
            runId: claim.runId,
            approvalId: claim.approvalId,
            executionRequestId: claim.executionRequestId,
            state,
            destinationUrl: claim.destinationUrl,
            bodyHash: claim.bodyHash,
            directUrl,
            errorCode: result.state === "blocked" ? result.errorCode : null,
            requestedModel: result.requestedModel,
            actualModel: result.actualModel,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            turns: result.turns,
            actionsExecuted: result.actionsExecuted,
          },
        });
        return {
          state,
          runId: claim.runId,
          directUrl,
          actionsExecuted: result.actionsExecuted,
          turns: result.turns,
        };
      } catch {
        if (
          activeClaim &&
          !receiptAttempted &&
          activeClaim.leaseExpiresAt > now()
        ) {
          try {
            await submitReceipt({
              siteUrl,
              token,
              receipt: {
                runnerId,
                runId: activeClaim.runId,
                approvalId: activeClaim.approvalId,
                executionRequestId: activeClaim.executionRequestId,
                state: "failed",
                destinationUrl: activeClaim.destinationUrl,
                bodyHash: activeClaim.bodyHash,
                directUrl: null,
                errorCode: "RUNNER_EXECUTION_FAILED",
                requestedModel: activeClaim.modelId,
                actualModel: "unavailable",
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                turns: 0,
                actionsExecuted: 0,
              },
            });
          } catch {
            // The claim lease remains the recoverable evidence when the receipt bridge is unavailable.
          }
        }
        return reply
          .code(502)
          .send(errorEnvelope(request.id, "RUNNER_EXECUTION_FAILED"));
      }
    },
  );

  app.post(
    "/v1/process-harness",
    {
      config: { rateLimit: { max: 1, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const input = RunnerHarnessProcessRequestSchema.safeParse(request.body);
      if (!input.success) {
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "HARNESS_INPUT_INVALID"));
      }
      const processed = await processNextHarness(input.data.requestId);
      if (processed.state === "disabled")
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "GENERATION_DISABLED"));
      if (processed.state === "not_ready")
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "RUNNER_NOT_READY"));
      if (processed.state === "empty") return reply.code(204).send();
      if (processed.state === "failed")
        return reply
          .code(502)
          .send(errorEnvelope(request.id, "HARNESS_EXECUTION_FAILED"));
      return processed.result;
    },
  );

  app.get("/v1/session", { preHandler: authorize }, async () => {
    const marker = await options.secretStore.get("browser:profile-opened:v1");
    return {
      status: "paired",
      execution: {
        generationEnabled: options.config.generationEnabled,
        computerEnabled: options.config.computerEnabled,
        pollingEnabled: options.config.pollingEnabled,
        pollingIntervalMs: options.config.pollingIntervalMs,
      },
      browsers: (await detectBrowsers()).map(({ kind, label }) => ({
        kind,
        label,
      })),
      browserProfile: parseBrowserProfileMarker(marker),
    };
  });

  app.get<{ Params: { provider: string } }>(
    "/v1/provider-secrets/:provider",
    { preHandler: authorize },
    async (request, reply) => {
      const provider = RunnerProviderKindSchema.safeParse(
        request.params.provider,
      );
      if (!provider.success)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "PROVIDER_INVALID"));
      const secret = await options.secretStore.get(secretRef(provider.data));
      return secretStatus(provider.data, secret);
    },
  );

  app.post(
    "/v1/provider-secrets",
    {
      config: { rateLimit: { max: 10, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const input = RunnerSecretInputSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "SECRET_INPUT_INVALID"));
      await options.secretStore.set(
        secretRef(input.data.provider),
        input.data.apiKey,
      );
      return reply
        .code(201)
        .send(secretStatus(input.data.provider, input.data.apiKey));
    },
  );

  app.delete<{ Params: { provider: string } }>(
    "/v1/provider-secrets/:provider",
    {
      config: { rateLimit: { max: 10, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const provider = RunnerProviderKindSchema.safeParse(
        request.params.provider,
      );
      if (!provider.success)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "PROVIDER_INVALID"));
      await options.secretStore.delete(secretRef(provider.data));
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/provider-capabilities/probe",
    {
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      const input = ProviderCapabilityProbeSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "PROVIDER_PROBE_INVALID"));
      const baseURL =
        input.data.provider === "openai"
          ? "https://api.openai.com/v1"
          : validateProviderBaseUrl(input.data.baseUrl);
      if (!baseURL)
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "PROVIDER_BASE_URL_REJECTED"));
      const apiKey = await options.secretStore.get(
        secretRef(input.data.provider),
      );
      if (!apiKey)
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "PROVIDER_SECRET_MISSING"));

      try {
        const modelsVisible = await providerProbe({ apiKey, baseURL });
        return providerProbeResult(
          input.data.provider,
          true,
          true,
          modelsVisible,
          now(),
        );
      } catch (error) {
        const status =
          error instanceof ProviderProbeError ? error.status : undefined;
        const authenticated = status !== 401 && status !== 403;
        return reply.code(authenticated ? 502 : 401).send({
          ...providerProbeResult(
            input.data.provider,
            status !== undefined,
            authenticated,
            0,
            now(),
          ),
          error: {
            code: authenticated
              ? "PROVIDER_UNAVAILABLE"
              : "PROVIDER_AUTH_REJECTED",
            traceId: request.id,
          },
        });
      }
    },
  );

  app.setErrorHandler((_error, request, reply) => {
    request.log.error(
      { code: "RUNNER_INTERNAL_ERROR", traceId: request.id },
      "runner request failed",
    );
    void reply
      .code(500)
      .send(errorEnvelope(request.id, "RUNNER_INTERNAL_ERROR"));
  });

  app.addHook("onClose", async () => {
    await Promise.all(
      [...browserSessions.values()].map((session) => session.close()),
    );
    browserSessions.clear();
  });

  async function authorize(request: FastifyRequest, reply: FastifyReply) {
    const raw = request.cookies[sessionCookie];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    const expiresAt = unsigned?.valid
      ? sessions.get(unsigned.value)
      : undefined;
    if (!expiresAt || expiresAt <= now()) {
      if (unsigned?.value) sessions.delete(unsigned.value);
      return reply
        .code(401)
        .send(errorEnvelope(request.id, "RUNNER_SESSION_REQUIRED"));
    }
  }

  async function processNextHarness(requestId: string) {
    if (!options.config.generationEnabled)
      return { state: "disabled" as const };
    const [runnerId, token, siteUrl, apiKey] = await Promise.all([
      options.secretStore.get("runner:device:id"),
      options.secretStore.get("runner:device:token"),
      options.secretStore.get("runner:device:site"),
      options.secretStore.get(secretRef("openai")),
    ]);
    if (!runnerId || !token || !siteUrl || !apiKey)
      return { state: "not_ready" as const };
    let claim: Awaited<ReturnType<typeof claimHarnessRun>> = null;
    try {
      claim = await claimHarness({ siteUrl, runnerId, token, requestId });
      if (!claim) return { state: "empty" as const };
      if (claim.leaseExpiresAt <= now())
        throw new Error("HARNESS_LEASE_EXPIRED");
      planZeroPostRun(claim.snapshot);
      if (claim.snapshot.profile.model.provider !== "openai")
        throw new Error("PROVIDER_CAPABILITY_UNAVAILABLE");
      const research = claim.snapshot.profile.research.webSearchEnabled
        ? await researchAdapter.research({ apiKey, snapshot: claim.snapshot })
        : null;
      if (
        claim.snapshot.profile.research.citationsRequired &&
        !research?.evidence.length
      )
        throw new Error("GROUNDING_INSUFFICIENT");
      const composition = await providerAdapter.compose({
        apiKey,
        snapshot: claim.snapshot,
        evidencePacket: research
          ? buildEvidencePacket({
              brief: research.brief,
              evidence: research.evidence,
            })
          : "",
      });
      const evaluation = evaluateHarnessExecution({
        snapshot: claim.snapshot,
        research,
        composition,
        recentBodies: claim.recentBodies,
      });
      const result = HarnessExecutionResultSchema.parse({
        research,
        composition,
        evaluation,
      });
      await submitHarness({
        siteUrl,
        token,
        receipt: {
          state: "completed",
          runnerId,
          runId: claim.runId,
          executionRequestId: claim.executionRequestId,
          result,
        },
      });
      return { state: "completed" as const, result };
    } catch {
      if (claim && claim.leaseExpiresAt > now()) {
        try {
          await submitHarness({
            siteUrl,
            token,
            receipt: {
              state: "failed",
              runnerId,
              runId: claim.runId,
              executionRequestId: claim.executionRequestId,
              errorCode: "HARNESS_EXECUTION_FAILED",
            },
          });
        } catch {
          /* The lease remains recoverable evidence. */
        }
      }
      return { state: "failed" as const };
    }
  }

  return { app, pairingCode, processNextHarness };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function secretRef(provider: RunnerProviderKind): string {
  return `provider:${provider}:default`;
}

function secretStatus(provider: RunnerProviderKind, secret: string | null) {
  return {
    provider,
    configured: secret !== null,
    fingerprint: secret
      ? createHash("sha256").update(secret).digest("hex").slice(0, 8)
      : null,
  };
}

function errorEnvelope(traceId: string, code: string) {
  return { error: { code, traceId } };
}

function providerProbeResult(
  provider: RunnerProviderKind,
  reachable: boolean,
  authenticated: boolean,
  modelsVisible: number,
  checkedAt: number,
) {
  return {
    provider,
    reachable,
    authenticated,
    modelsVisible,
    checkedAt,
    capabilityClaims: {
      responses: "unverified" as const,
      structuredOutput: "unverified" as const,
      webSearch: "unverified" as const,
      computer: "unverified" as const,
      usage: "unverified" as const,
    },
  };
}

function parseBrowserProfileMarker(value: string | null) {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const browserKind =
      BrowserProfileAuthorizationRequestSchema.shape.browserKind.safeParse(
        raw.browserKind,
      );
    return browserKind.success &&
      typeof raw.destinationOrigin === "string" &&
      isSafeHttpsOrigin(raw.destinationOrigin) &&
      typeof raw.openedAt === "number" &&
      Number.isFinite(raw.openedAt)
      ? {
          browserKind: browserKind.data,
          destinationOrigin: raw.destinationOrigin,
          openedAt: raw.openedAt,
          loginVerified: false,
        }
      : null;
  } catch {
    return null;
  }
}

function isSafeHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.href === `${url.origin}/`
    );
  } catch {
    return false;
  }
}
