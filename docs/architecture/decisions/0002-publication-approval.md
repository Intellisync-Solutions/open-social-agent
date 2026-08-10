# ADR 0002: Require approval at the point of public posting

- Status: accepted
- Date: 2026-08-10

## Context

Social posting represents the user to a third party and can create reputational,
legal, moderation, and account risk. Current OpenAI computer-use guidance lists
sending, posting, and submitting on a user's behalf among actions that should be
confirmed immediately before execution.

## Decision

Scheduled runs may research, compose, evaluate, and prepare an approval. They
must not submit a public post until the authenticated user approves the exact
output revision and destination. Approval is expiring and invalidated by edits.

## Consequences

- V1 is workflow automation, not unattended publication.
- Approval and execution are separate durable state transitions.
- A user can review the precise evidence, output, target, and risk before acting.
- Consequential submission is never retried blindly.

## Source

- [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
