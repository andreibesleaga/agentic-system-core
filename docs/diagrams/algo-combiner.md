# Algorithm — combiner closure (`closure.js`, PLAN §6(c) step 3)

```mermaid
flowchart TD
  A["Input: selected item slugs\n(from /compose/ ticks or CLI: agsc compose <slugs>)\nde-duplicated, first-occurrence order kept for decisions/NNNN"]
  A --> B{"Step 1 — closure:\nunresolved 'requires' targets?\n(breadth-first, code-point slug order)"}
  B -- yes --> C["Add target(s); record the first-discovered\nexplanation path (source, key, target)"]
  C --> B
  B -- no --> D["Closure complete: closed selection set"]

  D --> E["Step 2 — hiding: remove every item that a\nmember of the closed selection 'supersedes'\n(directly selected or closure-added); never re-added"]
  E --> E2{"Does a survivor 'require'\nan item just hidden?"}
  E2 -- yes --> E3["AGSC-E802 'required item superseded —\nselect <superseding>' — INVALID\n(closure is not re-run; no substitution)"]
  E2 -- no --> F{"Step 3 — mutex: any pair related by\n'excludes' among the survivors?"}

  F -- yes --> G["AGSC-E801: name every violating pair\nand each side's explanation path (hard mutex)"]
  F -- no --> H["No mutex violation"]
  G --> I["Step 4 — warnings run regardless\n(contradicts / uses always evaluated)"]
  H --> I

  I --> J{"Any 'contradicts' pair\ninside the result?"}
  J -- yes --> K["Warn AGSC-E803 (non-fatal)"]
  J -- no --> L
  K --> L{"Any survivor's 'uses' target\nmissing from the result?"}
  L -- yes --> M["Warn AGSC-E803 (soft, advisory)"]
  L -- no --> N
  M --> N{"Any AGSC-E801 or AGSC-E802\nreported above?"}

  N -- yes --> O["Verdict: INVALID — no Harness emitted (exit 1)"]
  N -- no --> P["Verdict: VALID — selection[] = surviving set in\ncode-point order, plus added[], hidden[], warnings[]"]
  E3 --> N
```

Order is the normative order of `spec/07-composition.md` (AGSC-07-04…08) and of PLAN.md §6(c)
step 3: `requires` closure → `supersedes` hiding (with the AGSC-07-05a hard-dependency guard) →
`excludes` mutex over the **survivors** → `contradicts`/`uses` warnings. The order is not cosmetic:
evaluating `excludes` before hiding lets an item that Step 2 removes invalidate a composition that is
in fact valid — `tests/vectors/compose/compose-0001` is exactly that case. The same module runs
identically in the CLI (`src/composition/closure.js`) and in the browser (`www/js/agsc-core.js`, no
`node:` imports) — a vector asserts the two are byte-identical for the same input (PRD-038).

Trace: PRD-036, PRD-037, PRD-038 · D48(2) · audit/D §1.3 (Link "Combiner semantics" column) · PLAN.md §6(c).
