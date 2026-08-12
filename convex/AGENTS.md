# Convex Data-Plane Invariants

Convex owns durable application state, never local provider secrets or browser
profiles.

- Derive `userId` from Convex Auth and check ownership on every public function.
- Use runtime validators and shared Zod policy validation for all user input.
- Use indexed, bounded reads; never scan growing tables.
- Store immutable configuration snapshots on runs. Later policy edits must not
  rewrite historical run inputs.
- Derive occurrence idempotency from schedule, scheduled time, and revision.
- Archive before purge. Refuse purges that would break schedule or run history.
- Keep provider, browser, and publication calls outside queries and mutations.
- Internal due-run creation may enqueue deterministic work only. It cannot run a
  model or perform an external write.

Validate with root `pnpm typecheck` and `pnpm test`; the latter includes local
Convex integration tests. A generated binding or typecheck is not deployment
proof.
