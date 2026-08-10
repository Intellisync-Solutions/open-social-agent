# ADR 0003: Capability-based providers with local-only secrets

- Status: accepted
- Date: 2026-08-10

## Context

Users need to bring an OpenAI API key and configure alternate model providers.
Provider APIs differ in structured output, reasoning controls, web research,
computer use, and usage reporting. Treating a base URL as capability proof would
produce unsafe or misleading runs.

## Decision

Use a typed provider registry with independently declared and tested
capabilities for research, composition, computer use, structured output,
reasoning levels, and usage. Implement OpenAI and a generic
Responses-compatible adapter in V1. Keep provider secrets in the OS keychain or
an authenticated encrypted local fallback; Convex stores references only.

## Consequences

- Research, composition, and computer routes may use different providers.
- Unsupported configurations fail closed before paid work or browsing.
- New provider adapters can be added without changing the run state machine.
- A generic provider is not advertised as computer-capable until its setup test
  proves the required contract.

## Sources

- [OpenAI production API-key guidance](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys)
- [OpenAI model catalogue](https://developers.openai.com/api/docs/models)
