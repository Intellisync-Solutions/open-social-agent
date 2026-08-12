# Slice 0005 — Schedules and zero-post harness

Date: 2026-08-12

State: local implementation and deterministic validation complete; branch and
pull-request evidence pending

## Outcome

Implemented the durable configuration and scheduling spine without enabling
model or browser execution: shared automation contracts, auth-scoped profile and
schedule CRUD, archive/restore/exact-confirmation purge rules, DST-aware
recurrence, idempotent manual and due-run creation, immutable configuration
snapshots, valid run transitions, and a zero-post harness plan.

## Integrity properties

- all public Convex functions derive the user from Convex Auth and verify row
  ownership;
- profile, destination, content, research, model, and schedule inputs are
  runtime-validated;
- daily and weekly wall-clock schedules preserve their IANA-timezone time
  across daylight-saving changes;
- advanced schedules accept exactly five cron fields;
- due occurrence identity is `scheduleId + scheduledFor + revision`;
- run snapshots preserve the exact profile and schedule revisions used;
- history references prevent destructive schedule/profile purge;
- the zero-post plan rejects invalid budgets and records provider generation,
  computer use, and publication as skipped;
- no cron is registered in this slice, so no background run begins
  automatically.

## Validation evidence

- root `pnpm lint`: passed during implementation
- root `pnpm typecheck`: passed across seven workspace packages plus Convex
- root `pnpm test`: passed, 45 package tests plus four Convex integration tests
- two-user integration test: passed; one user's profiles and schedule are not
  available to another user
- idempotent manual and due-run integration tests: passed
- DST tests: Toronto spring-forward and fall-back occurrences passed
- zero-post tests: invalid transition and budget denial passed; external writes
  remain zero

## Convex CLI evidence boundary

`convex codegen --typecheck enable` was used after its help text stated that it
does not modify deployed code. Its output nevertheless included “Uploading
functions to Convex.” A subsequent read-only `convex function-spec` check did
not show the new functions on the linked development deployment. This is
recorded as ambiguous CLI wording, not deployment proof. No production
deployment was addressed and no production state was changed.

## Unverified and disabled

- no automatic cron registration or background execution;
- no provider generation, research call, paid token use, or output persistence;
- no runner claim, browser profile, computer use, destination navigation,
  approval, publication, or deployment verification.
