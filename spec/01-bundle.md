# AGSC-01 — Bundle: files, folders, encoding, configuration

## 1.1 Layout

- **AGSC-01-01** A Bundle MUST be a directory tree containing `content/` and exactly one `agsc.config.json` at its root. One repository is one Bundle. [audit/D §1.1, D32(4)]
- **AGSC-01-02** Items MUST live at `content/<type-plural>/<slug>.md` where `<type-plural>` ∈ `concepts`, `episodes`, `procedures`, `lessons`, `clusters`, `gates`. [audit/D §1.1, G02]
- **AGSC-01-03** The `type` key in frontmatter is authoritative and MUST match the containing folder; a mismatch is an error (`AGSC-E205`). [audit/D §1.1]
- **AGSC-01-04** `content/index.md` is the Bundle root document. It MUST carry `spec_version`, `okf_version`, `title` and `description`, and it MUST NOT carry `type`; it is not an item and does not enter the graph as an item. [audit/D §1.1, OKF v0.2]
- **AGSC-01-05** `index.md` MAY exist in any folder (OKF reserved). `_index.md` and `README.md` MUST NOT be used as items. [research/12 §P rule 3]
- **AGSC-01-06** Non-knowledge site pages live in `site/*.md`, outside `content/`. They are rendered but MUST NOT appear in the graph, in `search.json` or in `llms.txt` item lists. [audit/D §1.1, G40]
- **AGSC-01-07** Diagram sources live at `content/diagrams/<slug>.diagram`. A compiled `.svg` MUST NOT be committed; it is produced into the build output. [audit/D §2.2, D20]
- **AGSC-01-08** `www/` (build output) and `dist/` (proposals, harnesses, gate verdicts) are generated. An implementation MUST NOT read them as input to a build. [audit/D §2.2, D47]
- **AGSC-01-09** A Harness MUST NOT be written under `content/`. [audit/D §1.1]

## 1.2 Slugs and identity

- **AGSC-01-10** A slug MUST match `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` and MUST NOT contain `--`. Length is 1–64 characters. [research/12 §P rule 2 as corrected; Agent Skills name rule]
- **AGSC-01-11** The slug is the file stem, the value of `id` when present, and the last path segment of the item IRI. Slugs MUST be unique across the whole Bundle regardless of folder (`AGSC-E206`). [research/12 §P rule 2, audit/D §1.1]
- **AGSC-01-12** A slug is permanent. A renamed or superseded item keeps its slug; the new item gets a new slug and the relationship is expressed with `supersedes` (§03). Reuse of a retired slug is an error. [PRD-018 ← R40]
- **AGSC-01-13** Language variants are `<slug>.<lang>.md` with `lang` a lowercase BCP 47 tag equal to the file's `lang` key; the unsuffixed file is the default. Variants are DEFERRED at 1.x: a suffixed file MUST be rejected with `AGSC-E205` unless the implementation declares i18n support. [research/12 §P rule 4, G27]

## 1.3 Encoding

- **AGSC-01-14** Every `.md`, `.json`, `.ttl` and `.diagram` file MUST be UTF-8 without BOM, MUST use LF line endings, MUST be NFC-normalized, and MUST end with exactly one LF (`AGSC-E108`). [research/12 §P rule 1, Art. XII]
- **AGSC-01-15** File discovery order MUST be a code-point sort of the repository-relative path. Locale collation MUST NOT be used. [research/12 §P rule 24]
- **AGSC-01-16** An input file larger than 1 MiB MUST be refused with `AGSC-E904`. Archives MUST be refused entirely (`AGSC-E903`), and any path escaping the Bundle root MUST be refused with `AGSC-E902`. [PLAN §11 R7, research/17 §1.9]

## 1.4 Configuration

- **AGSC-01-17** A Bundle MUST have exactly one configuration file, `agsc.config.json`, validated against `schema/config.schema.json`. A second configuration file MUST NOT be introduced. [PRD-006 ← R44, D32(4)]
- **AGSC-01-18** Its keys are `spec_version`, `site{base,title,tagline,author,analytics_token}`, `bundle{id,license_prose,license_schema}`, `ns{base,version}`, `releases{}`, `tags{allowed[]}`, `build{out,search,rdfxml,feed}`, `lint{injection_patterns[]}`. Unlike item frontmatter, configuration is closed: an unknown key is `AGSC-E004`. [audit/D §2.3, PRD-006]
- **AGSC-01-19** `build.out` MUST default to `www`. `site.base` MUST be an absolute `https:` origin without a trailing slash and is the IRI base of every item (§05). [D47, D41]
- **AGSC-01-20** `releases` is a boolean switchboard: an item carrying `release: <key>` is published only when `releases[<key>]` is `true`. An item with no `release` is always published. [PRD-021 ← R8]
- **AGSC-01-21** `tags.allowed` is the closed tag vocabulary; a tag outside it MUST be reported (`AGSC-E203`). [audit/D §1.2]

## 1.5 Import tolerance

- **AGSC-01-22** Import of a foreign OKF v0.2 bundle MUST accept unknown `type` values (mapped to `concept` with a warning), unknown keys, missing optional fields, missing `index.md` and broken links. A broken internal link is a Gate failure for the Bundle's own build but MUST NOT reject an import. [research/12 §P rules 30, 31]
- **AGSC-01-23** Import MUST be deterministic and idempotent: re-running it over unchanged input MUST produce byte-identical output and MUST NOT create duplicate items. Colliding slugs MUST be suffixed `-2`, `-3`, … in discovery order. [PRD-021]
- **AGSC-01-24** Import MUST refuse a source record carrying a non-empty `bookRef` field (`AGSC-E405`). [PRD-021 ← W1/W11, Art. XIII]
