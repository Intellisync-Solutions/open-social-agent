---
title: Open Social Agent Architecture
architecture_status: approved
implementation_status: partial
version: 0.1
owner: IntelliSync
last_reviewed: 2026-08-10
canonical_for: product architecture
supersedes: null
---

# Open Social Agent Architecture

## Approval status

The owner approved architecture version 0.1, the
`Intellisync-Solutions/open-social-agent` repository identity, Apache-2.0, and
the one-operator self-hosted/approval-at-post-time V1 boundary on 2026-08-10.
Implementation may proceed in documented, validated slices.

## 1. Product problem, users, and workflows

Independent operators and small teams want a repeatable social publishing
workflow without handing a platform a permanent social-network API token or
accepting untraceable autonomous posting. They need to configure their own
provider, browser, destination/feed URL, research sources, writing voice, model
budget, and schedule while retaining control of every public action.

V1 serves one authenticated operator per self-hosted deployment. The operator:

1. completes a resumable onboarding stepper;
2. stores a provider secret locally and verifies provider capabilities;
3. selects an installed browser and authorizes an isolated app-owned profile;
4. registers one or more exact destination/feed URLs and allowed domains;
5. defines topics, research tools, citation rules, tone, style, persona, and
   structure;
6. selects a model preset, reasoning effort, and token/spend gates;
7. creates a daily, weekly, or validated advanced schedule;
8. receives a researched and evaluated draft at run time;
9. reviews the exact draft and destination, then approves or rejects it;
10. sees direct-detail publication verification and a durable receipt;
11. creates, reads, updates, archives, restores, and explicitly purges their
    schedules, profiles, drafts, outputs, and run history.

The schedule automates preparation. It does not silently publish. Current
OpenAI computer-use guidance requires confirmation at the point where the agent
would send, post, submit, or represent the user to a third party.

## 2. V1 scope and state

### Approved architecture

- Local-first pnpm/Turborepo application
- Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, Zod
- Convex for authenticated durable data, schedules, runs, history, approvals,
  receipts, and audit
- A local Node.js runner using Playwright and the OpenAI Responses `computer`
  tool against an isolated, per-app browser profile
- OpenAI Responses web search as the default research tool when enabled
- Central, capability-aware model/provider policy
- OpenAI and a generic Responses-compatible provider adapter in V1
- One self-hosted operator per deployment; every row still carries `userId`
- English UI in V1, with contracts structured for later localization
- Apache-2.0 as the recommended open-source license

### Currently implemented

- Governed pnpm/Turborepo workspace with deterministic governance validation
- Next.js application shell with fail-closed Convex configuration
- Convex Auth email/password boundary and protected onboarding route
- Auth-scoped, resumable onboarding draft persistence
- Shared Zod onboarding contracts that exclude provider secrets
- Responsive eight-step onboarding interface through configuration review
- Loopback-only local runner with one-use pairing and bounded sessions
- OS-keyring provider secret storage with authenticated-encryption fallback
- Allowlisted browser detection and truthful read-only provider auth probe
- Auth-scoped automation profile and schedule persistence with archive/restore
  and exact-confirmation purge rules
- Timezone-aware recurrence, idempotent run creation, immutable configuration
  snapshots, and a deterministic zero-post harness plan
- Centralized OpenAI preset registry, opt-in local Responses composition,
  immutable original outputs, editable revisions, usage telemetry, and history
  archive/restore/purge
- Exact revision-and-destination approval records, stale-edit invalidation,
  isolated-profile/domain/action guards, and internal terminal receipt contracts
- Bounded OpenAI computer-call iteration with ordered action batches, fresh
  screenshots, blocked safety confirmations, and a controlled isolated-browser
  proof using a synthetic provider client
- Revocable runner registrations with hashed device credentials, authenticated
  HTTP claim/receipt bridge, atomic leased execution claims, and an independently
  gated local processing endpoint
- Leased queued-run harness claims, allowlisted OpenAI web search, deterministic
  citation/evidence/duplicate gates, and durable research/evaluation evidence

Automatic cron activation, OpenAI search/computer live-provider verification,
runner polling, and real-account publication verification remain planned.
OpenAI structured composition is
verified for Luna with search disabled; the computer loop is deterministic and
locally dry-run only.

