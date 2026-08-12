"use client";

import type { RunnerProviderKind } from "@open-social-agent/contracts";
import {
  Check,
  KeyRound,
  Laptop,
  Link2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseLoopbackRunnerUrl } from "@/lib/runner-url";

const runnerUrl = parseLoopbackRunnerUrl(
  process.env.NEXT_PUBLIC_OSA_RUNNER_URL,
);
type RunnerState = "checking" | "offline" | "pairing" | "paired";
type SecretStatus = {
  provider: RunnerProviderKind;
  configured: boolean;
  fingerprint: string | null;
};
type BrowserSummary = { kind: string; label: string };
type CapabilityResult = {
  reachable: boolean;
  authenticated: boolean;
  modelsVisible: number;
  checkedAt: number;
  capabilityClaims: Record<string, "unverified">;
};

export default function ProviderSettingsPage() {
  const [runnerState, setRunnerState] = useState<RunnerState>("checking");
  const [provider, setProvider] = useState<RunnerProviderKind>("openai");
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [browsers, setBrowsers] = useState<BrowserSummary[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityResult | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const secretForm = useRef<HTMLFormElement>(null);

  async function request(path: string, init?: RequestInit) {
    if (!runnerUrl) throw new Error("RUNNER_URL_INVALID");
    const response = await fetch(`${runnerUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "x-osa-request": "settings", ...(init?.headers ?? {}) },
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok)
      throw new Error(body?.error?.code ?? "RUNNER_REQUEST_FAILED");
    return body;
  }

  async function checkRunner() {
    setMessage(null);
    setRunnerState("checking");
    try {
      await request("/v1/status");
      try {
        const session = await request("/v1/session");
        setBrowsers(session.browsers ?? []);
        setRunnerState("paired");
        await refreshSecret(provider);
      } catch {
        setRunnerState("pairing");
      }
    } catch (error) {
      setRunnerState("offline");
      setMessage(
        error instanceof Error && error.message === "RUNNER_URL_INVALID"
          ? "The configured runner URL is not a loopback origin."
          : "Start the local runner, then check again.",
      );
    }
  }

  async function pair(formData: FormData) {
    setMessage(null);
    try {
      await request("/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: formData.get("pairingCode") }),
      });
      const session = await request("/v1/session");
      setBrowsers(session.browsers ?? []);
      setRunnerState("paired");
      await refreshSecret(provider);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PAIRING_REJECTED");
    }
  }

  async function refreshSecret(selected: RunnerProviderKind) {
    const next = await request(`/v1/provider-secrets/${selected}`);
    setStatus(next);
  }

  async function storeSecret(formData: FormData) {
    setMessage(null);
    const apiKey = formData.get("apiKey");
    try {
      const next = await request("/v1/provider-secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      setStatus(next);
      secretForm.current?.reset();
      setMessage("Stored by the local runner. The key was not sent to Convex.");
    } catch (error) {
      secretForm.current?.reset();
      setMessage(
        error instanceof Error ? error.message : "SECRET_STORE_FAILED",
      );
    }
  }

  async function deleteSecret() {
    setMessage(null);
    try {
      await request(`/v1/provider-secrets/${provider}`, { method: "DELETE" });
      setStatus({ provider, configured: false, fingerprint: null });
      setMessage("Local provider secret removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "SECRET_DELETE_FAILED",
      );
    }
  }

  async function probeProvider(formData: FormData) {
    setMessage(null);
    setCapabilities(null);
    try {
      const next = await request("/v1/provider-capabilities/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          baseUrl:
            provider === "responses-compatible"
              ? formData.get("baseUrl")
              : undefined,
        }),
      });
      setCapabilities(next);
      setMessage(
        "Authentication verified with a read-only model-list request. Generation capabilities remain unverified until a guarded test run.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PROVIDER_PROBE_FAILED",
      );
    }
  }

  return (
    <main className="settings-shell">
      <header className="onboarding-header">
        <Link className="wordmark" href="/">
          Open Social Agent <span>settings</span>
        </Link>
        <p className="header-proof">
          <ShieldAlert size={15} /> Local secret boundary
        </p>
      </header>
      <div className="settings-grid">
        <aside className="settings-aside">
          <p className="eyebrow">Provider and device</p>
          <h1>Pair the machine that will do the work.</h1>
          <p>
            The web app stores policy. The local runner holds provider
            credentials and later controls only an isolated browser profile.
          </p>
          <SafetyLine
            icon={<KeyRound size={18} />}
            title="No Convex secret field"
            copy="Only configured state and a redacted fingerprint leave the runner."
          />
          <SafetyLine
            icon={<Laptop size={18} />}
            title="Loopback only"
            copy="The runner cannot bind to a LAN or public interface."
          />
        </aside>
        <section className="settings-panel">
          <div className="settings-panel-header">
            <p className="eyebrow">Runner connection</p>
            <StatusBadge state={runnerState} />
          </div>
          {runnerState === "checking" || runnerState === "offline" ? (
            <div className="settings-block">
              <h2>Check the local runner</h2>
              <p>
                Run <code>pnpm start:runner</code> in the repository. It will
                print a six-digit code that expires after ten minutes.
              </p>
              <Button
                className="primary-action"
                onClick={() => void checkRunner()}
              >
                <Link2 size={16} /> Check connection
              </Button>
            </div>
          ) : null}
          {runnerState === "pairing" ? (
            <form action={pair} className="settings-block">
              <h2>Enter the pairing code</h2>
              <Label htmlFor="pairingCode">Six-digit code</Label>
              <Input
                id="pairingCode"
                name="pairingCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
              />
              <Button className="primary-action" type="submit">
                Pair this browser session
              </Button>
            </form>
          ) : null}
          {runnerState === "paired" ? (
            <>
              <div className="settings-block">
                <h2>Provider credential</h2>
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(event) => {
                    const next = event.target.value as RunnerProviderKind;
                    setProvider(next);
                    void refreshSecret(next);
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="responses-compatible">
                    Responses-compatible provider
                  </option>
                </select>
                <div className="secret-state">
                  {status?.configured ? (
                    <>
                      <Check size={17} />
                      <span>Configured · fingerprint {status.fingerprint}</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={17} />
                      <span>Not configured</span>
                    </>
                  )}
                </div>
              </div>
              <form
                ref={secretForm}
                action={storeSecret}
                className="settings-block"
              >
                <Label htmlFor="apiKey">Provider API key</Label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  minLength={20}
                  maxLength={512}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="field-help">
                  Submitted directly to the loopback runner. Never persisted in
                  React state, Convex, logs, or this repository.
                </p>
                <div className="settings-actions">
                  <Button className="primary-action" type="submit">
                    <KeyRound size={16} /> Store locally
                  </Button>
                  {status?.configured ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void deleteSecret()}
                    >
                      <Trash2 size={16} /> Remove
                    </Button>
                  ) : null}
                </div>
              </form>
              {status?.configured ? (
                <form action={probeProvider} className="settings-block">
                  <h2>Read-only capability check</h2>
                  {provider === "responses-compatible" ? (
                    <>
                      <Label htmlFor="baseUrl">Provider base URL</Label>
                      <Input
                        id="baseUrl"
                        name="baseUrl"
                        type="url"
                        required
                        placeholder="https://provider.example/v1"
                      />
                    </>
                  ) : null}
                  <p>
                    Lists available models without generating content. It proves
                    reachability and authentication only—not Responses, search,
                    structured output, usage, or computer-use support.
                  </p>
                  <Button variant="outline" type="submit">
                    Verify authentication
                  </Button>
                  {capabilities ? (
                    <div className="capability-result">
                      <strong>
                        Authenticated · {capabilities.modelsVisible} model(s)
                        visible
                      </strong>
                      <span>
                        Advanced capabilities: unverified · checked{" "}
                        {new Date(capabilities.checkedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </form>
              ) : null}
              <div className="settings-block">
                <h2>Detected supported browsers</h2>
                {browsers.length ? (
                  <ul className="browser-list">
                    {browsers.map((browser) => (
                      <li key={browser.kind}>
                        <Check size={15} />
                        {browser.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No supported browser executable was detected. No profile was
                    opened.
                  </p>
                )}
              </div>
            </>
          ) : null}
          {message ? (
            <p className="settings-message" role="status">
              {message}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ state }: { state: RunnerState }) {
  return <span className={`runner-status ${state}`}>{state}</span>;
}
function SafetyLine({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="safety-line">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
    </div>
  );
}
