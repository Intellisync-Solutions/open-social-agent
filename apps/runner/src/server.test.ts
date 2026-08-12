import type { SecretStore } from "@open-social-agent/secrets";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerConfig } from "./config";
import { buildRunner } from "./server";

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  async set(secretRef: string, value: string) {
    this.values.set(secretRef, value);
  }
  async get(secretRef: string) {
    return this.values.get(secretRef) ?? null;
  }
  async delete(secretRef: string) {
    this.values.delete(secretRef);
  }
}

const config: RunnerConfig = {
  host: "127.0.0.1",
  port: 43117,
  webOrigin: "http://localhost:3000",
  dataDirectory: "/tmp/open-social-agent-test",
  forceEncryptedStore: false,
  generationEnabled: false,
  computerEnabled: false,
  pollingEnabled: false,
  pollingIntervalMs: 60_000,
};

const openApps: Array<ReturnType<typeof buildRunner>["app"]> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("local runner security boundary", () => {
  it("rejects a disallowed browser origin", async () => {
    const { app } = buildRunner({
      config,
      secretStore: new MemorySecretStore(),
      pairingCode: "123456",
    });
    openApps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: { origin: "https://attacker.example" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
  });

  it("pairs once and stores a secret without returning it", async () => {
    const secretStore = new MemorySecretStore();
    const { app } = buildRunner({
      config: { ...config, generationEnabled: true },
      secretStore,
      pairingCode: "123456",
      now: () => 1_000,
    });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    expect(pair.statusCode).toBe(200);
    const cookie = pair.headers["set-cookie"];
    expect(cookie).toEqual(expect.stringContaining("HttpOnly"));
    expect(cookie).toEqual(expect.stringContaining("SameSite=Strict"));

    const apiKey = "synthetic-openai-key-for-runner-test";
    const stored = await app.inject({
      method: "POST",
      url: "/v1/provider-secrets",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "settings",
        cookie: Array.isArray(cookie) ? cookie[0] : cookie,
      },
      payload: { provider: "openai", apiKey },
    });
    expect(stored.statusCode).toBe(201);
    expect(stored.body).not.toContain(apiKey);
    expect(stored.json()).toMatchObject({
      provider: "openai",
      configured: true,
    });
    expect(secretStore.values.get("provider:openai:default")).toBe(apiKey);

    const replay = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    expect(replay.statusCode).toBe(401);
  });

  it("requires both a runner session and CSRF header for writes", async () => {
    const secretStore = new MemorySecretStore();
    const { app } = buildRunner({ config, secretStore, pairingCode: "123456" });
    openApps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/provider-secrets",
      headers: { origin: config.webOrigin },
      payload: {
        provider: "openai",
        apiKey: "synthetic-openai-key-for-runner-test",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(secretStore.values.size).toBe(0);
  });

  it("runs a non-mutating capability probe without returning the key", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set(
      "provider:openai:default",
      "synthetic-openai-key-for-runner-test",
    );
    let observedKey = "";
    const { app } = buildRunner({
      config,
      secretStore,
      pairingCode: "123456",
      providerProbe: async ({ apiKey, baseURL }) => {
        observedKey = apiKey;
        expect(baseURL).toBe("https://api.openai.com/v1");
        return 7;
      },
    });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/provider-capabilities/probe",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "settings",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { provider: "openai" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(observedKey);
    expect(response.json()).toMatchObject({
      authenticated: true,
      modelsVisible: 7,
      capabilityClaims: { computer: "unverified", webSearch: "unverified" },
    });
  });

  it("rejects private alternate-provider base URLs before network access", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set(
      "provider:responses-compatible:default",
      "synthetic-compatible-key-for-runner-test",
    );
    const { app } = buildRunner({
      config,
      secretStore,
      pairingCode: "123456",
      providerProbe: async () => {
        throw new Error("must not run");
      },
    });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/provider-capabilities/probe",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "settings",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: {
        provider: "responses-compatible",
        baseUrl: "https://127.0.0.1/v1",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "PROVIDER_BASE_URL_REJECTED" },
    });
  });

  it("keeps generation disabled unless the operator opts in", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set(
      "provider:openai:default",
      "synthetic-openai-key-for-runner-test",
    );
    const { app } = buildRunner({ config, secretStore, pairingCode: "123456" });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/process-harness",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { requestId: "harness-execution-0001" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "GENERATION_DISABLED" },
    });
  });

  it("runs the research, composition, and deterministic evaluation corridor", async () => {
    const secretStore = new MemorySecretStore();
    const apiKey = "synthetic-openai-key-for-runner-test";
    secretStore.values.set("provider:openai:default", apiKey);
    secretStore.values.set("runner:device:id", "runner_device_identifier_01");
    secretStore.values.set("runner:device:token", "a".repeat(43));
    secretStore.values.set("runner:device:site", "https://example.convex.site");
    const evidenceId = "ev_0123456789abcdef";
    let observedKey = "";
    const { app } = buildRunner({
      config: { ...config, generationEnabled: true },
      secretStore,
      pairingCode: "123456",
      now: () => 1_000,
      claimHarnessRun: async () => ({
        userId: "user_identifier_0001",
        registrationId: "registration_1",
        runId: "run_1",
        executionRequestId: "harness-execution-0001",
        leaseExpiresAt: 90_000,
        snapshot: {
          ...testSnapshot(),
          profile: {
            ...testSnapshot().profile,
            research: {
              ...testSnapshot().profile.research,
              webSearchEnabled: true,
              allowedDomains: ["openai.com"],
            },
          },
        } as ReturnType<typeof testSnapshot>,
        recentBodies: [],
      }),
      submitHarnessReceipt: async () => undefined,
      researchAdapter: {
        research: async ({ apiKey: receivedKey }) => {
          observedKey = receivedKey;
          return {
            responseId: "resp_research",
            requestedModel: "gpt-5.6-terra",
            actualModel: "gpt-5.6-terra",
            brief: "AI operations benefit from evidence.",
            evidence: [
              {
                id: evidenceId,
                url: "https://openai.com/news",
                title: "OpenAI news",
                domain: "openai.com",
                retrievedAt: 1_000,
                publishedAt: null,
                contentHash: "a".repeat(64),
              },
            ],
            queries: ["AI operations"],
            toolCalls: 1,
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            latencyMs: 20,
            requestId: "req_research",
          };
        },
      },
      providerAdapter: {
        compose: async () => ({
          responseId: "resp_compose",
          requestedModel: "gpt-5.6-terra",
          actualModel: "gpt-5.6-terra",
          output: {
            body: "AI operations benefit from evidence.",
            assumptions: [],
            riskFlags: [],
            sourceMap: [
              {
                claim: "AI operations benefit from evidence.",
                evidenceIds: [evidenceId],
              },
            ],
          },
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          latencyMs: 25,
          requestId: "req_compose",
        }),
      },
    });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/process-harness",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { requestId: "harness-execution-0001" },
    });
    expect(response.statusCode).toBe(200);
    expect(observedKey).toBe(apiKey);
    expect(response.body).not.toContain(apiKey);
    expect(response.json()).toMatchObject({
      research: { toolCalls: 1, evidence: [{ id: evidenceId }] },
      evaluation: {
        state: "passed",
        codes: [],
        warnings: ["FRESHNESS_UNVERIFIED"],
      },
    });
  });

  it("processes one queued harness without a paired browser session", async () => {
    const secretStore = new MemorySecretStore();
    const apiKey = "synthetic-openai-key-for-scheduler-test";
    secretStore.values.set("provider:openai:default", apiKey);
    secretStore.values.set("runner:device:id", "runner_device_identifier_01");
    secretStore.values.set("runner:device:token", "a".repeat(43));
    secretStore.values.set("runner:device:site", "https://example.convex.site");
    const receipts: unknown[] = [];
    const { app, processNextHarness } = buildRunner({
      config: { ...config, generationEnabled: true, pollingEnabled: true },
      secretStore,
      pairingCode: "123456",
      now: () => 1_000,
      claimHarnessRun: async () => ({
        userId: "user_identifier_0001",
        registrationId: "registration_1",
        runId: "run_1",
        executionRequestId: "poll-request-scheduler-01",
        leaseExpiresAt: 90_000,
        snapshot: {
          ...testSnapshot(),
          profile: {
            ...testSnapshot().profile,
            research: {
              ...testSnapshot().profile.research,
              citationsRequired: false,
            },
          },
        },
        recentBodies: [],
      }),
      submitHarnessReceipt: async ({ receipt }) => {
        receipts.push(receipt);
      },
      providerAdapter: {
        compose: async ({ apiKey: observed }) => {
          expect(observed).toBe(apiKey);
          return {
            responseId: "resp_poll",
            requestedModel: "gpt-5.6-terra",
            actualModel: "gpt-5.6-terra",
            output: {
              body: "AI scheduled evidence.",
              assumptions: [],
              riskFlags: [],
              sourceMap: [],
            },
            usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
            latencyMs: 9,
            requestId: "req_poll",
          };
        },
      },
    });
    openApps.push(app);
    await expect(
      processNextHarness("poll-request-scheduler-01"),
    ).resolves.toMatchObject({ state: "completed" });
    expect(receipts).toEqual([
      expect.objectContaining({ state: "completed", runId: "run_1" }),
    ]);
  });

  it("stores a runner device token locally without returning it", async () => {
    const secretStore = new MemorySecretStore();
    const { app } = buildRunner({ config, secretStore, pairingCode: "123456" });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const token = "a".repeat(43);
    const runnerId = "runner_device_identifier_01";
    const response = await app.inject({
      method: "POST",
      url: "/v1/runner-device",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "settings",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: {
        runnerId,
        token,
        siteUrl: "https://example.convex.site",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain(token);
    expect(secretStore.values).toMatchObject(
      new Map([
        ["runner:device:token", token],
        ["runner:device:id", runnerId],
        ["runner:device:site", "https://example.convex.site"],
      ]),
    );
  });

  it("keeps consequential processing disabled by default", async () => {
    const secretStore = new MemorySecretStore();
    const { app } = buildRunner({ config, secretStore, pairingCode: "123456" });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/process-approved",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: {
        requestId: "execution-request-0001",
        browserKind: "brave",
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "COMPUTER_DISABLED" },
    });
  });

  it("records a bounded failure after an approved claim cannot execute", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set(
      "provider:openai:default",
      "synthetic-openai-key-for-runner-test",
    );
    secretStore.values.set("runner:device:id", "runner_device_identifier_01");
    secretStore.values.set("runner:device:token", "a".repeat(43));
    secretStore.values.set("runner:device:site", "https://example.convex.site");
    const receipts: unknown[] = [];
    const claim = {
      userId: "user_identifier_0001",
      registrationId: "registration_1",
      runId: "run_1",
      approvalId: "approval_1",
      outputId: "output_1",
      revision: 1,
      body: "Approved body.",
      bodyHash: "b".repeat(64),
      destinationUrl: "https://social.example/feed/acme",
      approvalExpiresAt: 90_000,
      leaseExpiresAt: 90_000,
      executionRequestId: "execution-request-0001",
      modelId: "gpt-5.6",
    };
    const { app } = buildRunner({
      config: { ...config, computerEnabled: true },
      secretStore,
      pairingCode: "123456",
      now: () => 1_000,
      claimApprovedRun: async () => claim,
      submitPublicationReceipt: async ({ receipt }) => {
        receipts.push(receipt);
        return { receiptId: "receipt_1" };
      },
      detectInstalledBrowsers: async () => [
        {
          kind: "brave",
          label: "Brave Browser",
          executablePath: "/synthetic/brave",
        },
      ],
      withApprovedComputerEnvironment: async (_options, task) =>
        await task({
          execute: async () => undefined,
          screenshot: async () => ({
            imageDataUrl: "data:image/png;base64,AA==",
            currentUrl: claim.destinationUrl,
          }),
          renderedText: async () => "",
        }),
      processComputerLoop: async () => {
        throw new Error("synthetic provider failure");
      },
    });
    openApps.push(app);
    const pair = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin: config.webOrigin, "x-osa-request": "settings" },
      payload: { code: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/process-approved",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { requestId: claim.executionRequestId, browserKind: "brave" },
    });
    expect(response.statusCode).toBe(502);
    expect(receipts).toEqual([
      expect.objectContaining({
        state: "failed",
        errorCode: "RUNNER_EXECUTION_FAILED",
        actualModel: "unavailable",
        totalTokens: 0,
        turns: 0,
        actionsExecuted: 0,
      }),
    ]);
  });
});

function testSnapshot(): import("@open-social-agent/contracts").ConfigurationSnapshot {
  return {
    schemaVersion: 1,
    profileRevision: 1,
    scheduleRevision: 1,
    profile: {
      name: "Signal",
      destination: {
        feedUrl: "https://social.example/feed",
        allowedOrigin: "https://social.example",
      },
      content: {
        topics: ["AI"],
        persona: "Operator",
        tone: "Clear",
        style: "Concise",
        structure: "Claim and evidence",
        customInstructions: "",
        exclusions: [],
      },
      research: {
        webSearchEnabled: false,
        allowedDomains: [],
        citationsRequired: true,
        freshnessDays: 7,
        maxSources: 8,
      },
      model: {
        provider: "openai",
        preset: "balanced",
        modelId: "gpt-5.6-terra",
        reasoningEffort: "medium",
        maxOutputTokens: 1200,
        perRunTokenGate: 12000,
        dailyTokenGate: 50000,
      },
    },
    schedule: {
      name: "Daily",
      cadence: "daily",
      timezone: "America/Toronto",
      localTime: "09:30",
    },
  };
}
