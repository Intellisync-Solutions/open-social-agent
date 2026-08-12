import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { detectInstalledBrowsers } from "@open-social-agent/browser";
import {
  ProviderCapabilityProbeSchema,
  ProviderExecutionResultSchema,
  RunnerPairRequestSchema,
  RunnerProviderKindSchema,
  RunnerComposeInputSchema,
  RunnerSecretInputSchema,
  type RunnerProviderKind,
} from "@open-social-agent/contracts";
import type { SecretStore } from "@open-social-agent/secrets";
import { validateCompositionInput } from "@open-social-agent/harness";
import { createOpenAIProvider, type ProviderAdapter } from "@open-social-agent/providers";
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
}) {
  const app = Fastify({
    bodyLimit: 131_072,
    logger: false,
    requestIdHeader: false,
  });
  const now = options.now ?? Date.now;
  const providerProbe = options.providerProbe ?? runProviderProbe;
  const providerAdapter = options.providerAdapter ?? createOpenAIProvider();
  const pairingCode =
    options.pairingCode ?? String(randomInt(100_000, 1_000_000));
  const pairingDigest = digest(pairingCode);
  const pairingExpiresAt = now() + pairingDurationMs;
  let pairingConsumed = false;
  const sessions = new Map<string, number>();

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
        request.url === "/v1/compose" ? "execution" : "settings";
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
    "/v1/compose",
    {
      config: { rateLimit: { max: 2, timeWindow: 60_000 } },
      preHandler: authorize,
    },
    async (request, reply) => {
      if (request.headers["x-osa-request"] !== "execution") {
        return reply
          .code(403)
          .send(errorEnvelope(request.id, "EXECUTION_HEADER_REQUIRED"));
      }
      if (!options.config.generationEnabled) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "GENERATION_DISABLED"));
      }
      const input = RunnerComposeInputSchema.safeParse(request.body);
      if (!input.success) {
        return reply
          .code(400)
          .send(errorEnvelope(request.id, "COMPOSITION_INPUT_INVALID"));
      }
      if (input.data.snapshot.profile.model.provider !== "openai") {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "PROVIDER_CAPABILITY_UNAVAILABLE"));
      }
      try {
        validateCompositionInput(
          input.data.snapshot,
          input.data.evidencePacket,
        );
      } catch (error) {
        return reply
          .code(409)
          .send(
            errorEnvelope(
              request.id,
              error instanceof Error ? error.message : "COMPOSITION_BLOCKED",
            ),
          );
      }
      const apiKey = await options.secretStore.get(secretRef("openai"));
      if (!apiKey) {
        return reply
          .code(409)
          .send(errorEnvelope(request.id, "PROVIDER_SECRET_MISSING"));
      }
      try {
        const result = await providerAdapter.compose({
          apiKey,
          snapshot: input.data.snapshot,
          evidencePacket: input.data.evidencePacket,
        });
        return ProviderExecutionResultSchema.parse(result);
      } catch {
        return reply
          .code(502)
          .send(errorEnvelope(request.id, "PROVIDER_EXECUTION_FAILED"));
      }
    },
  );

  app.get("/v1/session", { preHandler: authorize }, async () => ({
    status: "paired",
    browsers: (await detectInstalledBrowsers()).map(({ kind, label }) => ({
      kind,
      label,
    })),
  }));

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

  return { app, pairingCode };
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
