# Slice 0008 — Bounded computer action loop

Date: 2026-08-12

State: local implementation and controlled-browser validation complete; branch
and pull-request evidence pending

## Outcome

Implemented the provider/browser action-loop seam without enabling a real
social write: the OpenAI Responses `computer` tool request, one-call-at-a-time
output parsing, ordered bounded action execution, fresh screenshot continuation,
usage aggregation, turn limits, and fail-closed provider safety checks.

## Integrity properties

- one computer call and at most 25 validated actions are accepted per turn;
- the loop permits at most 20 turns and defaults to 12;
- parallel tool calls and provider response storage are disabled;
- pending provider safety checks stop before any action and are not acknowledged;
- typed text must exactly equal the approved body;
- coordinates must be within the configured viewport;
- modifier-bearing pointer actions and unsupported mouse buttons fail closed;
- each action is followed by an authorized destination check;
- unauthorized top-level navigations are aborted before their request is sent;
- the initial request and each model turn receive a fresh full-page screenshot
  data URL using original image detail;
- provider response storage is disabled and every response item, including
  encrypted reasoning, is replayed in order for stateless continuation;
- the isolated browser receives an empty environment and disables extensions and
  file-system access;
- page content remains untrusted and cannot expand the destination or approval.

## Validation evidence

- governance, frozen install, lint, typecheck, production build, Playwright
  fail-closed check, diff check, and tracked-secret scan pass;
- 59 package tests and seven Convex integration tests pass;
- contract tests cover bounded action batches;
- provider tests cover continuation, ordered execution, accumulated usage,
  malformed batches, and pending safety-check blocking;
- browser tests cover viewport and modifier rejection;
- a controlled Chrome-for-Testing run completed three synthetic model turns and
  five actions in a fresh profile, reached a distinct loopback post-detail URL,
  made no provider network call, and performed no external write.

## Unverified and disabled

- no OpenAI computer request was sent;
- no user Brave/Chrome/Edge/Chromium profile or social account was opened;
- no runner endpoint accepts publication work yet;
- no trusted Convex runner claim or receipt callback is connected;
- no provider safety check was acknowledged;
- provider-backed search, automatic cron, publication, deployment, and live
  social proof remain unverified.

## Current official guidance applied

The implementation follows the current OpenAI computer-use loop: inspect one
`computer_call`, execute its ordered `actions`, return a fresh
`computer_call_output` screenshot, and repeat. The environment and confirmation
gates follow the same guide's isolation and human-in-the-loop guidance.

- <https://developers.openai.com/api/docs/guides/tools-computer-use>
