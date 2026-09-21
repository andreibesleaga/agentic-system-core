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

---

## Updated 2026-09-21 (ENG-5, WP-12) — the context is no longer empty

Everything §"What belongs here" lists is implemented. The paragraph "Why it is
empty" above is the record of 2026-09-18 and is kept as written.

| module | rule | what it owns |
|---|---|---|
| `export-bundle.js` | AGSC-01-26, AGSC-01-29 | `export --markdown` and `export --okf`: the lint-normalized Bundle itself, one `.md` per published item, lossless over every authored key; `content/index.md` with `license`, `content/log.md` under `--okf`, `LICENSE-CONTENT` at the export root |
| `steer.js` | AGSC-01-28, AGSC-01-29 | `export --steer`: the eleven-target closed registry, the closed source set, the `Channel-Auto:` withholding |
| `okf.js` | AGSC-01-22, AGSC-01-23 | `import --from okf`: the foreign OKF v0.2 reader |
| `trace.js` | AGSC-09-94, AGSC-02-14 | `trace <file.json>`: a captured agent-run record to an Episode, purely |
| `import.js` + `oldsite.js`, `mapping.js`, `sources.js`, `status.js`, `clusters.js`, `cleanroom-rewrite.js`, `selection.js` | AGSC-01-22, AGSC-03-19 | `import --from old-site` (ENG-1) |
| `adapters/llm-context.js` | AGSC-01-26a, D98 | `export --to llm-context` |

### The adapters this distribution ships, with their claimed key sets

`AGSC-01-26a` requires every memory adapter to be "listed with its claimed key set in
the distribution's implementer documentation". `docs/IMPLEMENTERS-GUIDE.md` §6 points
here, and here is the list.

| adapter | direction | selected by | keys it claims |
|---|---|---|---|
| `llm-context` | export | `export --to llm-context` | `digest`, `id`, `item`, `kind`, `links`, `ordinal`, `section`, `text`, `title`, `type` — the chunk record of AGSC-06-29, minus the members `llms-ctx.txt` states in its own header that it drops |
| `okf` | import | `import --from okf` | every frontmatter key the foreign document carries. Two are rewritten and each records what it did: a `type` outside AGSC-00-04's six becomes `concept` and is kept as `x-okf-type`; an absent `prov` is synthesized as `{origin: imported, operator: <bundle.operator>}`. Nothing else is dropped, renamed or interpreted |
| `old-site` | import | `import --from old-site` | see `mapping.js`: every foreign key is mapped, renamed, folded, moved into the `x-oldsite-*` namespace of AGSC-02-05a, or dropped with a reason |

An adapter is discovered by directory convention and never by a configuration key
(AGSC-01-26a, D61(3)); `export --to <name>` resolves `adapters/<name>.js` after
matching `<name>` against the slug grammar of AGSC-01-10, so no caller-supplied string
can traverse a path.
