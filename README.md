# Open Social Agent

Open Social Agent is an open-source, local-first social media workflow
application. It is being delivered in evidence-backed slices and will research
within user-approved boundaries, compose in a
saved voice, prepare an exact destination in a user-selected isolated browser,
and pause for approval immediately before posting.

## Current status

**Architecture v0.1 approved — implementation is underway.**

Read:

- [`BUILD_INIT.md`](BUILD_INIT.md) for the proposed product architecture
- [`docs/product/v1-scope.md`](docs/product/v1-scope.md) for V1 acceptance
- [`SECURITY.md`](SECURITY.md) for safety and secret boundaries
- [`docs/architecture/README.md`](docs/architecture/README.md) for current truth

## V1 in one sentence

Configure provider + browser + destination + research + voice + budget +
schedule, receive an evidence-backed draft, approve the exact post, and retain a
complete editable history and verified publication receipt.

## Why approval remains human

Social posts represent a person or organization publicly. Current OpenAI
computer-use guidance says sending or posting on a user's behalf should be
confirmed at action time. The schedule prepares the work; it does not remove
the user's control of the public action.

## Implemented foundation

- governed pnpm/Turborepo workspace
- Next.js App Router UI with Convex Auth
- auth-scoped resumable eight-step onboarding
- shared Zod contracts with no provider-secret field
- deterministic governance, lint, type, test, build, and dry browser checks

Runner, provider execution, schedules, history, and posting remain incomplete.
See [`docs/architecture/README.md`](docs/architecture/README.md) for the exact
implemented/planned boundary.

## Approved stack

- Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, Zod
- Convex Auth and Convex durable data/scheduling
- OpenAI Responses API web search and computer use
- Playwright with isolated app-owned browser profiles
- pnpm and Turborepo

## License

Licensed under Apache-2.0. See [`LICENSE`](LICENSE).

## Contributing

Architecture and implementation contributions are welcome. Start from
[`AGENTS.md`](AGENTS.md), preserve the approval and publication gates, and see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
