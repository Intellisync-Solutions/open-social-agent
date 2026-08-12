# Slice 0004 — Local runner and provider secret boundary

Date: 2026-08-12

State: local implementation and validation complete; publication evidence is
appended after the branch and stacked pull request exist

## Outcome

Implemented the local machine authority boundary: a runner bound to IPv4
loopback, one-use pairing, an HttpOnly bounded session, OS-keyring secret CRUD,
authenticated-encryption fallback, allowlisted installed-browser detection, an
authenticated settings UI, and a non-generative provider authentication probe.

## Security properties

- runner host is the literal `127.0.0.1` and cannot be configured remotely;
- exact Origin and `x-osa-request` checks precede all state-changing requests;
- pairing codes expire after ten minutes, are rate-limited, hashed for
  comparison, and consumed after one use;
- runner sessions use signed HttpOnly SameSite=Strict cookies and expire after
  eight hours;
- provider keys never enter React state, Convex, browser storage, responses,
  logs, committed files, or model context;
- the primary store is the operating-system keyring; fallback uses AES-256-GCM,
  secret-reference AAD, atomic writes, and owner-only file permissions;
- alternate provider URLs require HTTPS, reject credentials/private literal
  addresses, resolve all DNS results before use, reject any private result, pin
  the selected public address, refuse redirects, time out, and cap responses;
- the provider probe uses a read-only model-list request and labels Responses,
  structured output, web search, computer use, and usage as `unverified`;
- browser detection returns only allowlisted kind and label; it does not open or
  inspect a browser profile.

## Validation evidence

- root `pnpm lint`: passed
- root `pnpm typecheck`: passed
- root `pnpm verify:governance`: passed
- root `pnpm lint`: passed
- root `pnpm typecheck`: passed
- root `pnpm test`: passed, 35 deterministic tests across five packages
- root `pnpm build`: passed, including Next.js production compilation
- root `pnpm test:browser`: passed, one fail-closed browser test
- encrypted fallback test: plaintext absent and mode `0600`
- runner tests: disallowed origin, missing CSRF header/session, one-use pairing,
  secret non-disclosure, probe truthfulness, and private base-URL rejection
- guarded live OpenAI authentication check: passed; 132 models visible through
  the same DNS-pinned `/v1/models` implementation and no generation requested
- manual process evidence: runner listened only on `127.0.0.1:43118` during an
  isolated fallback-store test and was then stopped

## Unverified

- no real provider key was written by the settings UI in this slice;
- no paid/generative provider request was made; Responses, reasoning,
  structured outputs, web search, computer use, and usage remain unverified;
- OS-keyring UI prompts and persisted key retrieval require owner review;
- authenticated visible settings-flow QA remains owner-review evidence;
- no browser profile, Convex production data, deployment, social destination, or
  public action was accessed.
