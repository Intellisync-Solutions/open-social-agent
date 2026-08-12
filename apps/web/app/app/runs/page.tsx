"use client";

import { useMutation, useQuery } from "convex/react";
import { Archive, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";
import { Button } from "@/components/ui/button";

export default function RunsPage() {
  const runs = useQuery(api.workbench.listRunsMine, { limit: 100 });
  const setArchived = useMutation(api.runHistory.setArchivedMine);
  const purge = useMutation(api.runHistory.purgeMine);
  const cancel = useMutation(api.runHistory.cancelMine);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const visibleRuns = runs?.filter((run) =>
    showArchived ? run.archivedAt !== undefined : run.archivedAt === undefined,
  );
  return (
    <AppShell
      eyebrow="Immutable run ledger"
      title="Every attempt keeps its name."
    >
      <div className="filter-tabs page-tabs">
        <button
          className={!showArchived ? "active" : ""}
          onClick={() => setShowArchived(false)}
        >
          active
        </button>
        <button
          className={showArchived ? "active" : ""}
          onClick={() => setShowArchived(true)}
        >
          archived
        </button>
      </div>
      {message ? (
        <p className="desk-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="ledger-sheet">
        <div className="ledger-header">
          <span>Scheduled</span>
          <span>Schedule / profile</span>
          <span>State</span>
          <span>Evidence</span>
        </div>
        {visibleRuns === undefined ? (
          <p className="loading-copy">Reading the run ledger…</p>
        ) : visibleRuns.length === 0 ? (
          <EmptyDesk
            number="00"
            title="No runs recorded"
            copy="Manual and due runs appear here before a runner claims them."
          />
        ) : (
          visibleRuns.map((run) => (
            <article className="ledger-row" key={run.runId}>
              <time dateTime={new Date(run.scheduledFor).toISOString()}>
                {formatMoment(run.scheduledFor)}
              </time>
              <div>
                <strong>{run.scheduleName}</strong>
                <small>
                  {run.profileName}
                  {run.missedOccurrences
                    ? ` · ${run.missedOccurrences} stale occurrence${run.missedOccurrences === 1 ? "" : "s"} skipped`
                    : ""}
                  {run.blockedCode ? ` · ${run.blockedCode}` : ""}
                </small>
              </div>
              <StateStamp state={run.state} />
              <div className="ledger-proof">
                {run.receipt?.directUrl ? (
                  <a
                    href={run.receipt.directUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Direct detail <ExternalLink size={13} />
                  </a>
                ) : run.outputId ? (
                  <Link href="/app/drafts">Open draft</Link>
                ) : (
                  <span>Trace {run.traceId.slice(0, 10)}</span>
                )}
                {run.state === "queued" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Cancel this queued preparation run?"))
                        void cancel({ runId: run.runId });
                    }}
                  >
                    Cancel queued run
                  </Button>
                ) : null}
                {[
                  "live",
                  "pending",
                  "blocked",
                  "failed",
                  "rejected",
                  "cancelled",
                ].includes(run.state) ? (
                  <div className="run-lifecycle-actions">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={showArchived ? "Restore run" : "Archive run"}
                      onClick={() =>
                        void setArchived({
                          runId: run.runId,
                          archived: !showArchived,
                        })
                      }
                    >
                      {showArchived ? (
                        <RotateCcw size={13} />
                      ) : (
                        <Archive size={13} />
                      )}
                    </Button>
                    {showArchived ? (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Purge eligible run"
                        onClick={async () => {
                          const confirmation = window.prompt(
                            `Enter ${run.traceId.slice(0, 12)} to purge this run. Runs with audit evidence are retained.`,
                          );
                          if (!confirmation) return;
                          try {
                            await purge({
                              runId: run.runId,
                              confirmTrace: confirmation,
                            });
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "RUN_PURGE_FAILED",
                            );
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
