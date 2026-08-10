# System Visuals

These diagrams describe the proposed architecture, not implemented behavior.

## System boundary

```mermaid
flowchart LR
  U["Authenticated operator"] --> W["Next.js web app"]
  W --> C["Convex data and schedule plane"]
  C --> R["Local runner"]
  R --> P["Configured model provider"]
  R --> B["Isolated selected browser"]
  B --> S["Authorized social destination"]
  P --> R
  R --> C
  C --> W
  K["OS keychain or encrypted local store"] --> R

  classDef secret fill:#3b1d2a,color:#fff,stroke:#e08da6;
  class K secret;
```

Provider secrets and browser state remain local. Convex receives metadata,
configuration, evidence, outputs, approvals, receipts, and audit—not plaintext
keys or cookies.

## Agent harness

```mermaid
flowchart TD
  I["Validated run intake"] --> A["Authorization and policy snapshot"]
  A --> G["Budget and capability gates"]
  G --> Q["Allowed research"]
  Q --> E["Bounded evidence packet"]
  E --> M["Structured model composition"]
  M --> V["Deterministic evaluation"]
  V -->|"insufficient"| X["Blocked or clarification"]
  V -->|"passes"| H["Awaiting exact user approval"]
  H -->|"rejected or edited"| J["Rejected or new revision"]
  H -->|"approved"| B["Computer-use browser loop"]
  B --> D["Direct-detail verification"]
  D --> T["Terminal receipt"]
```

## Publication state sequence

```mermaid
sequenceDiagram
  participant Scheduler
  participant Convex
  participant Runner
  participant User
  participant Browser

  Scheduler->>Convex: Create idempotent queued run
  Runner->>Convex: Claim with scoped runner identity
  Runner->>Runner: Research, compose, evaluate
  Runner->>Convex: Persist output and awaiting_approval
  Convex-->>User: Show exact output and destination
  User->>Convex: Approve exact output hash
  Runner->>Convex: Revalidate approval and claim execution
  Runner->>Browser: Navigate and prepare post
  Browser-->>Runner: Current screenshot/state
  Runner->>Browser: Submit approved content
  Runner->>Browser: Open direct detail surface
  Runner->>Convex: Store live/pending/blocked receipt
```
