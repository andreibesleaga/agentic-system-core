# Agentic System Core

A specification for publishing machine-discoverable knowledge bundles — the Agentic Knowledge Web.

**This 0.0.x release reserves the package name. No runtime is published yet.** What exists today is the specification itself: numbered normative rules, three JSON Schemas, an OWL 2 RL ontology and a suite of conformance test vectors, all developed in the open. The command-line tool and the libraries are published in later releases, and this text will change when they are.

## Status
**Pre-Release (0.0.2 on npm and PyPI; the specification's latest tag is `1.0.0-rc.5`, which is also what this tree states — `spec/00-overview.md` is authoritative, and it is the file to read rather than this line).** Active development is underway. The core CLI (`agsc`) and memory node schema definitions will be published in upcoming minor releases.

For architecture specifications, visit [AgenticSystemCore.com](https://agenticsystemcore.com).

## Reference engine (in progress) — added 2026-09-18

A reference implementation of the specification is being written in this
repository, under `src/`. It is **not published** and **claims no conformance
Level**: AGSC-10-05 says a claim exists only after a green run of the Level's
vector set at 1.0.0, and four verbs of AGSC-09-07 answer honestly that they are
not implemented yet.

* `src/README.md` is the engine's own documentation — the bounded contexts, the
  module map, the verb → module table, how to run the conformance vectors, and
  the list of specification items this work found and reported rather than
  worked around.
* `tests/vectors/**` is the acceptance test, and it is the part that matters to
  anyone implementing this format in another language: a port needs `spec/`,
  `schema/`, `ontology/` and those vectors, and nothing from `src/`.
* `node --test 'tests/**/*.test.js'` runs the whole suite, and the conformance
  runner prints one summary line.

The engine's arrangement is one implementation choice, not part of the format.
Where this engine and the specification disagree, the specification wins.
