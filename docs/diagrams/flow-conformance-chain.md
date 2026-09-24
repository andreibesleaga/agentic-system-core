# Flow — the conformance chain

**What this shows.** How a rule becomes something anyone can check. A rule in `spec/`
is pinned by one or more vectors (expected bytes or codes); a runner in any language
runs the vectors of a Level; the standalone checkers check the specification, the
vectors and a built node without importing the engine; a green run of a Level's set at
a released version is what a conformance claim rests on.

```mermaid
flowchart LR
  R["Rule<br/>spec/nn-*.md<br/>AGSC-nn-nn, MUST"]
  V["Vector<br/>tests/vectors/area/*.json<br/>input + expected"]
  RUN["Runner<br/>(any language)"]
  IMPL["Your implementation"]
  REP["Report<br/>pass / fail / skip per id"]
  CHK["Checkers<br/>tools/validate-*"]
  NODE["A built node"]
  CLAIM["Claim: one Level,<br/>one released version"]
  R -->|pinned by| V
  V --> RUN
  IMPL --> RUN
  RUN --> REP
  REP -->|green for the Level| CLAIM
  CHK -->|check| R
  CHK -->|check| V
  CHK -->|check| NODE
  IMPL -->|builds| NODE
```

Trace: AGSC-09-01 to AGSC-09-06 (vectors and reports), AGSC-09-90 (checkers),
AGSC-10-01 and AGSC-10-15 (Levels and their areas), AGSC-10-05 (no claim before
1.0.0).
