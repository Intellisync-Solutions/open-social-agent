# Local Runner Invariants

The runner is a local authority boundary. It holds provider secrets and later
executes model and browser work; the web app and model cannot expand its scope.

- Bind only to the literal IPv4 loopback address `127.0.0.1`.
- Require the exact configured web origin and `x-osa-request` on every write.
- Pair with a one-use, expiring code; issue bounded HttpOnly session cookies.
- Never return, log, trace, persist in Convex, or place provider secrets in errors.
- Prefer the OS keychain. Encrypted-file fallback requires a 32-byte operator key,
  AES-256-GCM authenticated encryption, atomic writes, and mode `0600`.
- Treat alternate provider URLs as SSRF inputs: HTTPS only, no credentials,
  no query/fragment, public DNS results only, pinned lookup, no redirects,
  timeouts, and bounded response bodies.
- Browser detection returns allowlisted kind/label only. Executable paths stay local.
- Every externally visible action remains out of scope until an exact current
  approval is validated by the publication corridor.

Validate with `pnpm --filter @open-social-agent/runner test` plus root lint,
typecheck, build, and browser gates.
