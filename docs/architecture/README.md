# Current Implemented Architecture

Last verified: 2026-08-10

## Current truth

The first product runtime slice is implemented on the `codex/v1-scaffold`
branch: a governed workspace, authenticated Next.js shell, shared onboarding
contracts, and auth-scoped resumable onboarding persistence.

`BUILD_INIT.md` has `architecture_status: approved` and
`implementation_status: partial`. Future contributors must not describe the
provider secret store, harness, runner, scheduling, browser execution, history,
approval, or receipt layers as shipped.

## Implemented seams

- `apps/web`: authenticated landing surface and responsive eight-step onboarding
- `packages/contracts`: versioned onboarding schemas and destination-origin rule
- `convex`: Convex Auth tables plus one auth-scoped onboarding draft per user
- `scripts/verify-governance.mjs`: deterministic authority/status validation

The web application fails closed when its Convex URL is absent or invalid. The
onboarding contract contains provider metadata and a redacted fingerprint field,
but no provider secret field or transport.

## Planned seams

- `apps/web`: settings, CRUD, run/approval/history UI beyond onboarding
- `apps/runner`: local due-run claimant and computer-use execution
- `packages/contracts`: versioned cross-boundary schemas
- `packages/harness`: policy, context, evidence, model, evaluation, approval
- `packages/browser`: installed-browser detection and isolated execution
- `packages/providers`: OpenAI and Responses-compatible adapters
- `packages/scheduling`: recurrence and idempotent due-run calculation
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

The next slice is the local runner pairing and encrypted provider-secret seam,
followed by truthful capability tests. It must not send a key to Convex, a model,
browser client code, or logs.
