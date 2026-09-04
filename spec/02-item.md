# AGSC-02 — Item: frontmatter contract per type

## 2.1 Frontmatter syntax

- **AGSC-02-01** A file MUST begin on line 1 with `---`, contain YAML, and close with a line `---`. No `...` terminator and no second document (`AGSC-E107`). [research/12 §P rule 5]
- **AGSC-02-02** The YAML subset is: block mappings, block sequences, flow sequences of scalars, single/double-quoted and plain scalars, `|` and `>` block scalars. Anchors, aliases, tags, merge keys, complex keys, flow mappings and duplicate keys MUST be rejected (`AGSC-E103`…`AGSC-E106`). [research/12 §P rule 6]
- **AGSC-02-03** A reader MUST parse with the YAML **failsafe** schema — every scalar is a string — and MUST apply types from `schema/item.schema.json`. `yes`, `no`, `on`, `off`, `~`, `1e3`, `0x1F` and bare dates are strings. [research/12 §2, §P rules 6–7]
- **AGSC-02-04** Booleans MUST be written `true`/`false`; numbers MUST be plain decimal; dates and instants MUST be quoted strings. [research/12 §P rule 7]
- **AGSC-02-05** Key names MUST match `^[a-z][a-z0-9_-]*$`. Unknown keys MUST be preserved and reported as warnings (`AGSC-E207`), never as errors. A key name that does not match this pattern is `AGSC-E204` (a pattern violation), distinct from an *unknown but well-formed* key, which is the `AGSC-E207` warning; the schema does not enforce the pattern, because `propertyNames` would turn the warning into an error. [research/12 §P rule 11, OKF]
- **AGSC-02-05a** A key matching `^x-[a-z0-9]+(-[a-z0-9]+)+$` is a **reserved vendor extension** (the `x-` namespace of `docs/SPEC.md` §8(2)). A conforming tool MUST preserve it verbatim in every lossless export (AGSC-01-26), MUST NOT interpret it, MUST NOT normalise it beyond the key ordering of AGSC-04-19, and MUST NOT report `AGSC-E207` for it. Every other unknown key still warns under AGSC-02-05. The same namespace is admitted in `agsc.config.json` by AGSC-01-18. [D61(3), SPEC §8(2) ← V5-3 S3-29]
- **AGSC-02-06** Dates use `YYYY-MM-DD`. Instants (`stale_after`, `generated.at`, `verified[].at`, `started`, `ended`) MUST be `YYYY-MM-DDTHH:MM:SSZ` — a datetime with an explicit UTC offset, seconds precision, never a bare date. [audit/D addendum 2026-09-01, OKF 2026-08-21]

## 2.2 Keys common to every type

| Key | Required | Value |
|---|---|---|
| `type` | yes | `concept\|episode\|procedure\|lesson\|cluster\|gate` |
| `title` | yes | 3–120 characters, any Unicode NFC |
| `description` | lint-required for `concept`, `cluster` (`AGSC-E408` warning); schema-optional so adoption passes (AGSC-02-92) | 40–200 characters when present |
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
| fourteen Link keys (nine core + five Mode-2) | no | §03 |
| `id`, `iri` | no | if present MUST equal the slug / the computed IRI |

- **AGSC-02-07** `prov.origin` MUST be one of `human`, `ai-assisted`, `ai-generated`, `imported`; `prov.operator` MUST be present and MUST be a `human:<id>` actor string — accountability is always a person, so `process:<id>` and `<producer>/<version>` are NOT accepted here even though AGSC-02-09 admits them elsewhere (this is what makes the `Assisted-by:` trailer of AGSC-08-07 always satisfiable). Absence of `prov` is error `AGSC-E501`. [PRD-042 ← D07, D48(5), G35]
- **AGSC-02-08** `prov.commit` and `prov.reviewer` MUST NOT be stored in a file. They are derived at build from the git log and from `verified[]`. A build MUST NOT write into `content/`. [PRD-042 ← G35, Art. XIII]
- **AGSC-02-09** Actor strings MUST be `human:<id>`, `process:<id>` or `<producer>/<version>`. [OKF, research/12 §P rule 9]
- **AGSC-02-10** `sources[].resource` is REQUIRED in every `sources[]` entry and is either an `http(s)` URL or the channel form `urn:agsc:channel:<name>:<source_id>`; `sources[].id` is the OPTIONAL stable identifier that makes re-ingest idempotent (AGSC-01-33). [research/12 §P rule 9]
- **AGSC-02-11** An item is **stale** when `stale_after` is earlier than the build instant (§04). Staleness MUST be computed by comparison only — no decay function, no activation score, no access log. [PRD-017 ← R49, D43(3)]

## 2.3 Type-specific keys

