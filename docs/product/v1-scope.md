# V1 Product Scope

Status: approved for architecture version 0.1 on 2026-08-10.

## Acceptance criteria

V1 is complete when one self-hosted operator can:

- create an account and resume or restart onboarding;
- enter an OpenAI key without sending it to Convex or exposing it to the client
  bundle, logs, repository, or model context;
- configure a generic Responses-compatible provider and see a truthful
  capability test;
- select a detected supported browser and authorize an isolated profile;
- create, edit, archive, restore, and purge an exact destination/feed setting;
- configure topics, allowed research tools/domains, citation rules, persona,
  tone, style, structure, exclusions, and freshness;
- choose a versioned Economy, Balanced, or Quality preset or valid advanced
  model/reasoning/output gates;
- create, pause, edit, resume, run now, archive, restore, and purge a daily,
  weekly, or validated advanced schedule;
- let a due run create a bounded research record and structured model output;
- view sources, assumptions, tool use, requested/actual model, token usage,
  latency, evaluation, and duplicate result;
- edit a draft through immutable revisions and retain the original model output;
- approve or reject the exact revision and destination at posting time;
- have the selected browser prepare and submit only the approved content;
- receive a direct-detail `live`, `pending`, `blocked`, or `failed` receipt;
- create/read/update/archive/restore/purge drafts and run history within the
  documented audit-retention boundary;
- use the core UI by keyboard at 390px width and on a desktop viewport;
- pass governance, lint, typecheck, deterministic tests, build, and controlled
  browser dry-run gates.

## Explicit non-goals

- unattended social posting
- engagement/reply automation
- team workspaces or role hierarchies
- platform-private API integrations
- media generation
- analytics aggregation
- mobile apps
- hosted browser farms
- generalized autonomous browsing

## Release proof

A real-account release test requires explicit owner authorization and must name
the exact destination. Completion requires direct post-detail evidence. If a
CAPTCHA, account/security challenge, prompt injection, moderation barrier,
browser failure, or inaccessible verification surface appears, the result is
`blocked` or `pending`; the gate is never bypassed.
