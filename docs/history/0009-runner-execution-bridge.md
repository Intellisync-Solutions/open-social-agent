# Slice 0009 — Trusted runner execution bridge

Date: 2026-08-12

State: local implementation and validation complete; branch and pull-request
evidence pending

## Outcome

Connected the durable approval corridor to the local runner without enabling
automatic or unauthorized publication: authenticated operators can create and
revoke runner registrations, the raw device token crosses once into local
secret storage, and a runner can atomically claim one exact approved revision
through an authenticated HTTPS action.

## Integrity properties

- Convex stores only the SHA-256 device-token digest;
- the raw token is returned only by the explicit provisioning mutation and is
  stored by the paired loopback runner without being returned in its response;
- registrations are auth-scoped, bounded to ten per user, and revocable;
- the HTTP bridge requires a bearer token, hashes it server-side, and matches an
  active exact runner ID without redirects or caching;
- claim creation revalidates user, approval decision and expiry, current output
  revision and hash, destination, runner registration, and request ID;
- a run has at most one execution claim and moves atomically from `approved` to
  `executing`;
- claim retries with the same runner/request ID return the same active lease;
- leases last at most ten minutes and never outlive the approval;
- terminal receipts require the exact registration, claim, execution request,
  approval, run, destination, and body hash;
- terminal receipts persist requested and actual computer models, provider token
  usage, loop turns, and executed action counts; pre-provider failures are
  explicitly recorded with unavailable actual model and zero usage;
- expired or stale leases fail closed as blocked and are never blindly retried;
- the local processing endpoint is separately disabled unless
  `OSA_ENABLE_COMPUTER=1` and still requires an explicit paired request;
- `live` is proposed only after a distinct authorized direct URL contains the
  exact approved body.

## Validation evidence

- runner bridge tests cover HTTPS/token transport, bounded claim validation,
  empty-queue no-op, receipt validation, token containment, and disabled default;
- Convex integration covers registration, atomic claim, off-origin receipt
  rejection, successful terminal receipt, and post-approval purge refusal;
- generated Convex bindings include the new bridge modules.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm verify:governance`, `pnpm test:browser`, and `git diff --check` passed
  locally;
- deterministic tests: 66 package tests and 7 Convex integration tests passed.
- one Playwright fail-closed browser test passed against the local web surface.

## Unverified and disabled

- no real device was provisioned and no raw device token was created for an
  operator account;
- no live bridge request, OpenAI computer request, user browser, social account,
  post, or production deployment was exercised;
- runner polling, provider-backed research, automatic cron, and live social
  proof remain unverified.
