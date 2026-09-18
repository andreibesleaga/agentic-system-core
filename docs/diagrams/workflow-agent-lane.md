# Workflow — the agent lane and the live board's two lanes (rc.4, AGSC-08-28…30, AGSC-10-16…18)

**What this shows.** The two lanes of the live board: a fast lane where a declared agent may act without a fresh human decision, and a slow lane where people decide. The caps, lints and budget checks that gate the fast lane are drawn on it, and the fast lane can never reach the slow one.

```mermaid
flowchart TD
  subgraph FAST["fast lane — no fresh human decision (System 1)"]
    A["agents[] entry enabled\n(kind, model, tasks, types, channel, budget,\nmax_new_items, max_claims)"]
    R["refresh --agent <name>\nor a declared tool-server / page-tools client"]
    P["Proposal through the channel\nprov: ai-generated, agent, model, operator\n+ one episode with usage"]
    G{"AGSC-08-28 c: declared types and tasks, ≤ max_new_items?\nAGSC-10-17: ≤ max_claims held?\nAGSC-08-28 e: lane and node budget left?"}
    L["lints at error severity\n(injection, secrets, PII, clean-room)"]
    M["auto-merge under AGSC-08-26\nChannel-Auto trailer → ledger mode: auto"]
    B["build: boards/<cluster>.json\nclaimed_by, done (derived)"]
    A --> R --> P --> G
    G -- "no" --> X["AGSC-E509 / AGSC-E511 rejected · AGSC-E510 skipped"]
    G -- "yes" --> L --> M --> B
    B -- "board not done, task claimable" --> R
  end
  subgraph SLOW["slow lane — a person decides (System 2)"]
    H["gates · human review · decisions · releases\nprocedures · gates · clusters · configuration · workflows · schemas"]
  end
  M -. "never reaches" .-> H
  H -- "publish: auto, once, revocable" --> A
```

The fast lane runs until the board is done or a task needs a person (`TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED`); the slow lane is unreachable from it by construction (AGSC-08-26(b), AGSC-08-28(c), AGSC-10-18). The dashed edge is the only link between the two: the human's one configured, revocable `publish: auto` choice (AGSC-08-29).

Trace: PRD-063, PRD-064, PRD-065 · D87, D88 · spec/08 §8.6, spec/10 §10.6, spec/01 AGSC-01-36…38.
