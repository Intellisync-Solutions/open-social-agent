# ADR 0001: Local-first web application with a local browser runner

- Status: proposed
- Date: 2026-08-10

## Context

The product must use a user-selected browser with a user-authorized social
session. A hosted web page cannot safely or reliably control an arbitrary local
browser, and a cloud browser would move account sessions away from the user.

## Decision

V1 is self-hosted. A Next.js application and local Node.js runner operate on the
user's machine. Convex is the durable data/schedule plane. The runner launches a
separate app-owned browser profile for the detected browser choice.

## Consequences

- Provider secrets, login cookies, and browser profiles remain local.
- The user's machine must be awake and the runner connected for due work.
- Hosted multi-user operation requires a later architecture revision.
- Browser choice is enforced by code and not merely placed in a prompt.
