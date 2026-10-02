# AGSC-03 — Links: the fourteen keys, inverses, combiner semantics

## 3.1 The closed vocabulary

- **AGSC-03-01** Typed Links MUST be frontmatter arrays whose key is one of exactly **fourteen** names — the **nine core** keys `related`, `broader`, `narrower`, `uses`, `requires`, `excludes`, `derived-from`, `contradicts`, `supersedes`, plus the **five Mode-2** keys `implements`, `verifies`, `covers`, `blocked-by`, `decided-by`. Only the core nine carry composition semantics (§3.5, §07); the Mode-2 five are navigational and provenance edges whose combiner semantics is `none`. No fifteenth key exists at `spec_version` 1.x; new keys arrive only through the `links_ext` registry of a future MINOR (docs/SPEC.md §8). [PRD-002]
- **AGSC-03-02** Each value MUST be a slug, optionally `<slug>#<anchor>`. Targets MUST resolve by exact slug — no suffix search, no case folding, no path guessing. An unresolved target is `AGSC-E301`. [design]
- **AGSC-03-03** An unknown link-shaped key MUST be preserved and reported as a warning (`AGSC-E304`); it MUST NOT be treated as one of the fourteen. A key is **link-shaped** when its name is `peer-ref` (reserved to a later version, AGSC-00-20), `mentions` (AGSC-03-11) or one of the foreign relation names AGSC-03-19 and AGSC-03-20 list; every other unknown key is the warning `AGSC-E207` of AGSC-02-05, so that one key never carries two codes. *(Amended 2026-10-02 for 1.0.0: "link-shaped" was used and never defined.)* [design]

| Key (authored) | Inverse (computed) | Symmetric | RDF property | Combiner | Lint |
|---|---|---|---|---|---|
| `related` | `related` | yes | `skos:related` | advisory | — |
| `broader` | `narrower` | no | `skos:broader` | none | no cycles |
| `narrower` | `broader` | no | `skos:narrower` | none | no cycles |
| `uses` | `used-by` | no | `asc:uses` (no super-property) | soft: warn if target absent | — |
| `requires` | `required-by` | no | `dcterms:requires` / `dcterms:isRequiredBy` | hard: closure adds target | no cycles |
| `excludes` | `excludes` | yes | `asc:excludes` | hard: mutex after closure | — |
| `derived-from` | `derivation-of` | no | `prov:wasDerivedFrom` | none | target must exist |
| `contradicts` | `contradicts` | yes | `asc:contradicts` | warn if both selected | — |
| `supersedes` | `superseded-by` | no | `dcterms:replaces` / `dcterms:isReplacedBy` | superseded item hidden | target must exist |
| `implements` | `implemented-by` | no | `asc:implements` | none | target must exist |
| `verifies` | `verified-by` | no | `asc:verifies` | none | target must exist |
| `covers` | `covered-by` | no | `asc:covers` | none | target must exist |
| `blocked-by` | `blocks` | no | `asc:blockedBy` | none | target must exist |
| `decided-by` | `decides` | no | `asc:decidedBy` | none | target must exist |

## 3.2 Inverses

- **AGSC-03-04** Inverses MUST be computed at build and MUST NOT be authored. A file carrying an inverse name (`narrower` is authored; `used-by`, `required-by`, `derivation-of`, `superseded-by`, `implemented-by`, `verified-by`, `covered-by`, `blocks`, `decides` are not) as a key MUST be reported (`AGSC-E306`). [PRD-002]
- **AGSC-03-05** For symmetric keys (`related`, `excludes`, `contradicts`) the engine MUST materialize the edge in both directions even when only one side authored it. [design]
- **AGSC-03-06** `broader` and `narrower` are mutual inverses; asserting both directions between the same pair MUST be idempotent, not duplicated. [design]

## 3.3 Cycles and integrity

- **AGSC-03-07** `requires` MUST be acyclic. A cycle is error `AGSC-E302` and MUST name every slug on the cycle in discovery order. [PRD-036]
- **AGSC-03-08** `broader`/`narrower` MUST be acyclic (`AGSC-E303`). A cluster MUST have at most one `broader`; the mono-parent tree it forms MUST be at most 3 levels deep (family › deck › sub-deck). Neither bound follows from the other, so both are checked separately, after the acyclicity check: nesting deeper than 3 levels (a chain of `broader` ancestors longer than 2) is error `AGSC-E307` naming the chain root-first; more than one `broader` value is error `AGSC-E308` naming every parent slug in code-point order, and the schema enforces this second bound as `maxItems: 1` on the cluster branch. [design]
- **AGSC-03-09** `derived-from` and `supersedes` targets MUST exist; a dangling target is `AGSC-E301`, not a warning. [design]
- **AGSC-03-10** An item with no inbound Link and no `clusters[]` entry MUST be reported as an orphan warning (`AGSC-E305`). A `clusters[]` entry **is** an inbound reference to the cluster it names, so a cluster that at least one item lists is never an orphan. [design]
- **AGSC-03-22** *(reserved: stated by AGSC-03-08, which gives both bounds and their codes; the id is never reused, AGSC-00-16.)*

