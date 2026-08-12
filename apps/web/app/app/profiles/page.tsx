"use client";

import {
  deriveAllowedOrigin,
  modelPresetPolicies,
  type AutomationProfileInput,
} from "@open-social-agent/contracts";
import { useMutation, useQuery } from "convex/react";
import { Archive, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AppShell,
  EmptyDesk,
  StateStamp,
} from "@/components/workbench/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialProfile: AutomationProfileInput = {
  name: "Evidence desk",
  destination: {
    feedUrl: "https://www.linkedin.com/feed/",
    allowedOrigin: "https://www.linkedin.com",
  },
  content: {
    topics: ["responsible AI operations"],
    persona: "A practical operator who explains decisions with evidence.",
    tone: "Clear, calm, and candid",
    style: "Plain language, concrete tradeoffs, no promotional filler.",
    structure:
      "Open with the decision, show the evidence, end with one useful question.",
    customInstructions: "",
    exclusions: ["unverified performance claims"],
  },
  research: {
    webSearchEnabled: true,
    allowedDomains: ["openai.com"],
    citationsRequired: true,
    freshnessDays: 14,
    maxSources: 8,
  },
  model: {
    provider: "openai",
    preset: "balanced",
    modelId: modelPresetPolicies.balanced.modelId,
    reasoningEffort: "medium",
    maxOutputTokens: 1800,
    perRunTokenGate: 12000,
    dailyTokenGate: 48000,
  },
};

type Status = "active" | "paused" | "archived";

