"use client";

import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";

export default function HistoryPage() {
  const runs = useQuery(api.workbench.listRunsMine, { limit: 100 });
  const terminal = runs?.filter((run) =>
    ["live", "pending", "blocked", "failed", "rejected", "cancelled"].includes(
      run.state,
    ) && run.archivedAt === undefined,
  );
  return (
    <AppShell
      eyebrow="Receipts + terminal outcomes"
      title="Proof after the click, not instead of it."
    >
      <section className="history-intro">
        <p>
          Only a verified direct-detail URL earns <strong>live</strong>. A
          click, model message, or destination feed is never silently promoted
          into proof.
        </p>
      </section>
      <section className="receipt-grid">
        {terminal === undefined ? (
          <p className="loading-copy">Reading receipts…</p>
        ) : terminal.length === 0 ? (
          <EmptyDesk
            number="00"
            title="No terminal history yet"
            copy="Rejected, cancelled, blocked, failed, pending, and directly verified live outcomes remain visible here."
          />
        ) : (
          terminal.map((run) => (
            <article className="receipt-card" key={run.runId}>
              <div>
                <StateStamp state={run.state} />
                <time>{formatMoment(run.updatedAt)}</time>
              </div>
              <h2>{run.scheduleName}</h2>
              <p>{run.profileName}</p>
              <dl>
                <div>
                  <dt>Trace</dt>
                  <dd>{run.traceId}</dd>
                </div>
                {run.receipt?.errorCode ? (
                  <div>
                    <dt>Error</dt>
                    <dd>{run.receipt.errorCode}</dd>
                  </div>
                ) : null}
                {!run.receipt?.errorCode && run.blockedCode ? (
                  <div>
                    <dt>Block</dt>
                    <dd>{run.blockedCode}</dd>
                  </div>
                ) : null}
              </dl>
              {run.receipt?.directUrl ? (
                <a
                  href={run.receipt.directUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open verified detail <ExternalLink size={14} />
                </a>
              ) : (
                <small>No direct-detail proof recorded.</small>
              )}
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
