# AGSC-03 — Links: the nine keys, inverses, combiner semantics

## 3.1 The closed vocabulary

- **AGSC-03-01** Typed Links MUST be frontmatter arrays whose key is one of exactly nine names: `related`, `broader`, `narrower`, `uses`, `requires`, `excludes`, `derived-from`, `contradicts`, `supersedes`. No tenth key exists at `spec_version` 1.x. [PRD-002 ← D41, G04, research/16 §3.3]
- **AGSC-03-02** Each value MUST be a slug, optionally `<slug>#<anchor>`. Targets MUST resolve by exact slug — no suffix search, no case folding, no path guessing. An unresolved target is `AGSC-E301`. [research/12 §P rules 10, 16]
- **AGSC-03-03** An unknown link-shaped key MUST be preserved and reported as a warning (`AGSC-E304`); it MUST NOT be treated as one of the nine. [research/12 §P rule 10]

| Key (authored) | Inverse (computed) | Symmetric | RDF property | Combiner | Lint |
|---|---|---|---|---|---|
| `related` | `related` | yes | `skos:related` | advisory | — |
| `broader` | `narrower` | no | `skos:broader` | none | no cycles |
| `narrower` | `broader` | no | `skos:narrower` | none | no cycles |
| `uses` | `used-by` | no | `asc:uses` (⊑ `skos:related`) | soft: warn if target absent | — |
| `requires` | `required-by` | no | `dcterms:requires` / `dcterms:isRequiredBy` | hard: closure adds target | no cycles |
| `excludes` | `excludes` | yes | `asc:excludes` | hard: mutex after closure | — |
| `derived-from` | `derivation-of` | no | `prov:wasDerivedFrom` | none | target must exist |
| `contradicts` | `contradicts` | yes | `asc:contradicts` | warn if both selected | — |
| `supersedes` | `superseded-by` | no | `dcterms:replaces` / `dcterms:isReplacedBy` | superseded item hidden | target must exist |

## 3.2 Inverses

- **AGSC-03-04** Inverses MUST be computed at build and MUST NOT be authored. A file carrying an inverse name (`narrower` is authored, `used-by`, `required-by`, `derivation-of`, `superseded-by` are not) as a key MUST be reported (`AGSC-E306`). [audit/D §1.3, PRD-002]
- **AGSC-03-05** For symmetric keys (`related`, `excludes`, `contradicts`) the engine MUST materialize the edge in both directions even when only one side authored it. [audit/D §1.3]
- **AGSC-03-06** `broader` and `narrower` are mutual inverses; asserting both directions between the same pair MUST be idempotent, not duplicated. [audit/D §1.3]

## 3.3 Cycles and integrity

- **AGSC-03-07** `requires` MUST be acyclic. A cycle is error `AGSC-E302` and MUST name every slug on the cycle in discovery order. [audit/D §1.3, PRD-036]
- **AGSC-03-08** `broader`/`narrower` MUST be acyclic (`AGSC-E303`). A cluster MUST have at most one `broader`, giving a mono-parent tree of depth ≤3 (family › deck › sub-deck). [audit/D §1.3, research/16 §3.5]
- **AGSC-03-09** `derived-from` and `supersedes` targets MUST exist; a dangling target is `AGSC-E301`, not a warning. [audit/D §1.3]
- **AGSC-03-10** An item with no inbound Link and no `clusters[]` entry MUST be reported as an orphan warning (`AGSC-E305`). [research/16 §3.4 CQ7]

## 3.4 Inline links and wikilinks

- **AGSC-03-11** Inline Markdown links between items produce untyped graph edges `asc:mentions`. `mentions` is not a Link key and MUST NOT appear in frontmatter. [audit/D §1.3, research/16 §3.3]
- **AGSC-03-12** Wikilinks `[[target(#anchor)?(|alias)?]]` MAY appear in authored files and MUST be normalized by `lint --fix` to relative Markdown links `[alias](../<type-plural>/<slug>.md#anchor)`. `![[…]]` embeds MUST be converted to images or removed. Dendron's reversed `[[alias|note]]` order MUST NOT be assumed without an explicit import flag. [research/12 §P rule 15]
- **AGSC-03-13** Heading anchors MUST be computed as: NFC → ASCII lowercase → remove characters outside `[a-z0-9 -]` → spaces to `-` → collapse repeated `-`; duplicates get `-1`, `-2`, … in document order. [research/12 §P rule 17]

## 3.5 Combiner semantics (normative for §07)

- **AGSC-03-14** `requires` is the only key that adds items to a selection (transitive closure). [PRD-036 ← R6]
- **AGSC-03-15** `excludes` is evaluated **after** the closure. Any surviving pair related by `excludes` invalidates the composition (`AGSC-E801`). [PRD-036]
- **AGSC-03-16** `contradicts` between two selected items and a `uses` target absent from the selection produce warnings, never failures. [PRD-036]
- **AGSC-03-17** An item reachable only through `supersedes` from a selected item MUST be hidden from the selection; the superseding item is kept. [PRD-036]
- **AGSC-03-18** `related`, `broader`, `narrower` and `derived-from` MUST NOT change a composition; they are navigational or provenance edges. [PRD-036, D43(4)]

## 3.6 Import mapping

- **AGSC-03-19** Foreign link names MUST be mapped on import, not added to the vocabulary: `refines` → `narrower`; `alternative-to`, `conflicts-with` → `excludes`; `composed-of` → `uses`; `mitigates` → `related`; combiner `oneOf` → pairwise `excludes`; `recommends` → `uses`. [audit/D §1.3, G04]
- **AGSC-03-20** Mode-2 typed links (`implements`, `verifies`, `covers`, `blockedBy`, `decidedBy`) are not defined at 1.x; they MUST be imported as `related` or `derived-from` with a warning. [audit/D §1.3, G06]
- **AGSC-03-21** Links are the only stored relations. Embeddings, spreading activation, transclusion and bi-temporal edges MUST NOT be introduced. [D43(4)]
