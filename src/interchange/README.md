# `src/interchange/` — Interchange: foreign formats, in and out

**Summary.** This folder is the supporting **Interchange** context: everything that
reads a format this specification does not own, or writes one for another tool. It
imports Open Knowledge Format bundles, COGX memory archives, GABBE kits, skills
repositories, project-board exports and the retired pattern site, and exports
Markdown, OKF, steering files for coding assistants and the same foreign formats back.
Every import is deterministic, idempotent and total; nothing it cannot map is dropped
in silence.

**Read after:** [the module guide](../README.md). **Specification:** `spec/01`
§1.5–1.6 (import and export), `spec/03` §3.6 (link synonyms). **May depend on:**
`knowledge/`, `governance/`, `ports/` (types only), `shared/`. **Tests:**
`tests/interchange/`. The user-facing routes are in `docs/CONNECTORS.md`.

## What each file does

| File | What it does |
|---|---|
| `okf.js` | `import --from okf`: the Open Knowledge Format reader |
| `export-bundle.js` | `export --markdown` and `export --okf`: the Bundle itself, byte-preserving |
| `steer.js` | `export --steer`: steering files for eleven targets (coding assistants, `AGENTS.md`, GABBE) |
| `trace.js` | `trace <file.json>`: an agent-run record to an Episode item |
| `own-record.js` | when an import may trust a line this node wrote itself; the record's base64 codec |
| `licences.js` | the licences an import recognises, shared by the skills adapter and the OKF reader (AGSC-01-22) |
| `records.js` | the helpers every adapter shares: safe JSON objects, one-line text, the lint-normalized item bytes |
| `board-formats.js` | eleven project-board file formats, read and written through one table |
| `import.js`, `oldsite.js`, `mapping.js`, `sources.js`, `status.js`, `clusters.js`, `cleanroom-rewrite.js`, `selection.js` | `import --from old-site`, the retired pattern site's format |
| `adapters/llm-context.js` | `export --to llm-context`: a compact context file for a model |
| `adapters/cogx.js` | `export --to cogx` / `import --from cogx`: COGX memory archives |
| `adapters/gabbe.js` | `export --to gabbe` / `import --from gabbe`: GABBE kits |
| `adapters/skills.js` | `export --to skills` / `import --from skills`: skills repositories in five layouts |
| `adapters/board.js` | `export --to board` / `import --from board`: project boards |
| `adapters/mermaid.js` | `export --to mermaid`: Mermaid diagrams of the typed Links, per item and per cluster (export only) |

## The rules this folder implements

| Rule | What it asks for |
|---|---|
| AGSC-01-22, AGSC-01-23 | `import`: OKF tolerance — read a foreign bundle without losing what this format does not model |
| AGSC-01-26…01-29 | `export`: the Markdown, OKF, JSON-LD, JSONL and steer targets |
| AGSC-03-19 | the import synonyms of the fourteen Link keys; an unmapped native relation becomes `related` |
| AGSC-09-94 | the import path `trace <file.json>` maps an agent-run record through, to an Episode item (AGSC-02-14) |
| AGSC-10-07…10-09 | a foreign node's native identifiers and links, mapped to slugs and to the fourteen keys |

Distribution owns this node's OWN surfaces and is output-only; Interchange owns
FOREIGN formats and is bidirectional. `tests/arch/context-boundaries.test.js` enforces
the direction of every arrow between the two.

## The adapters this distribution ships, with their claimed key sets

`AGSC-01-26a` requires every memory adapter to be "listed with its claimed key set in
the distribution's implementer documentation". `docs/IMPLEMENTERS-GUIDE.md` §6 points
here, and here is the list.

