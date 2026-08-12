"use client";

import { useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import {
  AppShell,
  EmptyDesk,
  formatMoment,
  StateStamp,
} from "@/components/workbench/app-shell";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const summary = useQuery(api.workbench.getDashboardMine);

  return (
    <AppShell
      eyebrow="Today’s control surface"
      title="Nothing leaves this desk unnoticed."
      action={
        <Button asChild className="primary-action">
          <Link href="/app/schedules">
            Prepare a run <ArrowRight size={16} />
          </Link>
        </Button>
      }
    >
      {summary === undefined ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="metric-ledger" aria-label="Workspace summary">
            <Metric
              number={summary.activeProfiles}
              label="Active profiles"
              note="voice + destination"
            />
            <Metric
              number={summary.activeSchedules}
              label="Active schedules"
              note="preparation only"
            />
            <Metric
              number={summary.draftsAwaitingApproval}
              label="Needs your decision"
              note="exact revision review"
              urgent={summary.draftsAwaitingApproval > 0}
            />
            <Metric
              number={summary.liveReceipts}
              label="Verified live"
              note="direct-detail proof"
            />
          </section>

          <section className="desk-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Recent execution ledger</p>
                <h2>Runs, in their actual state</h2>
              </div>
              <Link href="/app/runs">
                View complete ledger <ArrowRight size={14} />
              </Link>
            </div>
            {summary.recentRuns.length === 0 ? (
              <EmptyDesk
                number="00"
                title="No run has started"
                copy="Create a profile and schedule, then request a manual run. The runner must be paired before generation begins."
                action={
                  <Button asChild variant="outline">
                    <Link href="/app/profiles">Create the first profile</Link>
                  </Button>
                }
              />
            ) : (
              <div className="run-ledger">
                {summary.recentRuns.map((run) => (
                  <article key={run.runId}>
                    <span className="run-marker">
                      <Clock3 size={16} />
                    </span>
                    <div>
                      <strong>{run.scheduleName}</strong>
                      <small>
                        {run.profileName} · {formatMoment(run.scheduledFor)}
                      </small>
                    </div>
                    <StateStamp state={run.state} />
                    {run.outputId ? (
                      <Link aria-label="Open draft" href="/app/drafts">
                        <ExternalLink size={16} />
                      </Link>
                    ) : (
                      <span />
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="boundary-panel">
            <div>
              <ShieldAlert size={20} />
              <p className="eyebrow">Publication boundary</p>
            </div>
            <h2>Automation ends at the approval line.</h2>
            <p>
              A run can research, compose, and evaluate. Public submission
              requires your current approval of one body hash and one
              destination, then direct-page verification.
            </p>
            <div className="boundary-sequence">
              <span>
                <CheckCircle2 size={14} /> Prepare
              </span>
              <span>
                <CheckCircle2 size={14} /> Evaluate
              </span>
              <span className="human">Human approval</span>
              <span>Verify</span>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Metric({
  number,
  label,
  note,
  urgent = false,
}: {
  number: number;
  label: string;
  note: string;
  urgent?: boolean;
}) {
  return (
    <article className={urgent ? "urgent" : ""}>
      <strong>{String(number).padStart(2, "0")}</strong>
      <div>
        <span>{label}</span>
        <small>{note}</small>
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <section className="loading-ledger" aria-live="polite">
      <span />
      <span />
      <span />
      <p>Reading the durable ledger…</p>
    </section>
  );
}
