"use client";

import {
  deriveAllowedOrigin,
  modelPresetPolicies,
  OnboardingDraftSchema,
  onboardingStepIds,
  type OnboardingDraft,
} from "@open-social-agent/contracts";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  KeyRound,
  Save,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const stepCopy: Record<
  (typeof onboardingStepIds)[number],
  { number: string; title: string; short: string; note: string }
> = {
  welcome: {
    number: "01",
    title: "Set the operating boundary",
    short: "Boundary",
    note: "Preparation can be automated. Publication always pauses for your exact approval.",
  },
  provider: {
    number: "02",
    title: "Choose the model route",
    short: "Provider",
    note: "Provider secrets will be held by the local runner, never Convex or the browser bundle.",
  },
  browser: {
    number: "03",
    title: "Choose an isolated browser",
    short: "Browser",
    note: "V1 never reads your everyday browser profile, cookies, passwords, history, or extensions.",
  },
  destination: {
    number: "04",
    title: "Authorize one exact destination",
    short: "Destination",
    note: "The URL becomes a runtime origin boundary, not just text in a model prompt.",
  },
  voice: {
    number: "05",
    title: "Define how you sound",
    short: "Voice",
    note: "Saved guidance is snapshotted into each run so later edits cannot rewrite history.",
  },
  research: {
    number: "06",
    title: "Bound the evidence search",
    short: "Research",
    note: "Only enabled tools and allowed domains can enter the evidence packet.",
  },
  schedule: {
    number: "07",
    title: "Schedule preparation",
    short: "Schedule",
    note: "A due run creates work for review. It does not authorize a public action.",
  },
  review: {
    number: "08",
    title: "Review the control surface",
    short: "Review",
    note: "Completing onboarding records configuration only. The runner remains disabled until paired.",
  },
};

const initialDraft: OnboardingDraft = {
  schemaVersion: 1,
  currentStep: "welcome",
  completedSteps: [],
  provider: {
    kind: "openai",
    modelPreset: "balanced",
    modelId: modelPresetPolicies.balanced.modelId,
    reasoningEffort: "medium",
    maxOutputTokens: 1800,
    perRunTokenGate: 12000,
    secretConfigured: false,
  },
  browser: {
    kind: "brave",
    profileLabel: "Open Social Agent",
    authorized: false,
  },
  destination: {
    feedUrl: "https://www.linkedin.com/feed/",
    allowedOrigin: "https://www.linkedin.com",
  },
  voice: {
    persona: "A practical operator who explains decisions with evidence.",
    tone: "Clear, calm, and candid",
    style: "Plain language, concrete tradeoffs, no promotional filler.",
    structure:
      "Open with the decision, show the evidence, end with one useful question.",
    customInstructions: "",
  },
  research: {
    webSearchEnabled: true,
    allowedDomains: [],
    citationsRequired: true,
    freshnessDays: 14,
    topics: ["responsible AI operations"],
  },
  schedule: {
    cadence: "weekly",
    timezone: "America/Toronto",
    localTime: "09:30",
    weekday: 2,
    enabled: false,
  },
  updatedAt: 0,
};

export default function OnboardingPage() {
  const saved = useQuery(api.onboarding.getMine);

  if (saved === undefined) {
    return (
      <main className="onboarding-loading">
        <p className="eyebrow">Restoring setup</p>
        <h1>Opening your last saved step…</h1>
      </main>
    );
  }

  if (saved === null) {
    return <OnboardingEditor initial={initialDraft} />;
  }

  const restored = parseSavedDraft(saved.draftJson);
  return (
    <OnboardingEditor
      key={saved._id}
      initial={restored.initial}
      initialMessage={restored.message}
    />
  );
}

function parseSavedDraft(draftJson: string): {
  initial: OnboardingDraft;
  message: string | null;
} {
  try {
    const parsed = OnboardingDraftSchema.safeParse(JSON.parse(draftJson));
    return parsed.success
      ? { initial: parsed.data, message: null }
      : {
          initial: initialDraft,
          message:
            "The saved draft could not be validated. A safe default is shown; nothing was overwritten.",
        };
  } catch {
    return {
      initial: initialDraft,
      message:
        "The saved draft is not valid JSON. A safe default is shown; nothing was overwritten.",
    };
  }
}