| adapter | direction | selected by | keys it claims |
|---|---|---|---|
| `llm-context` | export | `export --to llm-context` | `digest`, `id`, `item`, `kind`, `links`, `ordinal`, `section`, `text`, `title`, `type` — the chunk record of AGSC-06-29, minus the members `llms-ctx.txt` states in its own header that it drops |
| `okf` | import | `import --from okf` | every frontmatter key the foreign document carries. Two are rewritten and each records what it did: a `type` outside AGSC-00-04's six becomes `concept` and is kept as `x-okf-type`; an absent `prov` is synthesized as `{origin: imported, operator: <bundle.operator>}`. Nothing else is dropped, renamed or interpreted |
| `old-site` | import | `import --from old-site` | see `mapping.js`: every foreign key is mapped, renamed, folded, moved into the `x-oldsite-*` namespace of AGSC-02-05a, or dropped with a reason |
| `cogx` | export and import | `export --to cogx`, `import --from cogx` (flags of its own: `--replace`, `--allow-newer`) | **export:** every authored frontmatter key and the body of every published item, carried whole in the primary record's `metadata.agsc` (a raw node carries it inline). **import:** our own archive — the same; a foreign archive — `name`, `entity_type`, `description`, `aliases` (entity), `content`, `categories` (memory), `label`, `value` (memory block), `subject_ref`, `predicate`, `object_ref` (fact), `external_id`, `external_system`, `created_at`. Every other member of a foreign record is kept verbatim as one JCS string in `x-cogx-rest`; foreign episodes, documents and raw nodes are reported and skipped |
| `gabbe` | export and import | `export --to gabbe`, `import --from gabbe <kit-dir>` (flags of its own: `--replace`, `--allow-newer`, `--source-version <v>`) | **export:** every authored frontmatter key and the body of every published item, carried whole in the item's `<!-- agsc-item <base64 of the JCS record> -->` line (procedure → `agents/skills/agsc/<slug>.skill.md`, gate → `agents/guides/agsc/<slug>.md`, concept and cluster → `agents/memory/semantic/agsc/<slug>.md`, episode → `agents/memory/episodic/agsc/<slug>.md`, lesson → an entry of `agents/memory/CONTINUITY.md`), plus `agents/guides/agsc/steering.md` (the `--steer` text). **import:** our own records — the same, plus `prov.source_version`; a foreign kit — a skill's `name`, `description`, `triggers`, `tags`, `context_cost` and body; a CONTINUITY entry's heading, `Failed approach`, `Why it failed`, `Resolution`, `Date`, `Status`; an AUDIT_LOG row's `Timestamp`, `Actor`, `Type`, `Description`, `Outcome`, `References`; a decision-log entry's `Date`, `Timestamp`, `Actor`, `Action Type`, `Subject`, `Rationale`, `Outcome`, `References`; a dated PROJECT_STATE line. Unmapped members are kept in `x-gabbe-*` keys (`x-gabbe-rest` holds a skill's other frontmatter as one JCS string). An AUDIT_LOG bullet entry, an entry with no readable outcome, a snapshot with none and the resume pointer are reported and skipped — an episode's outcome and start instant are never invented |
| `skills` | export and import | `export --to skills --layout <l>`, `import --from skills [--layout <l>] [--list] <clone>` (flags of its own: `--layout`, `--list`, `--replace`, `--allow-newer`, `--source-version <v>`); layouts `agentskills`, `claude-plugin`, `marketplace`, `cursor`, `windsurf` | **export:** every authored frontmatter key and the body of every published item of every pack (the cluster and its members), carried whole in one `agsc-item` line each. **import:** our own records — the same, plus `prov.source_version`; a foreign skill — `name`, `description`, `license`, `metadata.version` and the body; a foreign rule — `description`, `globs`, `alwaysApply`, `trigger` and the body; a plugin manifest's `name`, `version`, `license`, `skills`; a marketplace's `plugins[].source` (relative only), `skills`, `version`, `license` and `metadata.version`. Every other frontmatter member is kept verbatim as one JCS string in `x-skills-rest`. Dropped and reported per file, never imported: `allowed-tools`, `scripts/` and executable files, a plugin's `hooks/`, `.mcp.json`, `.lsp.json`, `bin/`, `scripts/`; not mapped and reported: a plugin's `commands/`, `agents/`, `output-styles/`, a skill's other supporting files |
| `board` | export and import | `export --to board --format <f>`, `import --from board --format <f> <dir>`; formats `asana`, `github`, `gitlab`, `jira`, `linear`, `markdown`, `notion`, `obsidian-kanban`, `todotxt`, `trello` (and `agsc-board`, this node's own) | **export:** the published tasks of each board, one file per board; every row carries the item's authored frontmatter, body, slug and board as one own-record, so a return import rebuilds each item exactly. **import:** our own rows — the same; a foreign row — the title, the body, the tool's state word mapped to one of the nine task states (`task_state`) and kept in `x-board-state`, the assignee in `x-board-assignee`, the dependency as `blocked-by`, a `Decision`/`Spec` type or label as that `kind`; labels, the due date, the tool's id, unresolved link ids and every other column are kept in `x-board-*` keys. Foreign rows are written as `status: draft` until a person publishes them |
| `mermaid` | export only | `export --to mermaid` | **none** — there is no `import --from mermaid`, so no key is claimed for a round trip. It reads the fourteen Link keys, `title` and `clusters` of every published item and writes `items/<slug>.mmd` (the item and its direct typed Links, both directions) and `clusters/<slug>.mmd` (the cluster's members and the Links among them), each headed by the provenance block as `%%` comment lines |

An adapter is discovered by directory convention and never by a configuration key
(AGSC-01-26a); `export --to <name>` resolves `adapters/<name>.js` after
matching `<name>` against the slug grammar of AGSC-01-10, so no caller-supplied string
can traverse a path. A memory-adapter plugin of your own is named by its path or
package on the command line instead (`docs/PLUGINS.md` §4).
