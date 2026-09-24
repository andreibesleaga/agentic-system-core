# Item lifecycle — status state machine

**What this shows.** The three values an item's `status` can take — draft, stable and deprecated — and every transition between them. `supersedes` is drawn as a self-loop because it is a Link, not a change of state.

```mermaid
stateDiagram-v2
  [*] --> stable: item authored with no status (default, AGSC-02-23)
  [*] --> draft: item authored with status: draft

  draft --> stable: status set to stable
  stable --> draft: status set back to draft
  stable --> deprecated: status set to deprecated
  draft --> deprecated: status set to deprecated

  deprecated --> stable: un-deprecated (legal — lint warns AGSC-E409)
  deprecated --> draft: un-deprecated to draft (legal — lint warns AGSC-E409)

  stable --> retired: status set to retired (AGSC-11-22)
  draft --> retired: status set to retired (AGSC-11-22)
  deprecated --> retired: status set to retired (AGSC-11-22)
  retired --> stable: un-retired (legal — warned like un-deprecation)
  retired --> [*]: slug never reused

  stable --> stable: supersedes/superseded-by attached (new item supersedes old — old marked superseded-by new)

  note right of deprecated
    On retire: build emits a `_redirects` entry
    for the old slug. The slug itself is
    NEVER reused by any future item, even after
    the old page is gone from nav.
  end note

  note right of stable
    `supersedes` (authored on the NEW item) and
    its computed inverse `superseded-by` (on the
    OLD item) are independent of `status`: an item
    can be superseded while still `stable` until
    the owner also deprecates it.
  end note
```

Four `status` values (`draft | stable | deprecated | retired`, default `stable` — an item
authored without a `status` therefore *starts* stable, and every transition including `deprecated` →
`stable` is legal, warned but never rejected, per AGSC-02-23); `retired` was added at rc.3 by
AGSC-11-22 — a retired item keeps its page and its canonical IRI, carries a visible retirement notice,
leaves `search.json`, `/chunks.jsonl`, `/llms.txt`, skill packs and every composition selection, and stays
in the graph exports with `asc:retiredAt`. There is no `archived` or `deleted` state — deletion is out of scope.
`supersedes`/`superseded-by` is a Link-key edge, orthogonal to `status`, shown as a
self-loop annotation because it does not change which of the four states an item is in.

Trace: PRD-018.
