# `src/interchange/` — Interchange: foreign formats, in and out

**Summary.** This folder is the supporting **Interchange** context: everything that
reads a format this specification does not own, or writes one for another tool. It
imports Open Knowledge Format bundles, SKOS thesauri, COGX memory archives, GABBE kits,
skills repositories, project-board exports and the retired pattern site, and exports
Markdown, OKF, steering files for coding assistants and the same foreign formats back.
Every import is deterministic, idempotent and total; nothing it cannot map is dropped
in silence; and from 1.1 every item a foreign source brings arrives as a draft.

**Read after:** [the module guide](../README.md). **Specification:** `spec/01`
§1.5–1.6 (import and export), `spec/03` §3.6 (link synonyms). **May depend on:**
`knowledge/`, `governance/`, `ports/` (types only), `shared/`. **Tests:**
`tests/interchange/`. The user-facing routes are in `docs/CONNECTORS.md`.

## What each file does

| File | What it does |
|---|---|
| `okf.js` | `import --from okf`: the Open Knowledge Format reader; from 1.1 every item of a source this node does not own is a draft |
| `export-bundle.js` | `export --markdown` and `export --okf`: the Bundle itself, byte-preserving |
| `export-manifest.js` | `export --manifest`: the manifest of file digests, item count and items digest (AGSC-09-17), and the check `import` runs on a folder that holds one |
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
| `adapters/skos.js` | `import <file.ttl> --from skos`: a SKOS thesaurus in Turtle, read with `n3`, every item a draft (AGSC-01-39); import only |
| `memory-records.js` | what the six direct memory adapters share (1.1): the published items with their own records and the provenance lines, the import plan (own records back exactly, everything else a draft), the JSON and Markdown readers |
| `adapters/mem0.js`, `adapters/letta.js`, `adapters/zep.js` | `export --to` / `import --from` `mem0`, `letta`, `zep`: the files of each tool's official client (Mem0 memories, Letta archival passages, Zep graph episodes and nodes); no network, no client installed |
| `adapters/csv.js` | `export --to csv` / `import --from csv`: an RFC 4180 table, written by `csv-stringify` and read by `csv-parse` |
| `adapters/basic-memory.js` | `export --to basic-memory` / `import --from basic-memory`: a Basic Memory project's Markdown notes, relations included |
| `adapters/claude-code.js` | `export --to claude-code` / `import --from claude-code`: Claude Code's memory folder (`MEMORY.md` and topic files), and on import its `CLAUDE.md` and rule files |
| `adapters/mermaid.js` | `export --to mermaid`: Mermaid diagrams of the typed Links, per item and per cluster (export only); the edges and members come from `knowledge/link-graph.js`, which the graph view of the pages reads too |

## The rules this folder implements

| Rule | What it asks for |
|---|---|
| AGSC-01-22, AGSC-01-23 | `import`: OKF tolerance — read a foreign bundle without losing what this format does not model; from 1.1 every item of a foreign source arrives as a draft |
| AGSC-01-39 | `import --from skos`: the mapping of a SKOS thesaurus to items, and the report of every statement it drops |
| AGSC-09-17 | `export --manifest` and the manifest check on `import` |
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
| `skos` | import only | `import <file.ttl> --from skos` (flag of its own: `--replace`) | **import:** `skos:prefLabel` → `title`, `skos:altLabel` and SKOS-XL `literalForm` → `aliases`, `skos:definition` → `description` (40 to 200 code points) or the first body paragraph, `skos:broader` / `narrower` / `related` between concepts → the Links of the same names, schemes and collections → `cluster` items with `clusters` / `broader`, http(s) `dcterms:source` → `sources`, the IRI → `x-skos-iri`, the scheme's `dcterms:license` → `x-skos-license`. Every item is a draft. Notations, notes, the mapping properties and every other statement are dropped, each reported as `AGSC-E506` with its subject and predicate. There is no export through this adapter (`export --skos` is a view of the graph, AGSC-05-36). |
| `mem0` | export and import | `export --to mem0`, `import --from mem0 <dir>` (flags of its own: `--replace`, `--allow-newer`, `--source-version <v>`) | **export:** every authored frontmatter key and the body of every published item, carried whole in `options.metadata.agsc` of `memories.json`. **import:** our own records — the same, plus `prov.source_version`; a foreign memory (`mem0ai` 3.3.1 `Memory`, camelCase or snake_case) — `id`, `memory` (or `data.memory`), `categories`, `createdAt`/`created_at`; every other member kept as one JCS string in `x-mem0-rest` |
| `letta` | export and import | `export --to letta`, `import --from letta <dir>` (same flags) | **export:** every authored frontmatter key and the body, in `metadata.agsc` of each passage of `passages.json`. **import:** our own records — the same; a foreign passage (`@letta-ai/letta-client` 1.12.1 `Passage`) — `id`, `text`, `tags`, `created_at`; the rest in `x-letta-rest` |
| `zep` | export and import | `export --to zep`, `import --from zep <dir>` (same flags) | **export:** every authored frontmatter key and the body, in `metadata.agsc` of each episode of `episodes.json`, as one base64 string (the client's metadata values are scalars). **import:** our own records — the same; a foreign episode (`@getzep/zep-cloud` 4.1.0 `Episode`) — `uuid`, `content`/`data`, `createdAt`; a foreign node (`Node`) — `uuid`, `name`, `summary`, `labels`, `createdAt`; the rest in `x-zep-rest` |
| `csv` | export and import | `export --to csv`, `import --from csv <dir>` (same flags) | **export:** every authored frontmatter key and the body, in the `agsc` column of `items.csv`; a cell a spreadsheet would read as a formula is written behind one `'`. **import:** our own rows — the same; a foreign row — `title`/`name`, `body`/`content`/`text`/`memory`, `description`, `date`/`created_at`, `tags`, each without the one `'` a careful writer puts before a formula character; every other column in `x-csv-rest` |
| `basic-memory` | export and import | `export --to basic-memory`, `import --from basic-memory <dir>` (same flags) | **export:** every authored frontmatter key and the body, in each note's `<!-- agsc-item … -->` line. **import:** our own notes — the same; a foreign note — `title`, `type`, `tags`, `permalink`, `created`, `modified`, the body, and relations whose type is a Link key or an AGSC-03-19 synonym; other frontmatter in `x-basic-memory-rest` |
| `claude-code` | export and import | `export --to claude-code`, `import --from claude-code <dir>` (same flags) | **export:** every authored frontmatter key and the body, in each topic file's `<!-- agsc-item … -->` line; an index past the 200 lines or 25 KB Claude Code loads is the warning `AGSC-E506`. **import:** our own files — the same; `CLAUDE.md`, `CLAUDE.local.md` and `.claude/rules/**` — the body and the path; a topic file — `name`, `description`, `type`, the body; other frontmatter in `x-claude-rest` |
| `mermaid` | export only | `export --to mermaid` | **none** — there is no `import --from mermaid`, so no key is claimed for a round trip. It reads the fourteen Link keys, `title` and `clusters` of every published item and writes `items/<slug>.mmd` (the item and its direct typed Links, both directions) and `clusters/<slug>.mmd` (the cluster's members and the Links among them), each headed by the provenance block as `%%` comment lines |

An adapter is discovered by directory convention and never by a configuration key
(AGSC-01-26a); `export --to <name>` resolves `adapters/<name>.js` after
matching `<name>` against the slug grammar of AGSC-01-10, so no caller-supplied string
can traverse a path. A memory-adapter plugin of your own is named by its path or
package on the command line instead (`docs/PLUGINS.md` §4).
