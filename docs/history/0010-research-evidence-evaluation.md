# Slice 0010 — Research, evidence, and deterministic evaluation

Date: 2026-08-12

State: local implementation and validation complete; branch and pull-request
evidence pending

## Outcome

Connected queued runs to a leased, authenticated local harness path. The runner
can perform required OpenAI Responses web search inside an exact domain
allowlist, compose only from admitted evidence IDs, and submit a bounded result.
Convex recomputes the deterministic evaluation before persisting any approvable
draft.

## Integrity properties

- the runner claims an immutable server snapshot and recent user-scoped output
  history; the browser cannot supply either authority input;
- research is disabled unless the operator enables generation and configures
  at least one syntactically valid domain;
- Responses uses `web_search`, `tool_choice: required`, `store: false`, a medium
  context, and `web_search_call.action.sources` inclusion;
- only cited URLs on allowed domains become evidence, with deterministic IDs,
  retrieval time, content hash, and explicit unknown publication time;
- model source maps cite evidence IDs, never arbitrary URLs;
- deterministic gates cover missing or unknown citations, known-stale evidence,
  exclusions, topic fit, token budget, and recent-output similarity; unavailable
  publication dates remain explicit freshness warnings;
- Convex independently recomputes the evaluation against the immutable snapshot
  and server history and rejects mismatches;
- tool execution, evidence, composition, evaluation, usage, and latency remain
  separate durable records;
- no failed or blocked evaluation enters `awaiting_approval`.

## Validation evidence

- 70 package tests and 8 Convex integration tests passed;
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm verify:governance`,
  `pnpm test:browser`, and `git diff --check` passed locally;
- one fail-closed Playwright browser test passed.

## Unverified and disabled

- no live web-search request or paid provider request was made in this slice;
- no background runner polling or cron activation is enabled;
- no browser login, social account, post, deployment, or production surface was
  exercised.
