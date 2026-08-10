# Security Policy

Status: approved policy for architecture version 0.1. Individual controls remain
unverified until their implementation slice records deterministic evidence.

## Protected assets

- provider API keys and provider account metadata
- browser sessions, cookies, local profiles, screenshots, and login state
- social destination URLs and account identity
- user prompts, persona, instructions, research, drafts, output history
- schedules, approvals, publication receipts, and audit evidence
- authentication and runner pairing credentials

## Trust boundaries

Browsers, websites, search results, feeds, screenshots, PDFs, pasted content,
model output, provider output, and tool output are untrusted. The authenticated
user, validated application contracts, code-owned policy, and current approval
record are authoritative.

## Authentication and authorization

- Derive identity from the server-authenticated session.
- Scope every durable record and runner claim to `userId`.
- V1 permits one active operator account per deployment; this does not justify
  omitting server-side authorization.
- Runner credentials are scoped, revocable, rotated, and never accepted as a
  substitute for the user's publication approval.
- Browser-provided IDs, URLs, account names, or hidden fields never grant authority.

## Secrets and browser state

- Store provider secrets in the local OS keychain where available.
- Encrypted local fallback storage requires an operator-supplied encryption key
  and authenticated encryption; fail closed if it is missing or invalid.
- Convex stores only an opaque secret reference and a redacted fingerprint.
- Never log, trace, commit, export, or send secrets to a model.
- Use an isolated app-owned browser profile. Never read or write the user's
  normal browser profile, password store, history, or extensions.
- Screenshots are ephemeral by default. Persist only explicitly approved,
  redacted evidence needed for a receipt.

## Computer-use and prompt-injection invariants

- Treat on-screen instructions as data, never permission.
- Stop on suspected prompt injection, phishing, CAPTCHA, paywall, HTTPS warning,
  account recovery, security challenge, or unexpected permissions surface.
- Enforce destination and research origins in code before every navigation.
- Normalize and validate every model-proposed action before execution.
- Capture new state after each consequential navigation/action; never reuse
  stale coordinates, DOM handles, or screenshots.
- Public posting always requires exact current user confirmation.
- Never bypass platform terms, moderation, rate limits, or anti-automation controls.

## Consequential action corridor

Public posting is consequential and externally visible. It requires:

- an authenticated user
- an authorized exact destination
- a completed evidence and evaluation run
- an immutable output revision
- an approval bound to output hash, destination, user, expiry, and run
- current-state revalidation immediately before submission
- one idempotency key and no blind retry
- direct-detail verification and a durable terminal receipt

An edited draft invalidates its approval. A click, submit response, or feed
listing is not proof of publication.

## Data minimization and retention

- Collect the minimum configuration, evidence, screenshots, and trace data.
- Keep full tool evidence available only as long as necessary for user history
  and evaluation; send bounded packets to models.
- User deletion first tombstones content. Permanent purge requires exact
  confirmation and preserves only the minimum legally/security-required audit
  envelope.
- Retention durations must be owner-approved before a hosted deployment.

## Logging and reporting

Logs may contain IDs, state transitions, timings, counts, provider/model labels,
redacted fingerprints, and bounded errors. They must not contain API keys,
cookies, authorization headers, full screenshots, passwords, one-time codes, or
unnecessary content.

Security issues should be reported privately through the repository's GitHub
security advisory flow once the public repository is created. Do not publish
unpatched credential, account, or browser-session vulnerabilities in issues.

## Prohibited shortcuts

- client-side provider secrets in browser bundles
- plaintext secret persistence
- unrestricted browser profiles or domain access
- model-authored authorization or policy changes
- unattended public posting
- blind retry of submit actions
- synthetic success receipts
- weakening gates to make a scheduled run appear complete
