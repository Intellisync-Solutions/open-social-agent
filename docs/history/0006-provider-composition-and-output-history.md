# Slice 0006 — Provider composition and output history

Date: 2026-08-12

State: local implementation and guarded provider verification complete; branch
and pull-request evidence pending

## Outcome

Implemented the first paid-but-nonconsequential provider path: a centralized
OpenAI preset registry, strict Responses structured composition behind an
operator opt-in, local provider-key containment, bounded composition policy,
immutable original output persistence, user revisions, usage and latency
capture, and archive/restore/exact-confirmation purge.

## Integrity properties

- model IDs live in one shared registry: Luna, Terra, and Sol;
- all three IDs were present in the authenticated Models API list on 2026-08-12;
- the runner starts with generation disabled; `OSA_ENABLE_GENERATION=1` is
  required to enable the composition route;
- generation requires a paired runner session, exact origin, execution-purpose
  header, rate limit, schema-valid snapshot, evidence policy, and local key;
- the provider request uses `store: false`, bounded output tokens, configured
  reasoning, and a strict structural JSON schema;
- the full Zod schema validates the returned object after provider generation;
- the provider key never enters the request body, response, Convex, model
  context, or logs;
- output persistence is idempotent per run, stores the original before edits,
  and moves the run only to `awaiting_approval`;
- edits create immutable revisions; they do not overwrite the model original;
- generation creates no approval and confers no browser or publication
  authority.

## Validation evidence

- root lint, strict typecheck, and deterministic tests passed during the slice;
- 48 package tests plus five Convex integration tests passed;
- provider adapter test verifies model, reasoning, output budget, `store: false`,
  structural schema subset, parsing, and usage capture;
- runner tests verify default-disabled generation and local-key containment;
- Convex integration test verifies immutable original plus user revision;
- guarded live Luna request passed with 224 input tokens, 104 output tokens,
  328 total tokens, search disabled, and zero external writes;
- the initial live schema attempt failed safely with `invalid_json_schema`; the
  adapter now strips unsupported validation keywords for the provider while
  preserving full local Zod validation.

## Unverified and disabled

- Terra and Sol generation;
- web search, citation extraction, alternate-provider composition, runner
  claiming, automatic cron, evaluation, approval, browser profiles, computer
  use, destination navigation, publication, deployment, or live social proof.
