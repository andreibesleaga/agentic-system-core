# AGSC-02 — Item: frontmatter contract per type

## 2.1 Frontmatter syntax

- **AGSC-02-01** A file MUST begin on line 1 with `---`, contain YAML, and close with a line `---`. No `...` terminator and no second document (`AGSC-E107`). [research/12 §P rule 5]
- **AGSC-02-02** The YAML subset is: block mappings, block sequences, flow sequences of scalars, single/double-quoted and plain scalars, `|` and `>` block scalars. Anchors, aliases, tags, merge keys, complex keys, flow mappings and duplicate keys MUST be rejected (`AGSC-E103`…`AGSC-E106`). [research/12 §P rule 6]
- **AGSC-02-03** A reader MUST parse with the YAML **failsafe** schema — every scalar is a string — and MUST apply types from `schema/item.schema.json`. `yes`, `no`, `on`, `off`, `~`, `1e3`, `0x1F` and bare dates are strings. [research/12 §2, §P rules 6–7]
- **AGSC-02-04** Booleans MUST be written `true`/`false`; numbers MUST be plain decimal; dates and instants MUST be quoted strings. [research/12 §P rule 7]
- **AGSC-02-05** Key names MUST match `^[a-z][a-z0-9_-]*$`. Unknown keys MUST be preserved and reported as warnings (`AGSC-E207`), never as errors. [research/12 §P rule 11, OKF]
- **AGSC-02-06** Dates use `YYYY-MM-DD`. Instants (`stale_after`, `generated.at`, `verified[].at`, `started`, `ended`) MUST be `YYYY-MM-DDTHH:MM:SSZ` — a datetime with an explicit UTC offset, seconds precision, never a bare date. [audit/D addendum 2026-09-01, OKF 2026-08-21]

## 2.2 Keys common to every type

| Key | Required | Value |
|---|---|---|
| `type` | yes | `concept\|episode\|procedure\|lesson\|cluster\|gate` |
| `title` | yes | 3–120 characters, any Unicode NFC |
| `description` | yes for `concept`, `cluster` | 40–200 characters |
| `status` | no (default `stable`) | `draft\|stable\|deprecated` |
| `release` | no | slug; see AGSC-01-20 |
| `tags` | recommended | 2–5 values from `tags.allowed` |
| `aliases` | no | strings |
| `clusters` | recommended on `concept` | cluster slugs; first is primary |
| `lang` | no (default `en`) | lowercase BCP 47 |
| `date`, `modified` | recommended | `YYYY-MM-DD` |
| `sources[]` | recommended | `{resource*, title, author, year, verified, grade?}`, `grade ∈ primary\|secondary\|tertiary` |
| `prov` | yes | `{origin*, agent?, model?, operator*, agreement?}` |
| `generated`, `verified[]`, `stale_after` | no | OKF verbatim |
| nine Link keys | no | §03 |
| `id`, `iri` | no | if present MUST equal the slug / the computed IRI |

- **AGSC-02-07** `prov.origin` MUST be one of `human`, `ai-assisted`, `ai-generated`, `imported`; `prov.operator` MUST be present and MUST be an actor string. Absence of `prov` is error `AGSC-E501`. [PRD-042 ← D07, G35]
- **AGSC-02-08** `prov.commit` and `prov.reviewer` MUST NOT be stored in a file. They are derived at build from the git log and from `verified[]`. A build MUST NOT write into `content/`. [PRD-042 ← G35, Art. XIII]
- **AGSC-02-09** Actor strings MUST be `human:<id>`, `process:<id>` or `<producer>/<version>`. [OKF, research/12 §P rule 9]
- **AGSC-02-10** `sources[].resource` is REQUIRED in every `sources[]` entry. [research/12 §P rule 9]
- **AGSC-02-11** An item is **stale** when `stale_after` is earlier than the build instant (§04). Staleness MUST be computed by comparison only — no decay function, no activation score, no access log. [PRD-017 ← R49, D43(3)]

## 2.3 Type-specific keys