### Deferred

- Hosted multi-tenant service and organization/team collaboration
- Fully unattended public posting
- Social-network private APIs or OAuth integrations
- Mobile-native apps and a packaged desktop shell
- Image/video generation and media editing
- Multiple parallel browser workers
- Cross-network analytics, engagement automation, inbox/reply automation
- Vector databases, GraphRAG, long-term semantic memory, or autonomous agents
- Bundled provider-specific adapters beyond OpenAI and Responses-compatible APIs

### Excluded

- CAPTCHA solving or bypassing paywalls, HTTPS warnings, platform safety gates,
  moderation, or anti-automation controls
- Using a user's normal browser profile or extracting its cookies/passwords
- Treating on-screen instructions as user authorization
- Posting without exact, current user approval
- Guessing publication success from a click, HTTP response, or feed listing
- Persisting plaintext provider keys or sending them to Convex/model context
- Scraping or activity that violates a destination's terms or robots policy

## 3. System boundary and high-level architecture

```text
Next.js web UI
  -> authentication and user scope
  -> Zod request validation
  -> application services
  -> Convex queries/mutations/actions
  -> durable configuration, schedules, run ledger, outputs, approvals, audit

Convex due-run scheduler
  -> creates idempotent queued run from immutable configuration snapshot
  -> local runner claims run for its user/deployment
  -> deterministic policy and context plan
  -> allowed research tool(s)
  -> bounded evidence packet
  -> model composition with structured output
  -> deterministic evaluation and duplicate checks
  -> awaiting_approval
  -> user approves exact output + destination
  -> OpenAI Responses computer loop in isolated selected browser
  -> direct destination-detail verification
  -> terminal publication receipt
```

The model receives configuration and evidence, not authority. Code owns the
provider registry, browser executable, domain allowlist, tool availability,
token gates, run transitions, approval requirements, and verification rules.

## 4. Deployment topology

V1 is self-hosted and local-first:

- `apps/web` runs on the operator's machine and serves the authenticated UI.
- `apps/runner` runs on the same machine, claims due work, calls providers, and
  launches the selected isolated browser profile.
- Convex provides the remote durable data plane and dynamic scheduling.
- Provider API calls originate from the local runner with the locally stored key.
- Browser login cookies and profile data never leave the local machine.

The operator's machine must be awake and the runner connected for research,
composition, or browser execution. Missed runs become `delayed` and are offered
for manual retry; they are not blindly replayed.

Production hosting of the UI without a trusted local runner is not V1-complete
because a hosted page cannot safely control a user-selected local browser.

## 5. Repository topology and dependency direction

```text
/
├── apps/
│   ├── web/                    # Next.js UI and server actions
│   └── runner/                 # local scheduler claimant and browser loop
├── packages/
│   ├── contracts/              # Zod schemas and versioned events
│   ├── harness/                # policy, planner, context, eval, receipts
│   ├── browser/                # profiles, actions, domain/verification gates
│   ├── providers/              # capability-aware provider adapters
│   ├── scheduling/             # recurrence parsing and next-run calculation
│   └── ui/                     # accessible design system
├── convex/                     # only durable application data boundary
├── docs/
├── AGENTS.md
├── BUILD_INIT.md
└── SECURITY.md
```

The dependency direction is UI/runner -> authentication -> validation ->
application/harness -> deterministic tools -> Convex/provider/browser. Thin
routes and visual components contain no scheduling, authorization, or posting
policy.

## 6. Data model and ownership

All durable records are scoped by authenticated `userId`. Proposed tables:

- `users` and `onboardingDrafts`
- `providerConfigs` containing metadata/capabilities and a local `secretRef`
  only; never the key
- `runnerRegistrations` with scoped, revocable device identity
- `browserProfiles` containing browser kind, label, authorization state, and a
  local profile reference only
- `destinations` containing exact feed URL, origin, allowed paths, status, and
  authorization evidence
- `contentProfiles` for topics, persona, tone, style, structure, constraints
- `researchPolicies` for enabled tools, domains, citation and freshness rules
- `modelPolicies` for route assignments, models, reasoning, output limits,
  per-run and daily gates
