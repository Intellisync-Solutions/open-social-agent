# Contributing

Thank you for helping build Open Social Agent.

## Architecture authority

Architecture version 0.1 is approved. Changes to a boundary recorded in
`BUILD_INIT.md`, `SECURITY.md`, or an accepted ADR require owner review before
implementation.

## Working agreement

- Start from `AGENTS.md` and the canonical documents it names.
- Open a focused issue or discussion for architectural changes.
- Keep changes small, tested, and documented.
- Add one `docs/history/` entry for each completed slice.
- Never include secrets, browser profiles, social cookies, personal data, or
  real-account screenshots.
- Default all browser and provider tests to mocks or controlled dry-run targets.
- Do not weaken approval, domain, prompt-injection, or verification gates.

## Commit shape

Use an imperative subject and explain the product outcome. A completed slice
must state its validation and remaining gates in the matching history record.
