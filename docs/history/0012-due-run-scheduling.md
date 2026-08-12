# Slice 0012 — Due-run scheduling and bounded polling

Date: 2026-08-12

State: local implementation and validation complete; branch and pull-request
evidence pending

## Outcome

Added the governed background preparation path. A Convex cron reconciles active
schedules once per minute, and an explicitly enabled local runner can claim and
process at most one queued generation run per bounded interval without a paired
browser session.

## Integrity properties

- the cron invokes the existing internal due-run mutation and never calls a
  model, browser, provider, or public destination;
- occurrence keys remain deterministic and idempotent;
- missed-run policy coalesces downtime into the latest due preparation rather
  than replaying stale content, and records the skipped occurrence count;
- local polling defaults off, requires generation to be enabled, has a
  15-second minimum interval, suppresses overlapping ticks, and processes at
  most one queued run per tick;
- polling uses the same authenticated leased claim, immutable configuration
  snapshot, evidence gates, durable output, and failure receipt path as the
  explicit UI action;
- polling never claims approved publication work; consequential browser
  execution still requires an explicit user action against a fresh approval;
- the runner settings surface reports actual generation, polling, and computer
  startup gates without implying readiness or live proof.

## Validation evidence

- deterministic scheduling tests cover DST, advanced cron, occurrence keys,
  and latest-due backlog coalescing;
- Convex tests cover idempotent enqueueing and stale-backlog coalescing;
- runner tests cover sessionless one-item polling with a synthetic provider and
  durable receipt submission;
- full repository gate results are recorded after final validation.

## Unverified and disabled

- no cron was deployed and no cloud schedule executed;
- no background poll made a network, paid-provider, or social-platform call;
- no live search, live computer use, browser login, social post, deployment, or
  production surface was exercised.
