# `src/interchange/` — the Interchange context (reserved)

**Summary.** This directory is the supporting **Interchange** bounded context of
`docs/ARCHITECTURE-DDD.md` §2: foreign formats, in both directions. It is
reserved and holds no code at this milestone; the file you are reading is the
only thing in it, so that the context map and the directory tree agree and no
reader has to guess whether a module is missing or was never written.

## What belongs here

| Rule | What it asks for |
|---|---|
| AGSC-01-22, AGSC-01-23 | `import`: OKF tolerance — read a foreign bundle without losing what this format does not model |
| AGSC-01-26…01-29 | `export`: the Markdown, OKF, JSON-LD, JSONL and steer targets |
| AGSC-03-19 | the import synonyms of the fourteen Link keys; an unmapped native relation becomes `related` |
| AGSC-09-94 | the import path `trace <file.json>` maps an agent-run record through, to an Episode item (AGSC-02-14) |
| AGSC-10-07…10-09 | a foreign node's native identifiers and links, mapped to slugs and to the fourteen keys |

## Why it is empty

Distribution owns this node's OWN surfaces and is output-only; Interchange owns
FOREIGN formats and is bidirectional. Putting an importer in Distribution would
erase that boundary, and `tests/arch/context-boundaries.test.js` enforces the
direction of every arrow, so the work waits for its own package (WP-12) rather
than landing in the wrong context.

Until it does, the four verbs that need it — `export`, `import`, `trace` and the
Level-2 half of `skills` — answer with the AGSC-09-11 envelope, exit 1 and one
finding that names the rule they will implement. They never report a silent
success, and no conformance Level is claimed before 1.0.0 (AGSC-10-05).

Created at integration, 2026-09-18 (WP-10-G).
