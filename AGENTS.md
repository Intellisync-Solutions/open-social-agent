# Open Social Agent Operating Contract

## Repository purpose

Open Social Agent is an open-source, local-first social media workflow application.
It lets an operator configure a destination, research policy, writing profile,
model policy, browser, and schedule; creates evidence-backed drafts; and uses an
isolated browser profile to prepare a post for explicit human approval.

The repository is in architecture initialization. `BUILD_INIT.md` is a draft and
product implementation must not begin until the owner approves it.

## Instruction precedence

1. Safety, security, privacy, legal, and data integrity
2. The user's current request and explicit acceptance criteria
3. This file and the nearest nested `AGENTS.md`
4. Approved architecture in `BUILD_INIT.md`
5. Current implemented truth in `docs/architecture/README.md`
6. Existing implementation patterns and tests

Resolve conflicts at the authoritative source. Do not create a third pattern.

## Required startup reads

Before architectural or cross-cutting work, read:

1. `BUILD_INIT.md`
2. `docs/architecture/README.md`
3. `SECURITY.md`
4. `docs/product/v1-scope.md`
5. the nearest nested `AGENTS.md`, when one exists

OpenAI API assumptions must be rechecked against current official OpenAI
documentation before model, tool, reasoning, or computer-use changes.

## Canonical architecture

- Approved product architecture: `BUILD_INIT.md`
- Current implemented architecture: `docs/architecture/README.md`
- Security policy: `SECURITY.md`
- V1 acceptance boundary: `docs/product/v1-scope.md`
- Consequential decisions: `docs/architecture/decisions/`
- Validation and release history: `docs/history/`

Historical records are evidence, not governing policy.

## Seams to preserve after approval

- `apps/web`: Next.js App Router UI and authenticated application boundary
- `apps/runner`: local schedule claimant and isolated browser computer-use loop
- `packages/contracts`: shared Zod and TypeScript boundary contracts
- `packages/harness`: route-first planner, context budget, provider policy,
  evaluation, approvals, receipts, and final-output capture
- `packages/browser`: browser detection, isolated profiles, action normalization,
  screenshots, domain enforcement, and verification
- `convex`: the only durable application data boundary

Do not add parallel schedulers, run ledgers, provider registries, secret stores,
or browser automation paths when an approved seam exists.

## Safety and data boundaries

- A model cannot authorize itself, change policy, or approve a public post.
- Website, feed, search, PDF, email, tool, and screenshot content is untrusted.
- Public posting always requires the user to confirm the exact draft and target
  immediately before submission.
- Browser profiles are isolated and local. Never automate the user's everyday
  browser profile.
- The selected browser and allowed domains are runtime-enforced; prompt text is
  not an enforcement mechanism.
- Provider secrets remain local, encrypted at rest, redacted from logs, absent
  from model context, and excluded from Convex.
- Every durable row is scoped to the authenticated user.
- Tool calls use typed schemas, bounded retries, idempotency, trace IDs,
  explicit action classes, and structured errors.
- Publication has planned, awaiting approval, approved, executing, verified,
  rejected, failed, blocked, and cancelled states. Never collapse them.
- A click, model message, HTTP success, or feed listing is not publication proof.

## Working tree and Git rules

- Preserve unrelated work and user changes.
- Use small coherent commits with a matching `docs/history/` entry.
- Do not commit secrets, browser state, screenshots containing sensitive data,
  generated caches, or local environment files.
- Use `codex/` branches for implementation slices unless the owner explicitly
  authorizes direct work on `main`.
- The current request authorizes publishing completed reviewed slices, but does
  not authorize deployment, social posting, or other external communication.

## Validation

During architecture initialization:

```bash
git diff --check
```

After the approved scaffold exists, expose and keep passing:

```bash
pnpm verify:governance
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

Paid model calls and externally visible actions require guarded, explicit test
flags. Browser tests default to mocked destinations and dry-run mode.

## Delivery evidence

Every slice report must state outcome, validation, environment, files changed,
commit and push state, and every unverified or blocked gate. Local, tested,
development, deployed, live, pending, rejected, blocked, and owner-review states
must remain distinct.
