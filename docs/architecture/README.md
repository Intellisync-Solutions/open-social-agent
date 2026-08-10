# Current Implemented Architecture

Last verified: 2026-08-10

## Current truth

No product runtime is committed yet. The repository contains the approved
architecture package and implementation is underway in isolated local work.

`BUILD_INIT.md` has `architecture_status: approved` and
`implementation_status: not_started`. Future contributors must not describe the
proposed Next.js, Convex, provider, harness, runner, or browser layers as shipped.

## Proposed implementation seams

- `apps/web`: onboarding, settings, CRUD, run/approval/history UI
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

The first implementation slice is the governed application scaffold,
authentication boundary, and deterministic governance check—without provider
spend or social-browser execution.
