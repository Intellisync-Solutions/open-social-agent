# Current Implemented Architecture

Last verified: 2026-08-12

## Current truth

The governed scaffold and local-runner slices are implemented: an authenticated
Next.js shell, shared onboarding contracts, auth-scoped resumable persistence,
and a loopback-only local secret and provider-authentication boundary.

`BUILD_INIT.md` has `architecture_status: approved` and
`implementation_status: partial`. Future contributors must not describe
provider-backed harness execution, automatic scheduling, isolated browser
execution, history, approval, or receipt layers as shipped.

## Implemented seams

- `apps/web`: authenticated landing surface and responsive eight-step onboarding
- `packages/contracts`: versioned onboarding schemas and destination-origin rule
- `convex`: Convex Auth tables plus one auth-scoped onboarding draft per user
- `scripts/verify-governance.mjs`: deterministic authority/status validation
- `apps/runner`: loopback-only pairing, secret CRUD, browser detection, and
  non-generative provider authentication probe
- `packages/secrets`: OS keyring plus explicit AES-256-GCM fallback
- `packages/browser`: allowlisted installed-browser detection
- `packages/scheduling`: validated daily, weekly, and five-field cron
  recurrence with IANA timezone and DST-aware next occurrences
- `packages/harness`: versioned run-state transitions and a zero-post budget/tool
  plan with no external writes
- `convex`: auth-scoped automation profile/schedule CRUD, idempotent manual and
  bounded internal due-run creation, and immutable configuration snapshots
- `packages/providers`: centralized OpenAI preset IDs and strict Responses
  structured-output adapter with provider storage disabled
- `apps/runner`: operator-opt-in composition route that reads the local key and
  returns only validated output and bounded usage/latency metadata
- `convex`: immutable model originals, user revisions, usage fields, archive,
  restore, and exact-confirmation output purge
- `convex`: one-time approval decisions binding current revision hash, exact
  destination, expiry, and run; stale edits fail closed
- `packages/browser`: isolated app-profile paths, HTTPS destination/path guards,
  exact approved-body typing, and direct-detail verification states
- `convex`: publication receipts are internal-only terminal evidence; clients
  cannot manufacture `live`
- `packages/providers`: bounded OpenAI computer-call loop with ordered actions,
  stateless screenshot continuation, complete response-item replay, usage
  aggregation, and fail-closed safety checks
- `packages/browser`: normalized computer actions executed in an isolated,
  environment-cleared browser with viewport, destination, and content guards
- `convex`: revocable runner registrations containing only token hashes, atomic
  idempotent approval claims, bounded leases, and claim-bound terminal receipts
- `apps/runner`: HTTPS-only Convex bridge, local-only raw device token storage,
  and explicitly gated one-run processing with direct-body verification
- `packages/providers`: Responses `web_search` adapter with required execution,
  exact domain filters, source/citation parsing, and deterministic evidence IDs
- `packages/harness`: evidence-packet admission plus deterministic citation,
  freshness, exclusion, topic, token-budget, and recent-output duplicate gates
- `convex`: leased queued-run harness claims and durable tool, evidence, and
  server-recomputed evaluation records; failed evaluations cannot reach approval

The web application fails closed when its Convex URL is absent or invalid. The
onboarding contract contains provider metadata and a redacted fingerprint field,
but no provider secret field or transport.

## Planned seams

- `apps/web`: settings, CRUD, run/approval/history UI beyond onboarding
- `apps/runner`: local due-run claimant and computer-use execution
- `packages/contracts`: versioned cross-boundary schemas
- `packages/harness`: provider-backed research, evidence admission, evaluation,
  approval, and receipts beyond the zero-post/composition guard
- `packages/browser`: installed-browser detection and isolated execution
- `packages/providers`: OpenAI and Responses-compatible adapters
- `packages/scheduling`: missed-run policy beyond implemented recurrence
- `packages/ui`: accessible shared interface components
- `convex`: authenticated durable data, scheduling, runs, receipts, audit

These paths must be created only as their approved slices are implemented.

## Evidence vocabulary

Use `local`, `tested`, `development`, `staging`, `deployed`, `live`, `pending`,
`rejected`, `blocked`, and `owner_review` precisely. A passing build, commit,
push, HTTP response, click, or feed listing is not proof of a public post.

## Canonical documents

- Approved architecture proposal: [`../../BUILD_INIT.md`](../../BUILD_INIT.md)
- Security: [`../../SECURITY.md`](../../SECURITY.md)
- V1 scope: [`../product/v1-scope.md`](../product/v1-scope.md)
- System visuals: [`system-visuals.md`](system-visuals.md)
- Decisions: [`decisions/`](decisions/)
- Slice history: [`../history/`](../history/)

## Next gate

The next slice is the authenticated V1 CRUD and review UI, followed by runner
polling. Automatic cron remains disabled until those end-to-end paths exist.
Luna structured output, synthetic-provider research, and the synthetic-provider
computer loop over a controlled browser are locally verified; Terra, Sol,
live search, alternate providers, live-provider computer use, and real social
accounts remain unverified.
