"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Check,
  ExternalLink,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Status = "active" | "archived";

export default function DraftsPage() {
  const [status, setStatus] = useState<Status>("active");
  const drafts = useQuery(api.workbench.listDraftsMine, { status });
  const revise = useMutation(api.outputs.reviseMine);
  const setArchived = useMutation(api.outputs.setArchivedMine);
  const purge = useMutation(api.outputs.purgeMine);
  const decide = useMutation(api.approvals.decideMine);
  const [editing, setEditing] = useState<Id<"outputs"> | null>(null);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function saveRevision(outputId: Id<"outputs">) {
    setMessage(null);
    try {
      await revise({ outputId, body });
      setEditing(null);
      setMessage(
        "Revision saved. Any prior approval would be stale and cannot execute.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "REVISION_SAVE_FAILED",
      );
    }
  }

  return (
    <AppShell
      eyebrow="Drafts + approval line"
      title="Read every claim before it speaks for you."
    >
      <div className="filter-tabs page-tabs">
        {(["active", "archived"] as Status[]).map((value) => (
          <button
            className={status === value ? "active" : ""}
            key={value}
            onClick={() => setStatus(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {message ? (
        <p className="desk-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="draft-stack">
        {drafts === undefined ? (
          <p className="loading-copy">Reading drafts and evidence…</p>
        ) : drafts.length === 0 ? (
          <EmptyDesk
            number="00"
            title={`No ${status} drafts`}
            copy="A draft appears only after the local harness has researched, composed, and passed or recorded its evaluation."
          />
        ) : (
          drafts.map((draft) => (
            <article className="draft-sheet" key={draft.outputId}>
              <header>
                <div>
                  <StateStamp state={draft.runState} />
                  <small>
                    {formatMoment(draft.createdAt)} · revision {draft.revision}
                  </small>
                </div>
                <div className="model-line">
                  <span>{draft.actualModel}</span>
                  <small>
                    {draft.totalTokens.toLocaleString()} tokens ·{" "}
                    {draft.latencyMs}ms
                  </small>
                </div>
              </header>
              <div className="draft-layout">
                <section className="draft-copy">
                  <p className="eyebrow">Current revision</p>
                  {editing === draft.outputId ? (
                    <Textarea
                      aria-label="Draft body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  ) : (
                    <div className="post-body">{draft.body}</div>
                  )}
                  <div className="draft-actions">
                    {editing === draft.outputId ? (
                      <>
                        <Button
                          className="primary-action"
                          onClick={() => void saveRevision(draft.outputId)}
                        >
                          Save immutable revision
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : status === "active" ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(draft.outputId);
                          setBody(draft.body);
                        }}
                      >
                        <Pencil size={14} /> Edit draft
                      </Button>
                    ) : null}
                    {status === "active" ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void setArchived({
                            outputId: draft.outputId,
                            archived: true,
                          })
                        }
                      >
                        <Archive size={14} /> Archive
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void setArchived({
                              outputId: draft.outputId,
                              archived: false,
                            })
                          }
                        >
                          <RotateCcw size={14} /> Restore
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const confirmation = window.prompt(
                              `Enter ${draft.bodyHash.slice(0, 12)} to permanently purge this unapproved draft.`,
                            );
                            if (confirmation)
                              void purge({
                                outputId: draft.outputId,
                                confirmHash: confirmation,
                              });
                          }}
                        >
                          <Trash2 size={14} /> Purge
                        </Button>
                      </>
                    )}
                  </div>

                  {draft.runState === "awaiting_approval" &&
                  status === "active" ? (
                    <div className="approval-line">
                      <div>
                        <ShieldCheck size={19} />
                        <div>
                          <strong>Exact approval required</strong>
                          <p>
                            This binds revision {draft.revision}, its SHA-256
                            hash, and the destination below for 10 minutes.
                          </p>
                        </div>
                      </div>
                      <a
                        href={draft.destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {draft.destinationUrl} <ExternalLink size={13} />
                      </a>
                      <label className="confirm-line">
                        <input
                          id={`confirm-${draft.outputId}`}
                          type="checkbox"
                        />{" "}
                        I reviewed the complete body, citations, risks, and
                        exact destination.
                      </label>
                      <div>
                        <Button
                          className="primary-action"
                          onClick={async () => {
                            const checkbox = document.getElementById(
                              `confirm-${draft.outputId}`,
                            ) as HTMLInputElement | null;
                            if (!checkbox?.checked)
                              return setMessage(
                                "Review confirmation is required.",
                              );
                            await decide({
                              runId: draft.runId,
                              outputId: draft.outputId,
                              revision: draft.revision,
                              bodyHash: draft.bodyHash,
                              destinationUrl: draft.destinationUrl,
                              expiresAt: Date.now() + 10 * 60 * 1000,
                              decision: "approved",
                            });
                            setMessage(
                              "Exact revision approved for 10 minutes. The local runner must still claim and verify it.",
                            );
                          }}
                        >
                          <Check size={15} /> Approve exact revision
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void decide({
                              runId: draft.runId,
                              outputId: draft.outputId,
                              revision: draft.revision,
                              bodyHash: draft.bodyHash,
                              destinationUrl: draft.destinationUrl,
                              expiresAt: Date.now() + 10 * 60 * 1000,
                              decision: "rejected",
                            })
                          }
                        >
                          <X size={15} /> Reject
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <aside className="evidence-column">
                  <section>
                    <p className="eyebrow">Evaluation</p>
                    {draft.evaluation ? (
                      <>
                        <StateStamp state={draft.evaluation.state} />
                        <dl>
                          <div>
                            <dt>Duplicate score</dt>
                            <dd>
                              {Math.round(
                                draft.evaluation.duplicateScore * 100,
                              )}
                              %
                            </dd>
                          </div>
                          <div>
                            <dt>Codes</dt>
                            <dd>
                              {draft.evaluation.codes.join(", ") || "none"}
                            </dd>
                          </div>
                          <div>
                            <dt>Warnings</dt>
                            <dd>
                              {draft.evaluation.warnings.join(", ") || "none"}
                            </dd>
                          </div>
                        </dl>
                      </>
                    ) : (
                      <p>No evaluation record.</p>
                    )}
                  </section>
                  <section>
                    <p className="eyebrow">Sources</p>
                    {draft.evidence.length ? (
                      <ol className="source-list">
                        {draft.evidence.map((item) => (
                          <li key={item.evidenceId}>
                            <a href={item.url} target="_blank" rel="noreferrer">
                              <strong>{item.title}</strong>
                              <span>
                                {item.domain} · retrieved{" "}
                                {new Date(
                                  item.retrievedAt,
                                ).toLocaleDateString()}{" "}
                                <ExternalLink size={12} />
                              </span>
                            </a>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>No web evidence was admitted.</p>
                    )}
                  </section>
                  {draft.assumptions.length ? (
                    <section>
                      <p className="eyebrow">Assumptions</p>
                      <ul>
                        {draft.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {draft.riskFlags.length ? (
                    <section className="risk-section">
                      <p className="eyebrow">Risk flags</p>
                      <ul>
                        {draft.riskFlags.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {draft.sourceMap.length ? (
                    <section>
                      <p className="eyebrow">Claim map</p>
                      <ul>
                        {draft.sourceMap.map((item) => (
                          <li key={item.claim}>
                            {item.claim}
                            <small>{item.evidenceIds.join(", ")}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </aside>
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
