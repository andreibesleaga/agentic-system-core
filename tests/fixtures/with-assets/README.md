# `with-assets` — the AGSC-03-11 asset branch, on disk

A Bundle that carries a real file under `content/assets/` and an item whose body
references it with `..` segments, which is the only way an item under
`content/<type-plural>/` can reach that directory (AGSC-01-35).

It exists to exercise the asset branch of AGSC-03-11 — "an existing asset under
`content/assets/`" — on disk: `links.resolve` reads the asset set from
`options.assets`, and a caller that does not supply it turns every body image
reference to a real asset into `AGSC-E310`. The Bundle is separate from
`tests/fixtures/minimal` so that the golden build of that fixture keeps its bytes.

Fixed clock: `SOURCE_DATE_EPOCH=1767225600` (2026-01-01T00:00:00Z).

This Bundle lints and builds clean: AGSC-06-01 emits every referenced asset at
`/assets/<path>`, byte for byte, and vector `build-0017` builds it twice to identical
bytes (AGSC-04-02).
