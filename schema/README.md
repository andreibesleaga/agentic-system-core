# `schema/` — the three JSON Schemas

**Summary.** The machine-checkable shape of the three documents a Bundle is made of,
in JSON Schema 2020-12: `item.schema.json` (the frontmatter of one item),
`bundle.schema.json` (the frontmatter of the Bundle's `content/index.md`) and
`config.schema.json` (the `agsc.config.json` file). They are part of the standard, with
`spec/`, `ontology/` and `tests/vectors/`; the rules in `spec/02-item.md` and
`spec/01-bundle.md` say what each key means.

**Read after:** [spec/README.md](../spec/README.md). The keywords the three schemas use
are listed in [src/README.md](../src/README.md) §4.

```bash
node tools/validate-schemas --json   # meta-validates the three against 2020-12
```

Frozen between release candidates, like `spec/`. Licence: CC0-1.0.