export default function ProfilesPage() {
  const [status, setStatus] = useState<Status>("active");
  const profiles = useQuery(api.automationProfiles.listMine, { status });
  const create = useMutation(api.automationProfiles.createMine);
  const update = useMutation(api.automationProfiles.updateMine);
  const setLifecycle = useMutation(api.automationProfiles.setStatusMine);
  const purge = useMutation(api.automationProfiles.purgeMine);
  const [editingId, setEditingId] = useState<Id<"automationProfiles"> | null>(
    null,
  );
  const [draft, setDraft] = useState(initialProfile);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    try {
      if (editingId) await update({ profileId: editingId, ...draft });
      else await create(draft);
      setEditingId(null);
      setDraft(initialProfile);
      setMessage("Profile saved. No run or external action was started.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PROFILE_SAVE_FAILED",
      );
    }
  }

  return (
    <AppShell
      eyebrow="Profiles + destinations"
      title="Define the voice. Lock the corridor."
    >
      <section className="split-workbench">
        <div className="form-sheet">
          <div className="sheet-heading">
            <span>{editingId ? "EDIT" : "NEW"}</span>
            <div>
              <h2>
                {editingId
                  ? "Revise this profile"
                  : "Create an automation profile"}
              </h2>
              <p>
                One durable configuration joins destination, content, research,
                and model policy.
              </p>
            </div>
          </div>
          <div className="workbench-fields">
            <Field label="Profile name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Exact destination / feed URL" full>
              <Input
                type="url"
                value={draft.destination.feedUrl}
                onChange={(e) => {
                  const feedUrl = e.target.value;
                  let allowedOrigin = draft.destination.allowedOrigin;
                  try {
                    allowedOrigin = deriveAllowedOrigin(feedUrl);
                  } catch {}
                  setDraft({
                    ...draft,
                    destination: { feedUrl, allowedOrigin },
                  });
                }}
              />
              <small>Enforced origin: {draft.destination.allowedOrigin}</small>
            </Field>
            <Field label="Topics" full>
              <Input
                value={draft.content.topics.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: {
                      ...draft.content,
                      topics: toList(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Persona">
              <Textarea
                value={draft.content.persona}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: { ...draft.content, persona: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Tone">
              <Textarea
                value={draft.content.tone}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: { ...draft.content, tone: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Style">
              <Textarea
                value={draft.content.style}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: { ...draft.content, style: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Structure">
              <Textarea
                value={draft.content.structure}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: { ...draft.content, structure: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Custom instructions" full>
              <Textarea
                value={draft.content.customInstructions}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: {
                      ...draft.content,
                      customInstructions: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Exclusions" full>
              <Input
                value={draft.content.exclusions.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    content: {
                      ...draft.content,
                      exclusions: toList(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Allowed research domains" full>
              <Input
                value={draft.research.allowedDomains.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    research: {
                      ...draft.research,
                      allowedDomains: toList(e.target.value.toLowerCase()),
                    },
                  })
                }
              />
              <small>
                Hostname only, such as openai.com. Search fails closed when
                empty.
              </small>
            </Field>
            <Field label="Freshness window (days)">
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.research.freshnessDays}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    research: {
                      ...draft.research,
                      freshnessDays: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Maximum sources">
              <Input
                type="number"
                min={1}
                max={20}
                value={draft.research.maxSources}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    research: {
                      ...draft.research,
                      maxSources: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Model preset">
              <select
                value={draft.model.preset}
                onChange={(e) => {
                  const preset = e.target
                    .value as AutomationProfileInput["model"]["preset"];
                  const policy =
                    preset === "advanced" ? null : modelPresetPolicies[preset];
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      preset,
                      modelId: policy?.modelId ?? draft.model.modelId,
                      reasoningEffort:
                        policy?.reasoningEffort ?? draft.model.reasoningEffort,
                    },
                  });
                }}
              >
                <option value="economy">Economy</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Provider">
              <select
                value={draft.model.provider}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      provider: e.target
                        .value as AutomationProfileInput["model"]["provider"],
                    },
                  })
                }
              >
                <option value="openai">OpenAI</option>
                <option value="responses-compatible">
                  Responses-compatible
                </option>
              </select>
            </Field>
            <Field label="Model ID">
              <Input
                value={draft.model.modelId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: { ...draft.model, modelId: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Reasoning">
              <select
                value={draft.model.reasoningEffort}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      reasoningEffort: e.target
                        .value as AutomationProfileInput["model"]["reasoningEffort"],
                    },
                  })
                }
              >
                {["none", "low", "medium", "high", "xhigh", "max"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Max output tokens">
              <Input
                type="number"
                value={draft.model.maxOutputTokens}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      maxOutputTokens: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Per-run token gate">
              <Input
                type="number"
                value={draft.model.perRunTokenGate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      perRunTokenGate: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Daily token gate">
              <Input
                type="number"
                value={draft.model.dailyTokenGate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    model: {
                      ...draft.model,
                      dailyTokenGate: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={draft.research.citationsRequired}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    research: {
                      ...draft.research,
                      citationsRequired: e.target.checked,
                    },
                  })
                }
              />{" "}
              Require citations
            </label>
          </div>
          <div className="form-sheet-actions">
            <Button className="primary-action" onClick={() => void save()}>
              <Save size={15} />{" "}
              {editingId ? "Save revision" : "Create profile"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setDraft(initialProfile);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <span role="status">{message}</span>
          </div>
        </div>

        <div className="record-stack">
          <div className="filter-tabs">
            {(["active", "paused", "archived"] as Status[]).map((value) => (
              <button
                className={status === value ? "active" : ""}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {profiles === undefined ? (
            <p className="loading-copy">Reading profiles…</p>
          ) : profiles.length === 0 ? (
            <EmptyDesk
              number="00"
              title={`No ${status} profiles`}
              copy="Profiles keep destination and content policy together so each run can snapshot the exact revision."
            />
          ) : (
            profiles.map((profile) => (
              <article className="record-card" key={profile._id}>
                <div className="record-card-top">
                  <StateStamp state={profile.status} />
                  <small>revision {profile.revision}</small>
                </div>
                <h2>{profile.name}</h2>
                <a
                  href={profile.destination.feedUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {profile.destination.feedUrl}
                </a>
                <dl>
                  <div>
                    <dt>Topics</dt>
                    <dd>{profile.content.topics.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Research</dt>
                    <dd>
                      {profile.research.allowedDomains.join(", ")} ·{" "}
                      {profile.research.freshnessDays}d
                    </dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>
                      {profile.model.preset} · {profile.model.modelId}
                    </dd>
                  </div>
                </dl>
                <div className="record-actions">
                  {profile.status !== "archived" ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingId(profile._id);
                          setDraft({
                            name: profile.name,
                            destination: profile.destination,
                            content: profile.content,
                            research: profile.research,
                            model: profile.model,
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setLifecycle({
                            profileId: profile._id,
                            status: "archived",
                          })
                        }
                      >
                        <Archive size={14} /> Archive
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setLifecycle({
                            profileId: profile._id,
                            status: "active",
                          })
                        }
                      >
                        <RotateCcw size={14} /> Restore
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently purge ${profile.name}? This is only allowed when no schedule references it.`,
                            )
                          )
                            void purge({
                              profileId: profile._id,
                              confirmName: profile.name,
                            });
                        }}
                      >
                        <Trash2 size={14} /> Purge
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`workbench-field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function toList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