- **AGSC-02-12** `concept` MUST carry `kind` ∈ `pattern|taxonomy|explainer|principle|decision|spec|task|term`. Optional facets: `evidence` (`explicit|structural|single-source`), `maturity` (`established|emerging|research`), `mapping` (`explicit|author`), `signature` (boolean), `signature_elements[]`, `owasp_ids[]`, `domains[]`, `modality[]`, `deployment[]`, `implementations[]{label,url}`, `diagram{file*,alt*,caption}`. [audit/D §1.2, D41, G06]
- **AGSC-02-13** `diagram.file` MUST be `<slug>.svg`, compiled from `content/diagrams/<slug>.diagram`; `diagram.alt` is REQUIRED. [PRD-013 ← N10]
- **AGSC-02-14** `episode` MUST carry `started`, `actor` and `outcome` ∈ `success|partial|failure`; MAY carry `ended`, `refs[]`. [audit/D §1.2]
- **AGSC-02-15** `procedure` MAY carry `when` (one line; it becomes the exported `SKILL.md` `description`, ≤1024 characters) and `inputs[]`. [audit/D §1.2, PRD-032]
- **AGSC-02-16** `lesson` MUST carry `severity` ∈ `info|warn|block` and SHOULD carry `derived-from` naming an Episode. [audit/D §1.2]
- **AGSC-02-17** `cluster` MAY carry `broader` (at most one cluster slug), `order` (integer) and `family` (free text). `ordered` is not defined at 1.x. [audit/D §1.2]
- **AGSC-02-18** `gate` MUST carry `level` ∈ `L1|L2` and `checks[]` ⊆ `schema|links|provenance|determinism|review`; `enforce[]` is limited to `status-check`. [audit/D §1.2, D44(b)]
- **AGSC-02-19** Cluster membership MUST be authored on the item (`clusters[]`), never on the cluster file. [audit/D §1.1]

## 2.4 Body

- **AGSC-02-20** The body MUST be CommonMark 0.31.2 plus GFM tables. Footnotes, raw HTML and unescaped `{`/`<` outside code SHOULD NOT be used; an unsupported construct MUST be a lint finding (`AGSC-E109`), never a silent rendering difference. [research/12 §P rule 14, PLAN §11 R1]
- **AGSC-02-21** Body sections are not schema-enforced. A lint MUST warn (`AGSC-E406`) when `kind: pattern` lacks `## Intent`, `## Context & Forces`, `## Structure`, `## Consequences & Trade-offs`, `## Related Patterns`; `taxonomy` and `explainer` keep their four headings; `procedure` uses `## When`, `## Steps`, `## Checks`; `episode` uses `## What happened`, `## Outcome`, `## Next`; `lesson` uses `## Lesson`, `## Evidence`, `## Check before`. [audit/D §1.2, G50]
- **AGSC-02-22** Fenced blocks with info string `turtle`, `jsonld`, `sparql` or `shacl` **and** the word `export` MUST be extracted into the graph; `mermaid`, `structurizr`, `gherkin` and `diagram` are rendering hints only. [research/12 §P rule 18]

## 2.9 Adoption of bare Markdown (added 2026-09-02, S01 Amendment 1)
- **AGSC-02-90** `init` MUST adopt a `.md` file that has no frontmatter block by prepending exactly: `type: concept`, `kind: explainer`, `title` (first ATX `#` heading if present, else the filename stem, NFC), `prov: {origin: human, operator: <from config, else git user.email as human:<local-part>, else "human:unknown" with a warning>}` — nothing else. The body MUST be byte-identical after adoption. [PRD-053]
- **AGSC-02-91** Adoption MUST be idempotent and MUST NOT modify a file that already begins with `---`. A file whose first heading duplicates an existing slug gets the filename-stem slug; collisions follow the anchor suffix rule (`-1`, `-2`, …). [PRD-053, AGSC-03-13]
- **AGSC-02-92** Adopted items pass lint with warnings (no `description`, no `sources[]`) but MUST NOT error: the drop-in path is a first-class conformance scenario (class: full engine). [PRD-053, R24]
