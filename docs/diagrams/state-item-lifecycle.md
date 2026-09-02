# Item lifecycle — status state machine

```mermaid
stateDiagram-v2
  [*] --> draft: item authored, prov required

  draft --> stable: status set to stable (default value)
  stable --> deprecated: status set to deprecated
  draft --> deprecated: status set to deprecated

  deprecated --> [*]: retired, slug never reused

  stable --> stable: supersedes/superseded-by attached\n(new item supersedes old; old marked superseded-by new)

  note right of deprecated
    On retire: build emits a `_redirects` entry
    for the old slug (R40). The slug itself is
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

Three `status` values only (`draft | stable | deprecated`, default `stable` per audit/D §1.2); there is
no `archived` or `deleted` state — deletion is out of scope, retirement is `deprecated` + redirect.
`supersedes`/`superseded-by` is a Link-key edge (audit/D §1.3), orthogonal to `status`, shown as a
self-loop annotation because it does not change which of the three states an item is in.

Trace: PRD-018, R40 · audit/D §1.1 (status), §1.2 (status/`release` table), §1.3 (`supersedes` row).
