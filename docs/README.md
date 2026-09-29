# `docs/` — the documentation

**Summary.** Everything that explains the specification and the engine, for people
and for agents. None of it is normative: where a page here disagrees with a rule in
`spec/`, the rule wins. Start with [START-HERE.md](START-HERE.md), which sends each
kind of reader down one path.

## Orientation

| Page | For |
|---|---|
| [START-HERE.md](START-HERE.md) | everyone: one path per kind of reader |
| [ARCHITECTURE-GUIDE.md](ARCHITECTURE-GUIDE.md) | the system in pictures: nodes, the five contexts, the build, the tools, conformance, release, where a node can live |
| [CODE-ORIENTATION.md](CODE-ORIENTATION.md) | a guided walk through the repository and where to start for each task |
| [SPEC-ORIENTATION.md](SPEC-ORIENTATION.md) | how the twelve chapters fit and how to read a rule |
| [PROTOCOLS.md](PROTOCOLS.md) | every outside standard the system uses, why, and where |
| [plain/](plain/README.md) | the specification in plain words, one page per chapter |
| [GLOSSARY.md](GLOSSARY.md) | every term, generated from the specification and the ontology |

## Using it

| Page | For |
|---|---|
| [USE-CASES.md](USE-CASES.md) | nineteen concrete scenarios with their commands |
| [CONNECTORS.md](CONNECTORS.md) | connecting agents, frameworks and repositories to a node |
| [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md) | the local tool server for an AI assistant |
| [PLUGINS.md](PLUGINS.md) | writing a plugin of one of the eight kinds |
| [IMPLEMENTERS-GUIDE.md](IMPLEMENTERS-GUIDE.md) | writing a second implementation in another language |
| [CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md) | how to say an implementation conforms |

## Design, evidence and records

| Page | For |
|---|---|
| [ARCHITECTURE-DDD.md](ARCHITECTURE-DDD.md) | the domain model: bounded contexts, language, forward compatibility |
| [PRD.md](PRD.md), [PLAN.md](PLAN.md) | the requirements and the architecture decisions |
| [SPEC.md](SPEC.md) | the index of the specification |
| [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md) | threats and the rules that close them |
| [COMPLIANCE-CROSSWALK.md](COMPLIANCE-CROSSWALK.md) | outside frameworks mapped to the rules (not legal advice) |
| [RELATED-WORK.md](RELATED-WORK.md) | how this relates to other systems, with dates |
| [TESTING.md](TESTING.md) | the test levels and how to run them |
| [RULE-COVERAGE.md](RULE-COVERAGE.md) | for every rule, the checks that verify it (generated) |
| [REQUIREMENTS-MATRIX.md](REQUIREMENTS-MATRIX.md) | for every requirement of the PRD, the rules that trace to it and the checks behind them (generated) |
| [ENGINEERING.md](ENGINEERING.md) | the gates, the size limits, the dependency rule, and how the five repositories are checked |
| [MEASUREMENTS.md](MEASUREMENTS.md), [BENCHMARKS.md](BENCHMARKS.md) | the measured numbers and the method behind them |
| [diagrams/](diagrams/README.md) | the diagram pack: Mermaid sources and rendered SVG |
| [ROADMAP.md](ROADMAP.md) | what composition and the graph do today, and what is planned for the next version |

Generated pages (`GLOSSARY.md`, `RULE-COVERAGE.md`, `REQUIREMENTS-MATRIX.md`, `measurements.json`) are never
edited by hand; the command that writes each is named at its top.

```bash
node tools/gen-glossary --check     # the glossary is current
node tools/rule-coverage --check    # the coverage page is current
node tools/requirements-matrix --check  # the requirements page is current
```
