# SDLC state machine — S00…S13 (Loki Mode)

Per `GABBE/agents/AGENTS.md` §"Loki & Brain": a 14-phase lifecycle — Day-0 bootstrap (S00), a 10-phase
core build loop (S01–S10), and Day-2 operations (S11–S13) — with human-in-the-loop gates at
**S00 / S01 / S02 / S07 / S08**. `docs/PRD.md` is itself titled "S01 requirements artifact" and
`docs/PLAN.md` "S02 artifact", grounding those two phase identities directly.

```mermaid
stateDiagram-v2
  [*] --> S00

  state "S00 · Strategy & Discovery (Day-0) [HITL GO/NO-GO]" as S00
  state "S01 · Requirements (PRD.md, EARS) [HITL GATE]" as S01
  state "S02 · Architecture (PLAN.md, arc42/C4) [HITL GATE]" as S02
  state "S03 · Tech Spec (SPEC.md, schemas, vectors)" as S03
  state "S04 · Task Decomposition (TASKS.md, 15-min atomic)" as S04
  state "S05 · Implementation (RARV per task)" as S05
  state "S06 · Testing & Quality (all gates PASS)" as S06
  state "S07 · Security Review [HITL GATE]" as S07
  state "S08 · Human Review (double verify) [HITL GATE]" as S08
  state "S09 · Staging (Pages preview + smoke)" as S09
  state "S10 · Production (live + healthy)" as S10
  state "S11 · Operate & Maintain (Day-2)" as S11
  state "S12 · Evolve & Improve (Day-2)" as S12
  state "S13 · Decommission & Sunset (Day-2)" as S13

  S00 --> S01: bootstrap complete
  S01 --> S02: PRD FROZEN (owner gate passed)
  S02 --> S03: PLAN FROZEN (owner gate passed)
  S03 --> S04
  S04 --> S05
  S05 --> S06
  S06 --> S07
  S07 --> S08: verify gate passed
  S08 --> S09: release gate passed
  S09 --> S10
  S10 --> S11: core build loop complete
  S11 --> S12
  S12 --> S13
  S13 --> [*]

  note right of S02
    CURRENT POSITION (GABBE/agents/memory/AUDIT_LOG.md,
    2026-09-02): S02 gate APPROVED, PLAN.md FROZEN as the
    S02 baseline. Session moved on to S03 (SPEC.md +
    this diagrams/BDD pack, run in parallel).
  end note
```

"continue" always re-enters at S00 and re-verifies passed gates against frozen artifacts rather than
redoing approved work (ASC continue protocol). Phase names completed 2026-09-02 (R4 review) from the
canonical Loki table in `GABBE/agents/skills/brain/loki-mode.skill.md` (S00 Strategy & Discovery …
S13 Decommission & Sunset) — the earlier generic labels were a documented fidelity gap, now closed.

Trace: `GABBE/agents/skills/brain/loki-mode.skill.md` (phase table); `GABBE/agents/AGENTS.md` §"Loki & Brain"; `docs/PRD.md` line 1 (S01);
`docs/PLAN.md` line 1 (S02); GABBE audit log 2026-09-02 entries (S02 gate, current position).
