# docs/diagrams/ — visual-specs pack (Mermaid source in Markdown)

All diagrams here are **Mermaid source fenced in Markdown**, rendered natively by GitHub — never
rendered in CI (D20: "Mermaid emitted as text only"; no rendering dependency and no rendering step in CI).
One topic per file: title + diagram(s) + a short caption + trace ids. This pack accompanies the frozen
`docs/PRD.md` / `docs/PLAN.md` text specs and the `features/*.feature` BDD scenarios — it does not
redefine anything; every fact here traces back to those frozen documents.

## Index

| File | Diagram(s) | Notation | Traces | Source-of-truth doc |
|---|---|---|---|---|
| `scenario-map.md` | 1 flowchart | flowchart LR | PRD §1, audit/D §3 | `docs/PRD.md`, audit/D §3 |
| `user-flows.md` | 5 flowcharts | flowchart TD | PRD-011/013/014/**053**/036–038/039–042/050/032–035 | audit/D §3(a,b,e,f), `docs/PLAN.md` §6(b),(c) |
| `state-item-lifecycle.md` | 1 state machine | stateDiagram-v2 | PRD-018, R40 | audit/D §1.1, §1.2, §1.3 |
| `state-proposal.md` | 1 state machine | stateDiagram-v2 | PRD-039–043 | audit/D §3(b),(d), `docs/PLAN.md` §6(b) |
| `state-sdlc.md` | 1 state machine | stateDiagram-v2 | — (process, not PRD) | the project's private development register (agent boot document, §"Loki & Brain"), `docs/PRD.md`/`docs/PLAN.md` headers |
| `schema-domain.md` | 1 class diagram | classDiagram | PRD-002/037/042 | audit/D §1.1, §1.2, §1.3 |
| `schema-ontology.md` | 1 flowchart | flowchart LR | PRD-002/022 | audit/D §1.3, §1.4, addendum |
| `algo-build-pipeline.md` | 1 flowchart | flowchart TD | PRD-004/005/020, NFR-04 | audit/D §4, `docs/PLAN.md` §6(a) |
| `algo-combiner.md` | 1 flowchart | flowchart TD | PRD-036–038 | audit/D §1.3, `docs/PLAN.md` §6(c) |
| `algo-ledger.md` | 1 flowchart + 1 sequence | flowchart TD + sequenceDiagram | PRD-005, NFR-11 | D44(h), `docs/PLAN.md` §6(a), ADR-006 |
| `workflow-ci-cd.md` | 1 flowchart + 1 sequence | flowchart TD + sequenceDiagram | PRD-048–051, NFR-04/09 | `docs/PLAN.md` §7, ADR-005 |
| `workflow-agent-lane.md` | 1 flowchart | flowchart TD | PRD-063, PRD-064, PRD-065 (rc.4) | `spec/08-governance.md` §8.6, `spec/10-implementation-profiles.md` §10.6, `docs/PRD.md` Amendment 8 |
| `workflow-migration.md` | 1 flowchart | flowchart TD | PRD-021 | audit/D §1.5, D47 |

## Standing sync rule

**A stale diagram is a gate failure** (owner directive, 2026-09-02, recorded in the
project's private audit log). Any change to `docs/PRD.md`, `docs/PLAN.md`, the item schema
(`schema/*.json`), the Link vocabulary, the build pipeline, the combiner semantics, the ledger format,
the CI/CD lanes, or the migration procedure MUST update the corresponding file(s) in this index in the
same change set — reviewers should treat a diagram left behind as equivalent to a failing test.

## Conventions used throughout this pack

- **Notation choice per topic**: `flowchart` for processes/pipelines/mappings, `stateDiagram-v2` for
  lifecycle/status machines, `classDiagram` for the domain schema, `sequenceDiagram` for
  time-ordered multi-party interactions (ledger verification, w3id conneg).
- **Valid Mermaid syntax**: no reserved-word bare node ids (`end`, `class`, `state`, `graph` are never
  used as identifiers); every label containing punctuation, slashes or colons is quoted or placed
  inside `[" … "]`/`{" … "}`.
- **Size discipline**: every diagram stays at or under ~30 nodes; where a topic would exceed that
  (e.g. the full ontology mapping), it is split by collapsing repeated targets into one shared node
  with descriptive edge labels rather than cramming.
- **Content discipline**: every fact is sourced from the frozen inputs for this pack — `docs/PRD.md`,
  `docs/PLAN.md`, the v1 system walkthrough recorded in the project's private design register (audit D, §1/§3/§4), and
  decisions **D41**, **D43** and **D44** of that register — nothing is invented; `state-sdlc.md` additionally
  cites the private development register (a mandatory boot document) and says explicitly where detail was
  deliberately left generic because the frozen inputs do not name it.
