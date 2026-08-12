# Local Development

Status: current for scaffold and local-runner slices. Harness and browser-profile
authorization commands will be added only when those capabilities exist.

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

Do not put provider keys in environment examples, command history, logs, issue
reports, screenshots, or Convex.
