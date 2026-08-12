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

  it("keeps the provider key inside the runner during composition", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set("provider:openai:default", "synthetic-openai-key-for-runner-test");
    let observedKey = "";
    const { app } = buildRunner({
      config: { ...config, generationEnabled: true },
      secretStore,
      pairingCode: "123456",
      providerAdapter: {
        compose: async ({ apiKey, snapshot }) => {
          observedKey = apiKey;
          return {
            responseId: "resp_test",
            requestedModel: snapshot.profile.model.modelId,
            actualModel: snapshot.profile.model.modelId,
            output: { body: "Evidence first.", assumptions: [], riskFlags: [], sourceMap: [] },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            latencyMs: 25,
            requestId: "req_test",
          };
        },
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
      url: "/v1/compose",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { snapshot: testSnapshot(), evidencePacket: "Source: https://openai.com" },
    });
    expect(response.statusCode).toBe(200);
    expect(observedKey).toBe("synthetic-openai-key-for-runner-test");
    expect(response.body).not.toContain(observedKey);
  });

  it("keeps generation disabled unless the operator opts in", async () => {
    const secretStore = new MemorySecretStore();
    secretStore.values.set("provider:openai:default", "synthetic-openai-key-for-runner-test");
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
      url: "/v1/compose",
      headers: {
        origin: config.webOrigin,
        "x-osa-request": "execution",
        cookie: pair.headers["set-cookie"] as string,
      },
      payload: { snapshot: testSnapshot(), evidencePacket: "Source: https://openai.com" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "GENERATION_DISABLED" } });
  });
});

function testSnapshot() {
  return {
    schemaVersion: 1,
    profileRevision: 1,
    scheduleRevision: 1,
    profile: {
      name: "Signal",
      destination: { feedUrl: "https://social.example/feed", allowedOrigin: "https://social.example" },
      content: { topics: ["AI"], persona: "Operator", tone: "Clear", style: "Concise", structure: "Claim and evidence", customInstructions: "", exclusions: [] },
      research: { webSearchEnabled: false, allowedDomains: [], citationsRequired: true, freshnessDays: 7, maxSources: 8 },
      model: { provider: "openai", preset: "balanced", modelId: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 1200, perRunTokenGate: 12000, dailyTokenGate: 50000 },
    },
    schedule: { name: "Daily", cadence: "daily", timezone: "America/Toronto", localTime: "09:30" },
  };
}
