# Slice 0011 — Authenticated operator desk

Date: 2026-08-12

State: local implementation and validation complete; branch and pull-request
evidence pending

## Outcome

Connected the durable V1 seams to an authenticated editorial operations desk.
The operator can manage automation profiles and exact destinations, manage and
run schedules, inspect the run ledger, review evidence-backed drafts, create
immutable revisions, approve or reject one exact revision and destination, and
inspect terminal receipt history.

The local-runner settings surface now transfers a one-time trusted device token
directly to the paired loopback runner, lists and revokes durable registrations,
selects a detected browser, and explicitly processes at most one queued or
approved item. No polling or unattended publication was added.

## Integrity properties

- all workbench queries derive the authenticated user and compose only owned,
  bounded, indexed durable records;
- a tenant-isolation integration test covers dashboard, run, and draft views;
- draft review shows current body, revision, model, provider usage, evaluation,
  duplicate score, warnings, assumptions, risks, claim maps, and clickable
  admitted citations;
- approval requires a visible confirmation and binds the current body hash,
  revision, exact destination, and ten-minute expiry;
- destructive lifecycle operations preserve archive-before-purge and exact
  confirmation rules already enforced in Convex;
- failed trusted-runner token transfer attempts revoke the newly provisioned
  durable registration when rollback succeeds;
- provider keys remain direct-to-loopback fields and never enter Convex, React
  state, repository files, or model context;
- consequential processing remains independently disabled by runner startup
  gates and requires an explicit UI action for one item;
- the responsive shell includes keyboard focus visibility, a skip link, reduced
  motion behavior, semantic actions, and a 390-pixel layout.

## Validation evidence

- 70 package tests and 9 Convex integration tests passed;
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm verify:governance`, `pnpm test:browser`, and `git diff --check` passed
  locally;
- the production build emitted protected Dashboard, Runs, Drafts, Schedules,
  Profiles/Destinations, History, Onboarding, and Runner Settings routes;
- one fail-closed Playwright browser test passed.

## Unverified and disabled

- no paid model, live web-search, or live-provider computer request was made;
- no Convex deployment or migration was performed in this slice;
- no authenticated visual browser test was performed against a freshly deployed
  backend, so signed-in desktop/mobile appearance remains owner-review evidence;
- no background polling, browser login, social account, post, deployment, or
  production surface was exercised.
