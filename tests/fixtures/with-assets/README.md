# `with-assets` — the AGSC-03-11 asset branch, on disk

A Bundle that carries a real file under `content/assets/` and an item whose body
references it with `..` segments, which is the only way an item under
`content/<type-plural>/` can reach that directory (AGSC-01-35 as amended at rc.5).

It exists because the asset branch of AGSC-03-11 — "an existing asset under
`content/assets/`" — was UNREACHABLE until rc.5: `links.resolve` read the asset set
from `options.assets` and no caller supplied it, so every body image reference to a
real asset was `AGSC-E310` (FV28-03). The Bundle is separate from
`tests/fixtures/minimal` so that the golden build of that fixture keeps its bytes.

Fixed clock: `SOURCE_DATE_EPOCH=1767225600` (2026-01-01T00:00:00Z).

**This Bundle lints clean and does NOT build clean**, on purpose. AGSC-06-01's route
set carries `/attachments/<slug>/<file>` and no `/assets/**` route, so the asset this
item references is emitted nowhere and the dangling-link guard reports `AGSC-E901`
for it (FIX-28 item 56 / FIX28-01 on `GABBE/project/SPEC-ITEMS-FOR-1.0.0.md`: AGSC-03-11
and AGSC-06-01 are jointly unsatisfiable for any Bundle with an asset, and the fix is
the owner's). Only `lint` is asserted over it.
