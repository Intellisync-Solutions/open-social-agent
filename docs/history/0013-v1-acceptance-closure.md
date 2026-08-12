# Slice 0013 — V1 acceptance closure

Date: 2026-08-12

State: implemented, validated, and published on `codex/v1-acceptance-closure`
through pull request #11

## Outcome

Closed the final bounded V1 acceptance gaps without expanding the approved
self-hosted one-operator architecture.

- onboarding can be resumed or restarted with explicit destructive confirmation;
- draft review exposes the immutable original model body and bounded web-search
  execution details alongside revisions, evidence, evaluation, model, usage,
  and latency;
- daily usage is counted by UTC day and a queued run is blocked before paid
  work unless the remaining daily gate can reserve its full per-run gate;
- queued runs can be cancelled, terminal runs archived/restored, and only
  evidence-free archived envelopes can be purged after exact trace confirmation;
- unapproved output purge removes dependent revisions, research, evidence, and
  evaluation atomically while retaining a cancelled run envelope; approved
  output and receipt history remains non-purgeable;
- an approved revision is server-locked against editing or archival while it
  awaits execution, and every execution claim or replay requires the output to
  remain active;
- a paired runner can open a detected browser in the same app-owned user scope
  used by publication, constrained to the exact HTTPS origin for manual login;
  the app records only that the profile was opened and never claims login proof.

The V1 destination lifecycle remains the profile aggregate: each profile owns
one exact feed URL and enforced origin, and profile create/edit/archive/restore/
purge therefore owns that setting atomically. No speculative parallel
destination table was added.

## Validation evidence

- deterministic package tests cover origin-constrained profile authorization
  and truthful `loginVerified: false` state;
- Convex tests cover user-scoped run cancellation/lifecycle/purge and
  pre-provider daily-token blocking;
- the production dependency audit found vulnerable Auth.js 0.41.1, which was
  upgraded to patched 0.41.3 before release validation;
- 74 deterministic package tests and 14 Convex integration tests passed;
- `pnpm install --frozen-lockfile`, `pnpm verify:governance`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`,
  `pnpm audit --prod --audit-level high`, tracked-secret scanning, and
  `git diff --check` passed;
- the browser gate exercised the intentional fail-closed configuration surface;
  authenticated core-workbench visual QA remains an owner/deployment gate.

## Unverified and disabled

- no provider search or computer call was made for this slice;
- no real browser login was asserted or inspected;
- no Convex cron, function, or web application was deployed;
- no social post, external write, or production surface was exercised.