function OnboardingEditor({
  initial,
  initialMessage = null,
}: {
  initial: OnboardingDraft;
  initialMessage?: string | null;
}) {
  const save = useMutation(api.onboarding.saveMine);
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(initialMessage);

  const index = onboardingStepIds.indexOf(draft.currentStep);

  function update<K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function persist(nextDraft = draft) {
    const candidate = { ...nextDraft, updatedAt: Date.now() };
    const parsed = OnboardingDraftSchema.safeParse(candidate);
    if (!parsed.success) {
      setStatus("error");
      setMessage(parsed.error.issues[0]?.message ?? "Review the current step.");
      return false;
    }
    setStatus("saving");
    setMessage(null);
    try {
      await save({
        schemaVersion: 1,
        currentStep: parsed.data.currentStep,
        completedSteps: parsed.data.completedSteps,
        draftJson: JSON.stringify(parsed.data),
        updatedAt: parsed.data.updatedAt,
      });
      setDraft(parsed.data);
      setStatus("saved");
      return true;
    } catch (caught) {
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Save failed.");
      return false;
    }
  }

  async function next() {
    if (index === onboardingStepIds.length - 1) return void persist();
    const current = draft.currentStep;
    const nextDraft = {
      ...draft,
      completedSteps: Array.from(new Set([...draft.completedSteps, current])),
      currentStep: onboardingStepIds[index + 1],
    };
    if (await persist(nextDraft))
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previous() {
    if (index > 0) update("currentStep", onboardingStepIds[index - 1]);
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Link className="wordmark" href="/">
          Open Social Agent <span>setup</span>
        </Link>
        <div className="progress-copy">
          <strong>
            {index + 1} / {onboardingStepIds.length}
          </strong>
          <span>
            {Math.round(((index + 1) / onboardingStepIds.length) * 100)}%
            configured
          </span>
        </div>
      </header>
      <div className="progress-track" aria-hidden="true">
        <span
          style={{
            width: `${((index + 1) / onboardingStepIds.length) * 100}%`,
          }}
        />
      </div>

      <div className="onboarding-layout">
        <nav className="step-nav" aria-label="Onboarding steps">
          {onboardingStepIds.map((step, stepIndex) => {
            const done = draft.completedSteps.includes(step);
            const active = step === draft.currentStep;
            return (
              <button
                key={step}
                aria-current={active ? "step" : undefined}
                className={active ? "active" : ""}
                onClick={() => update("currentStep", step)}
              >
                {done ? <Check size={15} /> : <Circle size={12} />}
                <span>{stepCopy[step].short}</span>
                <small>{String(stepIndex + 1).padStart(2, "0")}</small>
              </button>
            );
          })}
        </nav>

        <section className="step-workspace">
          <div className="step-heading">
            <p className="eyebrow">Step {stepCopy[draft.currentStep].number}</p>
            <h1>{stepCopy[draft.currentStep].title}</h1>
            <p>{stepCopy[draft.currentStep].note}</p>
          </div>
          <StepFields draft={draft} update={update} />
          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <footer className="step-actions">
            <Button variant="outline" disabled={index === 0} onClick={previous}>
              <ArrowLeft size={16} /> Back
            </Button>
            <button
              className="save-later"
              onClick={() => void persist()}
              disabled={status === "saving"}
            >
              <Save size={15} />
              {status === "saving"
                ? "Saving…"
                : status === "saved"
                  ? "Saved"
                  : "Save for later"}
            </button>
            <Button className="primary-action" onClick={() => void next()}>
              {index === onboardingStepIds.length - 1
                ? "Save configuration"
                : "Save & continue"}
              <ArrowRight size={16} />
            </Button>
          </footer>
        </section>
      </div>
    </main>
  );
}

type Update = <K extends keyof OnboardingDraft>(
  key: K,
  value: OnboardingDraft[K],
) => void;

function StepFields({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: Update;
}) {
  switch (draft.currentStep) {
    case "welcome":
      return (
        <div className="boundary-grid">
          <ControlCard
            index="A"
            title="Preparation"
            copy="Research, composition, evaluation, and a review-ready draft."
            active
          />
          <ControlCard
            index="B"
            title="Approval"
            copy="Your decision binds one exact revision to one exact destination."
            active
          />
          <ControlCard
            index="C"
            title="Publication"
            copy="A local isolated browser can act only after current approval."
          />
        </div>
      );
    case "provider":
      return (
        <div className="field-grid">
          <Field label="Provider">
            <Select
              value={draft.provider.kind}
              onChange={(kind) =>
                update("provider", {
                  ...draft.provider,
                  kind: kind as OnboardingDraft["provider"]["kind"],
                })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="responses-compatible">Responses-compatible</option>
            </Select>
          </Field>
          <Field label="Preset">
            <Select
              value={draft.provider.modelPreset}
              onChange={(modelPreset) =>
                update("provider", {
                  ...draft.provider,
                  modelPreset:
                    modelPreset as OnboardingDraft["provider"]["modelPreset"],
                })
              }
            >
              <option value="economy">Economy</option>
              <option value="balanced">Balanced</option>
              <option value="quality">Quality</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
          <Field label="Model ID">
            <Input
              value={draft.provider.modelId}
              onChange={(e) =>
                update("provider", {
                  ...draft.provider,
                  modelId: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Reasoning effort">
            <Select
              value={draft.provider.reasoningEffort}
              onChange={(reasoningEffort) =>
                update("provider", {
                  ...draft.provider,
                  reasoningEffort:
                    reasoningEffort as OnboardingDraft["provider"]["reasoningEffort"],
                })
              }
            >
              {["none", "low", "medium", "high", "xhigh", "max"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Maximum output tokens">
            <Input
              type="number"
              value={draft.provider.maxOutputTokens}
              onChange={(e) =>
                update("provider", {
                  ...draft.provider,
                  maxOutputTokens: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Per-run token gate">
            <Input
              type="number"
              value={draft.provider.perRunTokenGate}
              onChange={(e) =>
                update("provider", {
                  ...draft.provider,
                  perRunTokenGate: Number(e.target.value),
                })
              }
            />
          </Field>
          <div className="full-width local-secret-note">
            <KeyRound size={18} />
            <div>
              <strong>API key setup follows local runner pairing.</strong>
              <p>
                This web draft stores provider metadata only. It has no field or
                transport for a provider secret.
              </p>
            </div>
          </div>
        </div>
      );
    case "browser":
      return (
        <div className="field-grid">
          <Field label="Installed browser choice">
            <Select
              value={draft.browser.kind}
              onChange={(kind) =>
                update("browser", {
                  ...draft.browser,
                  kind: kind as OnboardingDraft["browser"]["kind"],
                })
              }
            >
              <option value="brave">Brave</option>
              <option value="chrome">Chrome</option>
              <option value="edge">Edge</option>
              <option value="chromium">Chromium</option>
            </Select>
          </Field>
          <Field label="Isolated profile label">
            <Input
              value={draft.browser.profileLabel}
              onChange={(e) =>
                update("browser", {
                  ...draft.browser,
                  profileLabel: e.target.value,
                })
              }
            />
          </Field>
          <div className="full-width local-secret-note">
            <ShieldAlert size={18} />
            <div>
              <strong>Not yet authorized</strong>
              <p>
                The runner will detect the actual executable and create an
                app-owned profile. Selecting a label here does not prove browser
                access.
              </p>
            </div>
          </div>
        </div>
      );
    case "destination":
      return (
        <div className="field-grid one-column">
          <Field label="Custom feed or destination URL">
            <Input
              type="url"
              value={draft.destination.feedUrl}
              onChange={(e) => {
                const feedUrl = e.target.value;
                let allowedOrigin = draft.destination.allowedOrigin;
                try {
                  allowedOrigin = deriveAllowedOrigin(feedUrl);
                } catch {}
                update("destination", { feedUrl, allowedOrigin });
              }}
            />
          </Field>
          <Field label="Enforced origin">
            <Input value={draft.destination.allowedOrigin} readOnly />
          </Field>
          <p className="field-help">
            Navigation outside this origin will require a separate research
            allowlist or stop the run.
          </p>
        </div>
      );
    case "voice":
      return (
        <div className="field-grid one-column">
          <Field label="Persona">
            <Textarea
              value={draft.voice.persona}
              onChange={(e) =>
                update("voice", { ...draft.voice, persona: e.target.value })
              }
            />
          </Field>
          <Field label="Tone">
            <Input
              value={draft.voice.tone}
              onChange={(e) =>
                update("voice", { ...draft.voice, tone: e.target.value })
              }
            />
          </Field>
          <Field label="Writing style">
            <Textarea
              value={draft.voice.style}
              onChange={(e) =>
                update("voice", { ...draft.voice, style: e.target.value })
              }
            />
          </Field>
          <Field label="Preferred structure">
            <Textarea
              value={draft.voice.structure}
              onChange={(e) =>
                update("voice", { ...draft.voice, structure: e.target.value })
              }
            />
          </Field>
          <Field label="Custom instructions">
            <Textarea
              value={draft.voice.customInstructions}
              onChange={(e) =>
                update("voice", {
                  ...draft.voice,
                  customInstructions: e.target.value,
                })
              }
              placeholder="Optional exclusions, phrases to avoid, or decision rules"
            />
          </Field>
        </div>
      );
    case "research":
      return (
        <div className="field-grid one-column">
          <Field label="Topics (one per line)">
            <Textarea
              value={draft.research.topics.join("\n")}
              onChange={(e) =>
                update("research", {
                  ...draft.research,
                  topics: e.target.value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Allowed research domains (one per line)">
            <Textarea
              value={draft.research.allowedDomains.join("\n")}
              onChange={(e) =>
                update("research", {
                  ...draft.research,
                  allowedDomains: e.target.value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
              placeholder="openai.com\ncanada.ca"
            />
          </Field>
          <Field label="Evidence freshness in days">
            <Input
              type="number"
              value={draft.research.freshnessDays}
              onChange={(e) =>
                update("research", {
                  ...draft.research,
                  freshnessDays: Number(e.target.value),
                })
              }
            />
          </Field>
          <Toggle
            checked={draft.research.webSearchEnabled}
            onChange={(webSearchEnabled) =>
              update("research", { ...draft.research, webSearchEnabled })
            }
            label="Allow OpenAI web search for research"
          />
          <Toggle
            checked={draft.research.citationsRequired}
            onChange={(citationsRequired) =>
              update("research", { ...draft.research, citationsRequired })
            }
            label="Require citations in the evidence packet"
          />
        </div>
      );
    case "schedule":
      return (
        <div className="field-grid">
          <Field label="Cadence">
            <Select
              value={draft.schedule.cadence}
              onChange={(cadence) =>
                update("schedule", {
                  ...draft.schedule,
                  cadence: cadence as OnboardingDraft["schedule"]["cadence"],
                })
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
          <Field label="Local preparation time">
            <Input
              type="time"
              value={draft.schedule.localTime}
              onChange={(e) =>
                update("schedule", {
                  ...draft.schedule,
                  localTime: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Timezone">
            <Input
              value={draft.schedule.timezone}
              onChange={(e) =>
                update("schedule", {
                  ...draft.schedule,
                  timezone: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Weekday (0 Sunday – 6 Saturday)">
            <Input
              type="number"
              min="0"
              max="6"
              value={draft.schedule.weekday ?? 2}
              onChange={(e) =>
                update("schedule", {
                  ...draft.schedule,
                  weekday: Number(e.target.value),
                })
              }
            />
          </Field>
          <div className="full-width local-secret-note">
            <ShieldAlert size={18} />
            <div>
              <strong>Schedule remains disabled.</strong>
              <p>
                Completing setup does not enable or run it. Runner pairing and a
                separate activation decision are required.
              </p>
            </div>
          </div>
        </div>
      );
    case "review":
      return (
        <div className="review-list">
          {[
            [
              "Provider",
              `${draft.provider.kind} · ${draft.provider.modelPreset} · ${draft.provider.reasoningEffort}`,
            ],
            [
              "Browser",
              `${draft.browser.kind} · ${draft.browser.profileLabel} · not authorized`,
            ],
            ["Destination", draft.destination.feedUrl],
            ["Voice", `${draft.voice.tone} · ${draft.voice.persona}`],
            [
              "Research",
              `${draft.research.topics.length} topic(s) · ${draft.research.allowedDomains.length || "no"} domain restrictions`,
            ],
            [
              "Schedule",
              `${draft.schedule.cadence} at ${draft.schedule.localTime} ${draft.schedule.timezone} · disabled`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      );
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function ControlCard({
  index,
  title,
  copy,
  active = false,
}: {
  index: string;
  title: string;
  copy: string;
  active?: boolean;
}) {
  return (
    <article className={active ? "control-card active" : "control-card"}>
      <span>{index}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
      <small>
        {active ? "Configured in this app" : "Requires runner + approval"}
      </small>
    </article>
  );
}
