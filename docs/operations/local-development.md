# Local Development

Status: current through V1 acceptance closure.

## Install and validate

```bash
pnpm install --frozen-lockfile
pnpm verify:governance
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

## Convex and web

Copy `.env.example` to ignored `.env.local` files and configure a development
Convex deployment. Start Convex with `pnpm exec convex dev` and the web app with
`pnpm dev`. Development readiness is not deployment or production proof.

## Local runner

Start the runner in a separate terminal:

```bash
OSA_WEB_ORIGIN=http://localhost:3000 pnpm start:runner
```

The runner binds only to `127.0.0.1:43117` and prints a one-use six-digit code
valid for ten minutes. Sign in to the web app, open **Provider & runner
settings**, check the connection, and enter that code.

Provider keys go directly from that form to the loopback runner and into the OS
keychain. They do not pass through Convex. If the OS keychain is unavailable,
the operator may explicitly select the encrypted-file fallback:

```bash
OSA_SECRET_STORE=encrypted-file \
LOCAL_SECRET_ENCRYPTION_KEY='<base64-encoded 32 bytes>' \
pnpm start:runner
```

The read-only provider check calls `GET /v1/models`. It proves reachability and
authentication only. Responses, structured output, web search, computer use,
and usage telemetry remain `unverified` until a guarded test exercises them.

Maintainers may verify an already-exported OpenAI key without storing it in the
runner. This is an external read-only request and must be explicitly enabled:

```bash
RUN_LIVE_PROVIDER_TEST=1 pnpm --filter @open-social-agent/runner verify:provider
```

The command never performs generation and reports only the visible model count.

Paid composition remains disabled at runner startup. The operator may opt in for
a controlled run:

```bash
OSA_ENABLE_GENERATION=1 pnpm start:runner
```

Maintainers may run the minimal structured-output verification only with an
already-exported key and an explicit paid-test flag:

```bash
RUN_LIVE_GENERATION_TEST=1 pnpm --filter @open-social-agent/providers verify:live
```

This sends no search tool, opens no browser, uses no social destination, and
performs no external write. It reports model IDs, token counts, and output size,
never the generated body or key.

## Controlled browser dry run

The browser package has an opt-in proof that launches a fresh, app-owned
Playwright profile against a loopback-only social fixture. It fills the exact
approved body, clicks the fixture's publish control, reopens the synthetic post
detail page, and reports its verification state. It never uses a user browser
profile, authenticated social session, or external destination.

```bash
RUN_BROWSER_DRY_RUN=1 \
OSA_TEST_BROWSER_EXECUTABLE='/absolute/path/to/a/Playwright-compatible/browser' \
pnpm --filter @open-social-agent/browser verify:dry-run
```

The executable path is intentionally required rather than guessed for this
test. A passing `externalWrite: false` result is controlled development
evidence only; it is not social publication or production proof.

## Controlled computer-loop dry run

The runner also has an opt-in proof for the complete Responses computer-call
protocol using a synthetic in-process provider client. The client returns a
screenshot-first turn, a bounded action batch, and completion. The production
loop code executes those actions in a fresh app-owned profile and returns fresh
screenshots between turns, but makes no provider network call.

```bash
RUN_COMPUTER_LOOP_DRY_RUN=1 \
OSA_TEST_BROWSER_EXECUTABLE='/absolute/path/to/a/Playwright-compatible/browser' \
pnpm --filter @open-social-agent/runner verify:computer-loop
```

Expected evidence includes `directDetail: true`, `isolatedProfile: true`,
`providerNetworkCall: false`, and `externalWrite: false`. Any provider
`pending_safety_checks` value blocks before execution and is never automatically
acknowledged.

## Runner device and consequential processing

An authenticated operator provisions a runner registration through Convex. The
one-time raw token must be sent immediately to the paired loopback runner's
`POST /v1/runner-device` settings route; Convex retains only its SHA-256 digest.
The runner stores the token in the same local secret boundary as provider keys.
Revoking the durable registration invalidates subsequent claims.

Approved-run processing remains independently disabled at startup. A maintainer
may opt in only after a runner device, OpenAI key, isolated browser login, and
exact current approval are all present:

```bash
OSA_ENABLE_COMPUTER=1 pnpm start:runner
```

The paired UI must then make an explicit `POST /v1/process-approved` request
with an idempotency ID and browser kind. This endpoint processes at most one
claim; it is not a polling loop, cron activation, or permission to post to an
unspecified account.

The same paired runner exposes `POST /v1/process-harness` for one explicit
queued-run claim. The server supplies the immutable configuration snapshot and
recent user history. When research is enabled, OpenAI `web_search` is required,
restricted to configured domains, and stored with bounded evidence metadata.
Unknown citations, known-stale evidence, exclusions, token-gate overruns, and
likely duplicates block the run before approval. Unavailable publication dates
remain a visible freshness warning. This endpoint is also disabled unless
`OSA_ENABLE_GENERATION=1`.

After runner registration, the settings surface can open a detected browser in
the app-owned profile used by publication. The operator supplies the exact
HTTPS destination and completes login manually. Top-level navigation is
restricted to that origin. The returned state is `opened` with
`loginVerified: false`; neither profile creation nor navigation proves a valid
account session.

The configured daily token gate uses UTC calendar days. Before a paid claim,
the data plane sums recorded composition and research usage and requires enough
remaining budget for the full configured per-run gate. An insufficient or
unbounded usage scan blocks the run before provider access.

Terminal run history can be archived and restored. Permanent purge requires
the displayed trace prefix and succeeds only for evidence-free run envelopes;
any output, research/tool evidence, evaluation, approval, claim, or publication
receipt is retained.

To process queued preparation runs in the local runner without an open web
session, explicitly enable bounded polling:

```bash
OSA_ENABLE_GENERATION=1 OSA_ENABLE_POLLING=1 pnpm start:runner
```

The default interval is 60 seconds and the minimum is 15 seconds. Each tick
claims at most one queued generation run and overlapping ticks are suppressed.
It never claims or executes approved publication work. Convex reconciles due
schedules once per minute and, after downtime, queues only the latest due
preparation while recording how many stale occurrences were skipped.

Do not put provider keys in environment examples, command history, logs, issue
reports, screenshots, or Convex.
