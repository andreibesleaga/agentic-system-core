# Algorithm — combiner closure (`closure.js`, PLAN §6(c) step 3)

```mermaid
flowchart TD
  A["Input: selected Concept slugs\n(from /compose/ ticks or CLI: agsc compose <slugs>)"]
  A --> B{"Unresolved 'requires'\ntargets in selection?"}
  B -- yes --> C["Add target(s); record explanation path\n(e.g. 'auto-added: supervisor <- required-by handoff')"]
  C --> B
  B -- no --> D["Closure complete: final selection set"]

  D --> E{"Any pair related by 'excludes'\nboth in the closed selection?"}
  E -- yes --> F["Report the violating pair\n(hard mutex)"]
  E -- no --> G["No mutex violation"]
  F --> H["Continue to warnings regardless\n(contradicts / uses always evaluated)"]
  G --> H

  H --> I{"Any pair related by 'contradicts',\nboth selected?"}
  I -- yes --> J["Warn: contradicting pair (non-fatal)"]
  I -- no --> K
  J --> K{"Any selected item's 'uses'\ntarget missing from selection?"}
  K -- yes --> L["Warn: missing 'uses' target (soft, advisory)"]
  K -- no --> M
  L --> M["Apply 'supersedes' hiding:\nremove any item superseded by\nanother selected item"]

  M --> N{"Mutex violation reported at step E?"}
  N -- yes --> O["Verdict: REJECTED — no Harness emitted"]
  N -- no --> P["Verdict: VALID — emit explained selection\n(final set + closure additions + all warnings)"]
```

Order follows PLAN.md §6(c) step 3 exactly: `requires` closure (hard, adds targets with an
explanation path) → `excludes` mutex check (hard, blocking) → `contradicts`/`uses` warnings (soft,
non-blocking, both always evaluated) → `supersedes` hiding (removes superseded items from the final
set). The same module runs identically in the CLI (`src/composition/closure.js`) and in the browser
(`www/js/agsc-core.js`, no `node:` imports) — a vector asserts the two are byte-identical for the same
input (PRD-038).

Trace: PRD-036, PRD-037, PRD-038 · audit/D §1.3 (Link "Combiner semantics" column) · PLAN.md §6(c).
