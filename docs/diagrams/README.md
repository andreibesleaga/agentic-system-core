# docs/diagrams/ — visual-specs pack (Mermaid source in Markdown)

**Who this is for:** a reader who wants the pictures behind the architecture and the specification. **Read after:** [ARCHITECTURE-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-GUIDE.md). *(Header added 2026-09-24.)*

All diagrams here are **Mermaid source fenced in Markdown**, rendered natively by GitHub — never
rendered in CI ("Mermaid emitted as text only"; no rendering dependency and no rendering step in CI).
One topic per file: title + diagram(s) + a short caption + trace ids. This pack accompanies the frozen
`docs/PRD.md` / `docs/PLAN.md` text specs and the `features/*.feature` BDD scenarios — it does not
redefine anything; every fact here traces back to those frozen documents.

## Index

| File | Diagram(s) | Notation | Traces | Source-of-truth doc |
|---|---|---|---|---|
| `scenario-map.md` | 1 flowchart | flowchart LR | PRD §1 | `docs/PRD.md` §1 |
| `user-flows.md` | 5 flowcharts | flowchart TD | PRD-011/013/014/**053**/036–038/039–042/050/032–035 | `docs/PLAN.md` §6(b),(c) |
| `state-item-lifecycle.md` | 1 state machine | stateDiagram-v2 | PRD-018 | `docs/PRD.md` §2.2 |
| `state-proposal.md` | 1 state machine | stateDiagram-v2 | PRD-039–043 | `docs/PLAN.md` §6(b) |
| `schema-domain.md` | 1 class diagram | classDiagram | PRD-002/037/042 | `docs/PRD.md` §2.1, `spec/02-item.md` |
| `schema-ontology.md` | 1 flowchart | flowchart LR | PRD-002/022 | `ontology/agsc.ttl`, `spec/05-graph.md` |
| `algo-build-pipeline.md` | 1 flowchart | flowchart TD | PRD-004/005/020, NFR-04 | `docs/PLAN.md` §6(a) |
| `algo-combiner.md` | 1 flowchart | flowchart TD | PRD-036–038 | `spec/07-composition.md`, `docs/PLAN.md` §6(c) |
| `algo-ledger.md` | 1 flowchart + 1 sequence | flowchart TD + sequenceDiagram | PRD-005, NFR-11 | `docs/PLAN.md` §6(a), ADR-006 |
| `workflow-ci-cd.md` | 1 flowchart + 1 sequence | flowchart TD + sequenceDiagram | PRD-048–051, NFR-04/09 | `docs/PLAN.md` §7, ADR-005 |
| `workflow-agent-lane.md` | 1 flowchart | flowchart TD | PRD-063, PRD-064, PRD-065 (rc.4) | `spec/08-governance.md` §8.6, `spec/10-implementation-profiles.md` §10.6, `docs/PRD.md` Amendment 8 |
| `workflow-migration.md` | 1 flowchart | flowchart TD | PRD-021 | `docs/PRD.md` §2.2 |
| `arch-system-overview.md` | 1 flowchart | flowchart LR | AGSC-00-02, AGSC-06-07, AGSC-09-16, AGSC-11-13 | `docs/ARCHITECTURE-GUIDE.md` §1 *(added 2026-09-24)* |
| `arch-c4-context.md` | 1 flowchart | flowchart TB | AGSC-00-02, AGSC-04-03, AGSC-09-08 | `docs/ARCHITECTURE-GUIDE.md` §2 *(added 2026-09-24)* |
| `arch-c4-container.md` | 1 flowchart | flowchart TB | AGSC-09-07, AGSC-09-13, AGSC-09-90 | `docs/ARCHITECTURE-GUIDE.md` §2 *(added 2026-09-24)* |
| `arch-c4-component.md` | 1 flowchart | flowchart TD | AGSC-04-01, AGSC-00-24 | `docs/ARCHITECTURE-GUIDE.md` §2, `src/README.md` §2 *(added 2026-09-24)* |
| `flow-page-tool-call.md` | 1 sequence | sequenceDiagram | AGSC-09-13, AGSC-09-16, AGSC-06-05 | `docs/ARCHITECTURE-GUIDE.md` §4 *(added 2026-09-24)* |
| `flow-conformance-chain.md` | 1 flowchart | flowchart LR | AGSC-09-04, AGSC-09-90, AGSC-10-15 | `docs/ARCHITECTURE-GUIDE.md` §5 *(added 2026-09-24)* |
| `flow-release.md` | 1 flowchart | flowchart TD | PRD-048–050, NFR-09 | `docs/ARCHITECTURE-GUIDE.md` §6 *(added 2026-09-24)* |
| `arch-node-hosting.md` | 1 flowchart | flowchart LR | AGSC-00-24, AGSC-06-17, AGSC-04-25 | `docs/ARCHITECTURE-GUIDE.md` §7 *(added 2026-09-24)* |
| `spec-chapter-dependencies.md` | 1 flowchart | flowchart TD | AGSC-00-01, AGSC-10-15 | `docs/SPEC-ORIENTATION.md` §2 *(added 2026-09-24)* |

## Standing sync rule

**A stale diagram is a gate failure** (decided 2026-09-02, recorded in the
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
  `docs/PLAN.md` and the specification — nothing is invented.

## Rendered pictures (added 2026-09-24)

Every Mermaid block of this pack is also committed as a rendered SVG under
[`../diagrams-rendered/`](https://github.com/andreibesleaga/agentic-system-core/tree/main/docs/diagrams-rendered), named `<file>-<n>.svg` for the n-th block of `<file>.md`, for readers
whose viewer cannot render Mermaid. The Mermaid source stays the truth and CI still
renders nothing: the pictures are rendered offline by a maintainer, with `mermaid`
12.0.0 in a headless Chromium, installed outside the repository. When a diagram's
source changes, its SVG is rendered again in the same change set; a picture left
behind is as stale as the diagram would be. The render script is `../diagrams-rendered/render.js`
(its header says how to run it). The pictures sit outside this folder so that the npm
package, which ships `docs/diagrams/`, does not carry them.
