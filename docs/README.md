# `docs/` — the documentation

**Summary.** Everything that explains the specification and the engine, for people
and for agents. None of it is normative: where a page here disagrees with a rule in
`spec/`, the rule wins. Start with [START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md), which sends each
kind of reader down one path.

## Orientation

| Page | For |
|---|---|
| [START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md) | everyone: one path per kind of reader |
| [ARCHITECTURE-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-GUIDE.md) | the system in pictures: nodes, the five contexts, the build, the tools, conformance, release, where a node can live |
| [CODE-ORIENTATION.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CODE-ORIENTATION.md) | a guided walk through the repository and where to start for each task |
| [SPEC-ORIENTATION.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SPEC-ORIENTATION.md) | how the twelve chapters fit and how to read a rule |
| [PROTOCOLS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PROTOCOLS.md) | every outside standard the system uses, why, and where |
| [plain/](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/README.md) | the specification in plain words, one page per chapter |
| [GLOSSARY.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/GLOSSARY.md) | every term, generated from the specification and the ontology |

## Using it

| Page | For |
|---|---|
| [guides/](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/README.md) | one short guide per mode, on your own files: who it is for, what you get, the commands and what they print |
| [USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md) | twenty-one concrete scenarios with their commands |
| [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md) | connecting agents, frameworks and repositories to a node |
| [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md) | the local tool server for an AI assistant |
| [PLUGINS.md](PLUGINS.md) | writing a plugin of one of the eight kinds |
| [IMPLEMENTERS-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) | writing a second implementation in another language |
| [CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md) | how to say an implementation conforms |

## Design, evidence and records

| Page | For |
|---|---|
| [ARCHITECTURE-DDD.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md) | the domain model: bounded contexts, language, forward compatibility |
| [PRD.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PRD.md), [PLAN.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PLAN.md) | the requirements and the architecture decisions |
| [SPEC.md](SPEC.md) | the index of the specification |
| [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md) | threats and the rules that close them |
| [COMPLIANCE-CROSSWALK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/COMPLIANCE-CROSSWALK.md) | outside frameworks mapped to the rules (not legal advice) |
| [RELATED-WORK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/RELATED-WORK.md) | how this relates to other systems, with dates |
| [TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md) | the test levels and how to run them |
| [RULE-COVERAGE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/RULE-COVERAGE.md) | for every rule, the checks that verify it (generated) |
| [REQUIREMENTS-MATRIX.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/REQUIREMENTS-MATRIX.md) | for every requirement of the PRD, the rules that trace to it and the checks behind them (generated) |
| [ENGINEERING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ENGINEERING.md) | the gates, the size limits, the dependency rule, and how the four public repositories are checked |
| [MEASUREMENTS.md](MEASUREMENTS.md), [BENCHMARKS.md](BENCHMARKS.md) | the measured numbers and the method behind them |
| [diagrams/](diagrams/README.md) | the diagram pack: Mermaid sources and rendered SVG |
| [ROADMAP.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ROADMAP.md) | what composition and the graph do today, and what is planned for the next version |

Generated pages (`GLOSSARY.md`, `RULE-COVERAGE.md`, `REQUIREMENTS-MATRIX.md`, `measurements.json`) are never
edited by hand; the command that writes each is named at its top.

```bash
node tools/gen-glossary --check     # the glossary is current
node tools/rule-coverage --check    # the coverage page is current
node tools/requirements-matrix --check  # the requirements page is current
```