- `schedules` for recurrence, timezone, next due time, status, and revision
- `runs` and `runSteps` for immutable configuration snapshots and lifecycle
- `toolExecutions` for selected/skipped/called/completed/failed evidence
- `evidenceItems` for URL, title, publisher, retrieved time, excerpt hash,
  bounded content, and claims
- `outputs` and `outputRevisions` for original model result, user edits, and
  structured content
- `approvals` binding user, exact output hash, destination, expiry, decision,
  and actor
- `publicationReceipts` for attempted actions, direct verification, final URL,
  and terminal state
- `auditEvents` for security- and lifecycle-relevant events

User-facing delete first archives/tombstones a record. Restore is supported.
Permanent purge is a separate, exact-confirmation destructive action. Immutable
receipts retain only the minimum audit envelope required by policy.

## 7. Authentication, authorization, and secrets

- Convex Auth is the proposed identity seam for the local web application.
- V1 permits one active operator account per deployment. Server checks still
  derive identity from the authenticated session for every operation.
- Runner pairing uses a one-time code and yields a revocable, least-privilege
  device credential bound to one user and deployment.
- Provider keys are entered into the local settings surface and stored by the
  runner in the operating-system keychain when available. A fallback encrypted
  local store requires `LOCAL_SECRET_ENCRYPTION_KEY` and fails closed without it.
- Convex stores only opaque local secret references and redacted key fingerprints.
- Browser login happens manually in an isolated app-owned profile.
- The runner enforces exact destination origins and research-domain allowlists.

## 8. Agent harness and provider policy

The harness is a single governed execution spine:

1. **Intake** validates run, user, schedule, runner, destination, and immutable
   configuration revision.
2. **Policy** selects deterministic, research, composition, or computer routes
   from code-owned capability policy.
3. **Budget** calculates bounded context and maximum output before paid work.
4. **Research** calls only enabled tools and admits only permitted, fresh sources.
5. **Compose** requests a strict structured output containing body, source map,
   risk flags, and assumptions.
6. **Evaluate** checks schema, length, topic fit, source coverage, duplicate risk,
   prohibited claims, and action policy.
7. **Approval** binds the exact final output and destination; edits invalidate
   prior approval.
8. **Execute** uses the selected browser and the Responses `computer` tool. Each
   action batch is normalized, domain-checked, executed, and followed by a new
   screenshot.
9. **Verify** opens the direct post/detail surface and checks destination, body
   fingerprint, and platform state.
10. **Receipt** stores requested/actual provider/model, reasoning, tools, usage,
    latency, approval, outcome, and bounded errors.

### Default OpenAI presets

Presets are centralized, versioned, and displayed with their tradeoffs:

- Economy: GPT-5.6 Luna, low reasoning, compact output
- Balanced: GPT-5.6 Terra, medium reasoning, standard output
- Quality: GPT-5.6 Sol, high reasoning, long output

`xhigh` and `max` are advanced options and must show cost/latency warnings.
Current OpenAI guidance says GPT-5.6 supports `none`, `low`, `medium`, `high`,
`xhigh`, and `max`, with `medium` as the default. Actual supported values are
validated against provider capabilities rather than assumed for every model.

### Alternate providers

`ProviderAdapter` exposes typed capabilities such as `structuredOutput`,
`webSearch`, `computer`, `usage`, and `reasoningLevels`. The V1 registry includes:

- `openai`: native Responses API, web search, and computer use
- `responses-compatible`: configurable base URL, model ID, and declared
  capabilities verified by a non-mutating setup test

Research, composition, and computer routes may use different configured
providers. A run fails closed with `PROVIDER_CAPABILITY_UNAVAILABLE` if its
selected provider cannot satisfy the route. The UI never promises that an
arbitrary provider supports OpenAI computer-use semantics.

## 9. Onboarding and primary UI

The onboarding stepper has persistent progress and Save for later:

1. deployment and account
2. provider and local secret
3. model profile, reasoning level, output and daily gates
4. detected browser and isolated profile authorization
5. exact destination/feed URL and domain authorization
6. research tools, sources, freshness, and citation requirements
7. topics, persona, tone, style, structure, and exclusions
8. schedule, timezone, and missed-run behavior
9. dry-run review with no social submission