- **AGSC-02-12** `concept` MUST carry `kind` ∈ `pattern|taxonomy|explainer|principle|decision|spec|task|term`. Optional facets: `evidence` (`explicit|structural|single-source`), `maturity` (`established|emerging|research`), `mapping` (`explicit|author`), `signature` (boolean), `signature_elements[]`, `owasp_ids[]`, `domains[]`, `modality[]`, `deployment[]`, `implementations[]{label,url}`, `diagram{file*,alt*,caption}`. [audit/D §1.2, D41, G06]
- **AGSC-02-13** `diagram.file` MUST be `<slug>.svg`, compiled from `content/diagrams/<slug>.diagram`; `diagram.alt` is REQUIRED. [PRD-013 ← N10]
- **AGSC-02-14** `episode` MUST carry `started`, `actor` and `outcome` ∈ `success|partial|failure`; MAY carry `ended`, `refs[]` and `usage{model, tokens_in, tokens_out, cost_usd, estimate}` (the optional token accounting rolled up by AGSC-08-25). [audit/D §1.2, NFR-11]
- **AGSC-02-15** `procedure` MAY carry `when` (one line; it becomes the exported `SKILL.md` `description`, ≤1024 characters) and `inputs[]`. [audit/D §1.2, PRD-032]
- **AGSC-02-16** `lesson` MUST carry `severity` ∈ `info|warn|block` and SHOULD carry `derived-from` naming an Episode. [audit/D §1.2]
- **AGSC-02-17** `cluster` MAY carry `broader` (at most one cluster slug), `order` (integer) and `family` (free text). `ordered` is not defined at 1.x. [audit/D §1.2]
- **AGSC-02-18** `gate` MUST carry `level` ∈ `L1|L2` and `checks[]` ⊆ `schema|links|provenance|determinism|review`; `enforce[]` ⊆ `status-check|hook|codeowner|ruleset`, each compiled per AGSC-08-12 [D53, D58(1)]. [audit/D §1.2, D44(b)]
- **AGSC-02-19** Cluster membership MUST be authored on the item (`clusters[]`), never on the cluster file. [audit/D §1.1]

## 2.4 Body

- **AGSC-02-20** The body MUST be CommonMark 0.31.2 plus GFM tables. Footnotes, raw HTML and unescaped `{`/`<` outside code SHOULD NOT be used; an unsupported construct MUST be a lint finding (`AGSC-E109`), never a silent rendering difference. [research/12 §P rule 14, PLAN §11 R1]
- **AGSC-02-21** Body sections are not schema-enforced. A lint MUST warn (`AGSC-E406`) when `kind: pattern` lacks `## Intent`, `## Context & Forces`, `## Structure`, `## Consequences & Trade-offs`, `## Related Patterns`; `taxonomy` and `explainer` keep their four headings; `procedure` uses `## When`, `## Steps`, `## Checks`; `episode` uses `## What happened`, `## Outcome`, `## Next`; `lesson` uses `## Lesson`, `## Evidence`, `## Check before`. A `concept` or `cluster` carrying no `description` is likewise a warning, `AGSC-E408`, never an error, because the schema leaves `description` optional so that an adopted file validates (AGSC-02-92, V2-01). [audit/D §1.2, G50]
- **AGSC-02-22** Fenced blocks with info string `turtle`, `jsonld`, `sparql` or `shacl` **and** the word `export` MUST be extracted into the graph; `mermaid`, `structurizr`, `gherkin` and `diagram` are rendering hints only. `run` and `expect` are the only executable info strings; they are permitted on `procedure` items only and have effect only under the opt-in `run` verb of AGSC-09-94. [research/12 §P rule 18, V4-A A-75]

## 2.5 Status transitions and length units

- **AGSC-02-23** An item with no `status` starts `stable` (the default of the §2.2 common-key table), and every transition between `draft`, `stable` and `deprecated` is legal in both directions — including `deprecated` → `stable` (un-deprecation), which a lint MUST report as a warning (`AGSC-E409`) and MUST NOT reject. `supersedes`/`superseded-by` is orthogonal to `status` and changes neither. [PRD-018 ← D48(7)]
- **AGSC-02-24** Every length bound in this specification — `title` 3–120, `description` 40–200, `when` ≤1024 — counts **UTF-16 code units**, the unit of the JSON Schema patterns that enforce them; no bound counts code points, grapheme clusters or bytes. [PRD-002 ← D48(7), AGSC-04-05]

## 2.9 Adoption of bare Markdown (added 2026-09-02, S01 Amendment 1; rewritten 2026-09-02 per D48(5))

