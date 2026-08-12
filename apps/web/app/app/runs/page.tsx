"use client";

import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";

export default function RunsPage() {
  const runs = useQuery(api.workbench.listRunsMine, { limit: 100 });
  return (
    <AppShell
      eyebrow="Immutable run ledger"
      title="Every attempt keeps its name."
    >
      <section className="ledger-sheet">
        <div className="ledger-header">
          <span>Scheduled</span>
          <span>Schedule / profile</span>
          <span>State</span>
          <span>Evidence</span>
        </div>
        {runs === undefined ? (
          <p className="loading-copy">Reading the run ledger…</p>
        ) : runs.length === 0 ? (
          <EmptyDesk
            number="00"
            title="No runs recorded"
            copy="Manual and due runs appear here before a runner claims them."
          />
        ) : (
          runs.map((run) => (
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
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
