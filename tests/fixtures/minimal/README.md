# tests/fixtures/minimal — a conforming Bundle

The smallest Bundle that satisfies AGSC-01 and AGSC-02: one `agsc.config.json`, one
`content/index.md`, two `concept` items and one `cluster`, every file UTF-8, LF,
NFC, one trailing LF (AGSC-01-14), every frontmatter key in the schema order of
AGSC-04-19 so that `lint --fix` is a no-op.

A foreign port may use it as its own smoke fixture: build it with
`SOURCE_DATE_EPOCH=1767225600`, and the output must be byte-identical between two
builds (AGSC-04-01, AGSC-04-02). Nothing here reads a clock or the network.
