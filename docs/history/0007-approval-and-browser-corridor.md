# Slice 0007 — Approval and browser corridor

Date: 2026-08-12

State: local implementation and controlled-browser validation complete; branch
and pull-request evidence pending

## Outcome

Implemented the durable consequential-action corridor without connecting a real
social account: exact approval decisions, stale-edit invalidation, executable
approval revalidation, isolated app-owned profile paths, HTTPS destination and
path enforcement, exact-body action validation, direct-detail receipt states,
and internal-only terminal receipt persistence.

## Integrity properties

- approval binds user, run, output, current revision, body hash, exact configured
  destination, decision, and at most fifteen-minute expiry;
- any edit advances the output revision and makes an older approval stale;
- each run receives one terminal approval decision;
- executable approval queries revalidate expiry, current revision, and hash;
- browser profile paths are rooted under the app data directory and reject
  unbounded identifiers/path traversal;
- production navigation requires HTTPS, exact origin, and the authorized path
  subtree;
- a type action may contain only the approved body;
- `live` requires a distinct direct-detail URL under the authorized path plus
  rendered approved-body evidence; feed-only evidence is `pending`;
- publication receipt creation is internal-only, revalidates the approval and
  current output revision, and cannot be called directly by a browser client;
- outputs with durable approval evidence cannot be permanently purged;
- no browser execution is automatically retried.

## Validation evidence

- deterministic browser tests cover isolated paths, cross-origin/path rejection,
  content mismatch, direct-detail live evidence, and feed-only pending evidence;
- 54 package tests and seven Convex integration tests pass, including stale-edit
  rejection and internal exact-receipt persistence;
- governance, lint, typecheck, production build, and the fail-closed Playwright
  browser check pass;
- controlled Playwright dry run passed in a new temporary Chrome-for-Testing
  profile against a loopback fixture, produced a distinct direct-detail URL,
  matched the exact approved body, and performed no external write;
- the dry-run helper is the only place loopback HTTP is permitted; production
  navigation remains HTTPS-only.
- Convex bindings were regenerated against the configured development target;
  no production deployment or production verification was performed.

## Unverified and disabled

- no user Brave/Chrome/Edge/Chromium profile was opened;
- no social login, destination, composer, post, or platform verification was
  accessed;
- OpenAI computer tool, pending safety checks, action loop, runner claim,
  automatic cron, web research, publication, deployment, and live social proof
  remain unverified.
