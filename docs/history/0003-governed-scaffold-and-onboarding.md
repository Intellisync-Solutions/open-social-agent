# Slice 0003 — Governed scaffold and onboarding boundary

Date: 2026-08-10

State: locally implemented and tested; development Convex functions ready;
branch not yet pushed at the time of this record

## Outcome

Established the first approved runtime slice: a pnpm/Turborepo workspace,
strict Next.js web application, Convex Auth boundary, auth-scoped resumable
onboarding record, shared Zod contracts, and an editorial operations interface.

## Safety properties

- invalid or absent Convex configuration fails closed without a placeholder URL;
- the onboarding contract has no API-key value field;
- every onboarding query/mutation derives the user from the authenticated session;
- destination input derives an HTTPS origin for later runtime enforcement;
- protected onboarding redirects an unauthenticated session;
- schedules, browser authorization, provider-secret setup, and posting remain
  visibly disabled or described as unimplemented;
- no model call, provider spend, browser profile access, or social write occurred.

## Validation evidence

- `pnpm verify:governance`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed, 6 deterministic tests
- `pnpm build`: passed, Next.js production build
- `pnpm exec convex dev --once`: passed against the linked development deployment
- live local browser at `http://localhost:3000`: unauthenticated landing rendered
- 390px browser viewport: responsive landing rendered without horizontal loss
- protected `/onboarding`: redirected to `/` while unauthenticated

The repository Playwright skill wrapper could not launch because the current
`@playwright/mcp` package did not expose its advertised `playwright-cli` binary.
The in-app browser was used for live local visual inspection. The repository's
own deterministic Playwright fail-closed test remains a separate validation gate.

## Unverified

- authenticated account creation, onboarding save/resume, and sign-out through
  the visible interface require a synthetic development account or owner-provided
  test identity and were not exercised in this slice;
- no staging, production deployment, public interface, provider call, local
  runner, isolated social browser, or public post was verified.