- **AGSC-02-90** `init` MUST adopt a `.md` file that carries no frontmatter block by prepending, in the schema order of AGSC-04-19 (top-level `properties` order, then the matching `oneOf` branch's `properties` order — so `kind` comes last), exactly `type: concept`, `title`, `aliases` (whenever AGSC-02-93 moved or renamed the file — which is every file adopted from outside `content/`), `prov: {origin: human, operator: …}` and `kind: explainer` — nothing else, in that order. The body MUST be byte-identical after adoption. The two derived values are **total functions**, so adoption never errors:
  - **`operator`** — the first source that exists: (1) `bundle.operator` in `agsc.config.json` (AGSC-01-25); (2) the local part of git `user.email`, NFC-normalized, ASCII-lower-cased, every character outside `[a-z0-9._-]` replaced by `-`, runs of `-` collapsed, leading and trailing `-` trimmed, then leading characters outside `[a-z0-9]` trimmed, prefixed `human:`, and rejected in favour of the next source if nothing remains; (3) the literal `human:unknown`. Sources (2) and (3) MUST emit warning `AGSC-E506`.
  - **`title`** — the text of the first ATX `#` heading if the file has one, else the filename stem; NFC-normalized and trimmed. Longer than 120 UTF-16 code units it MUST be clipped to 120 (warning `AGSC-E506`); shorter than 3 it MUST be replaced by the item slug, and if that is still shorter than 3 by `note-<slug>`.

  `README.md`, `index.md` and `_index.md` MUST NOT be adopted (AGSC-01-05): they are skipped with warning `AGSC-E506`, not turned into items, however common they are in a bare folder. [PRD-053 ← D48(5), V2-19]
- **AGSC-02-91** Adoption MUST be idempotent: it MUST NOT modify a file that already carries a **closed** frontmatter block (a `---` first line whose block is terminated by a later `---` line, AGSC-02-01); a file merely *beginning* with a thematic break is adopted like any other bare file. The slug is the slugified filename stem — NFC, ASCII-lower-cased, characters outside `[a-z0-9]` replaced by `-`, runs collapsed, leading and trailing `-` trimmed, clipped to 64 and any resulting trailing `-` trimmed, empty result becoming `note` — and the file MUST be renamed to `<slug>.md` under `content/concepts/`; when the slug differs from the original stem a warning `AGSC-E506` MUST be emitted. The original repository-relative path is recorded in `aliases[]` by AGSC-02-93 — one alias rule, not two. A slug already taken MUST be suffixed `-2`, `-3`, … in discovery order, the convention of AGSC-01-23 (the anchor suffixes of AGSC-03-13 govern anchors only), re-checking after each suffix. Headings never determine a slug. [PRD-053 ← D48(5), AGSC-01-23]
- **AGSC-02-92** Adopted items pass lint with warnings (no `description` — `AGSC-E408` by AGSC-02-21 — no `sources[]`, plus any `AGSC-E506` above) but MUST NOT error: the drop-in path is a first-class conformance scenario (class: full engine). Totality is complete, not partial: AGSC-02-90 and AGSC-02-91 are total functions, `description` is schema-optional in every branch, and AGSC-02-93 puts the file where AGSC-01-02/03 require it — so **no** adopted file can produce `AGSC-E201`, `AGSC-E202`, `AGSC-E204`, `AGSC-E205` or `AGSC-E206`, and `ci` on a folder of bare notes is green offline. [PRD-053, R24 ← D48(5), V2-01]
- **AGSC-02-93** `init` in adoption mode MUST create `content/concepts/` and MOVE each adopted file to `content/concepts/<slug>.md`, preserving body bytes; the original repository-relative path MUST be recorded in `aliases[]`; a file already under `content/<type-plural>/` MUST NOT be moved. Nested source directories are flattened (`notes/agents.md` → `content/concepts/agents.md`); collisions follow AGSC-01-23. Without this move a build discovers nothing under `content/**` or reports `AGSC-E205`, and the three-command promise of PRD-053 does not close. [PRD-053 ← V2-02, AGSC-01-01/02/03]

- **AGSC-02-94** In adoption mode `init` MUST also synthesize, when absent, files that **validate against their own schemas**, so that `ci` exits 0 immediately after `init` (the P0 flow): (a) `agsc.config.json` with `spec_version` (current), `site.base = "http://localhost/"` — the development placeholder AGSC-01-19 admits, warned as `AGSC-E506` — `site.title` = the title of (b), `bundle.id` = the directory name through the slug rule of AGSC-02-91, `bundle.operator` = the resolved actor (AGSC-02-90), `build.out = "www/"`; (b) `content/index.md` with `spec_version` (current), `okf_version: "0.2"`, `title` = the directory name through the **title** rule of AGSC-02-90 (so the 3–120 bound always holds), `description` = `"Adopted from <n> Markdown files by agsc init on <SOURCE_DATE_EPOCH date>."` (≥40 UTF-16 code units by construction) and `base` = `site.base`. Existing files are never overwritten, and every synthesized value is schema-valid by construction — `adopt-0004` proves `init` → `ci` exits 0 on a bare folder. [PRD-053, AGSC-01-04, AGSC-01-19 ← D52(1), V3-01]

- **AGSC-02-95** After the relocation of AGSC-02-93, `init --adopt` MUST report every relative Markdown link or image reference in an adopted body that no longer resolves from `content/concepts/` as warning **`AGSC-E507`**, naming the original path, the new path and the reference; and it MUST copy each referenced local file whose path resolves **under the adoption root** to `content/assets/<original-relative-path>`, byte for byte. Body bytes MUST NOT be rewritten — AGSC-02-90's byte-identity guarantee is absolute, so the warning and the copied asset, never a rewritten reference, are what close the gap the flattening opens. A reference that is an absolute URL, a fragment-only target, a `mailto:` or a path resolving outside the adoption root is left alone and MUST NOT be reported. `AGSC-E507` is a warning: an adopted Bundle with broken references still passes `ci` (AGSC-02-92). [PRD-053 ← D61(1), AGSC-02-90/02-93, V5-3 S3-01]