Primary routes are Dashboard, Runs, Drafts, Schedules, Destinations, Profiles,
Approvals, History, and Settings. Empty, loading, error, disconnected-runner,
permission, delayed-run, rejected, and blocked states are first-class.

## 10. Scheduling and state model

V1 supports daily and weekly builders plus an advanced validated five-field
cron expression with an IANA timezone. Scheduling code computes an idempotency
key from `scheduleId + scheduledFor + revision` and never creates two runs for
the same occurrence.

Run states are:

```text
scheduled -> queued -> claimed -> researching -> composing -> evaluating
-> awaiting_approval -> approved -> executing -> verifying
-> live | pending | blocked | failed | rejected | cancelled
```

Only valid adjacent transitions are accepted. Approval and execution are
separate mutations. Consequential execution is never retried automatically.

## 11. Grounding, history, and output integrity

- The model sees only the minimum configuration and evidence needed for the run.
- Claims requiring citations must reference admitted evidence IDs.
- Source URLs, titles, retrieval time, and content hashes remain attached.
- The final model output is persisted before user edits.
- Edits create revisions; they do not rewrite the model's original output.
- Approval binds an exact output revision hash.
- Duplicate detection compares recent outputs and destination history before
  opening a composer.
- Missing, conflicting, stale, or insufficient evidence returns a bounded
  clarification or blocked state, never confident filler.

## 12. Error handling and observability

Every error has a stable code, safe user message, retry classification, trace
ID, and bounded internal details. Initial codes include:

- `AUTH_REQUIRED`
- `RUNNER_DISCONNECTED`
- `PROVIDER_SECRET_UNAVAILABLE`
- `PROVIDER_CAPABILITY_UNAVAILABLE`
- `BUDGET_DENIED`
- `RESEARCH_SOURCE_BLOCKED`
- `GROUNDING_INSUFFICIENT`
- `PROMPT_INJECTION_SUSPECTED`
- `APPROVAL_REQUIRED`
- `APPROVAL_STALE`
- `BROWSER_UNAVAILABLE`
- `DOMAIN_NOT_ALLOWED`
- `PLATFORM_GATE_BLOCKED`
- `PUBLICATION_UNVERIFIED`

Run telemetry records environment, trace/run/step IDs, configuration revision,
selected/skipped/called tools, cache status, context budget, requested/actual
provider/model/reasoning, provider-reported token usage, stage latency, approval
state, retries, result, and bounded error code. Costs are computed only from a
versioned price table or reported as unavailable; actual usage is never replaced
by an unlabeled estimate.

## 13. Environment schema

Planned required variables:

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `AUTH_SECRET`
- `LOCAL_RUNNER_ORIGIN`
- `LOCAL_RUNNER_PAIRING_SECRET`
- `LOCAL_SECRET_ENCRYPTION_KEY` only when OS keychain storage is unavailable

Provider API keys are user settings stored locally, not environment variables
required by the repository. `.env.example` documents names and safe defaults
without secret values.

## 14. Validation and release strategy

Each implementation slice must be coherent, documented in `docs/history/`,
committed separately, and pushed only after review and deterministic validation.

Required gates after scaffold:

- governance metadata and link validation
- Zod contract and state-machine unit tests
- two-user authorization and secret-redaction tests
- recurrence/timezone/idempotency tests, including daylight-saving transitions
- provider capability and model-policy tests with mocked paid calls
- grounding, duplicate, stale-approval, injection, and tool-budget tests
- mocked browser action normalization and domain enforcement
- local real-browser dry run against a controlled test destination
- accessibility, responsive, empty, loading, error, and disconnected states
- lint, strict typecheck, deterministic tests, production build

No paid model, public post, deployment, or real-account browser test runs without
an explicit guarded flag and current user authorization. Local tests are not
production proof.

## 15. Architecture decisions and owner approval

Approved decisions are recorded in `docs/architecture/decisions/`:

- local-first web + runner boundary
- human approval at the point of public posting
- provider-capability registry and local-only secret storage

The approval is recorded in
`docs/history/0002-architecture-approval.md`. Future changes to the local-runner,
secret-storage, provider, publication-approval, tenancy, or deployment boundaries
require an architecture revision and owner review.