## 3.4 Inline links and wikilinks

- **AGSC-03-11** Inline Markdown links between items produce untyped graph edges `asc:mentions`. `mentions` is not a Link key and MUST NOT appear in frontmatter. A relative Markdown link or image whose target is **inside** the Bundle MUST resolve to an existing item, an existing asset under `content/assets/`, or an existing anchor of one of them; an unresolved internal target is **`AGSC-E310`** (error), and this is the check that the `links` value of AGSC-08-11's gate compiles to. Two resolution questions are settled here: a target **without a file extension** resolves — both `<slug>` and `<slug>.md` name the same item, and the extension-less form is the one wikilink normalisation produces — and a target containing `..` segments is resolved relative to the file that carries it, `AGSC-E902` only when what it resolves to escapes the Bundle root and `AGSC-E310` when it stays inside and does not exist (AGSC-01-35). A link to an external origin is never resolved at build time — it is checked only by `refresh` (AGSC-04-11) — and a reference reported as `AGSC-E507` during adoption (AGSC-02-95) is `AGSC-E310` on every subsequent build, since adoption is a one-time warning and the Bundle is thereafter authored. [AGSC-08-11]
- **AGSC-03-12** Wikilinks `[[target(#anchor)?(|alias)?]]` MAY appear in authored files and MUST be normalized by `lint --fix` to relative Markdown links `[alias](../<type-plural>/<slug>.md#anchor)`. `![[…]]` embeds MUST be converted to images or removed. Dendron's reversed `[[alias|note]]` order MUST NOT be assumed without an explicit import flag. [design]
- **AGSC-03-13** Heading anchors MUST be computed as: NFC → ASCII lowercase → remove characters outside `[a-z0-9 -]` → spaces to `-` → collapse repeated `-` → **trim leading and trailing `-`**; an empty result becomes `section-<n>`, `<n>` being the 1-based document order of the heading among the headings whose anchor is empty. A duplicate anchor takes the suffix `-2`, then `-3`, … in document order, re-checking after each suffix and taking the next free one, so a suffixed anchor never collides with a naturally occurring anchor. Every anchor produced by this algorithm therefore matches `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` — no leading or trailing `-`, and never `--` — the `link_target` grammar of AGSC-03-02. [design]

## 3.5 Combiner semantics (normative for §07)

- **AGSC-03-14** `requires` is the only key that adds items to a selection (transitive closure). [PRD-036]
- **AGSC-03-15** *(reserved: stated by AGSC-07-06 together with the order of AGSC-07-08; the id is never reused, AGSC-00-16.)*
- **AGSC-03-16** *(reserved: stated by AGSC-07-07; the id is never reused, AGSC-00-16.)*
- **AGSC-03-17** *(reserved: stated by AGSC-07-05; the id is never reused, AGSC-00-16.)*
- **AGSC-03-18** `related`, `broader`, `narrower`, `derived-from` and the five Mode-2 keys (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`) MUST NOT change a composition; they are navigational or provenance edges. [PRD-036]

## 3.6 Import mapping

- **AGSC-03-19** Foreign link names MUST be mapped on import, not added to the vocabulary: `refines` → `narrower`; `alternative-to`, `conflicts-with` → `excludes`; `composed-of` → `uses`; `mitigates` → `related`; combiner `oneOf` → pairwise `excludes`; `recommends` → `uses`. [design]
- **AGSC-03-20** The Mode-2 typed links are **defined at 1.0** as keys 10–14 (AGSC-03-01): `implements`, `verifies`, `covers`, `blocked-by`, `decided-by`. Foreign spellings MUST be mapped on import — `blockedBy` → `blocked-by`, `decidedBy` → `decided-by`, `tests` → `verifies`, `traces-to` → `covers` — and their targets MUST exist (`AGSC-E301`); they never affect a composition (AGSC-03-18, AGSC-07-10). [design]
- **AGSC-03-21** Links are the only stored relations. Embeddings, spreading activation, transclusion and bi-temporal edges MUST NOT be introduced. [design]
