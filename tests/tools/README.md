# `tests/tools/`

**Summary.** Tests of each shipped checker and generator on good and bad input, with no import from `src/`, and of the maintainer tools (among them `build-ts`, the compiler of the TypeScript parts, on scratch trees that reach the repository's `node_modules/` through a directory junction). Subject: `tools/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/tools/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.

`validate-ontology-parity.test.js` runs `tools/validate-ontology` and the engine's
`src/knowledge/domain.js` over the same site vocabularies (AGSC-05-38) and requires the same
findings from both: the rules exist twice because the tool may not import `src/` (AGSC-09-90),
so a change to one copy fails this test until the other copy follows.
