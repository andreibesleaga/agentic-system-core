# `tests/knowledge/`

**Summary.** Unit tests of parsing, validation, slugs, canonical JSON, links, the four RDF views, chunks, adoption, the content version, the diagram compiler, the SHACL Core evaluator of a site's invariants (with its pySHACL lane, `shacl-core-lane.test.js`, skipped without `AGSC_SHACL_PYTHON`), the competency questions of a site and the check that joins both (`competency.test.js`, `site-checks.test.js`), the bounded contexts and peer addresses (`contexts.test.js`), the shared kernel's `--version` line compiled from TypeScript (`version-line.test.js`), and, from 1.1, the chunk record's new members, the blank-line rule and the set commitment (`chunks-1-1.test.js`), the tabular chunk index (`chunks-index.test.js`) and the RFC 9530 digest value written through the Structured Fields library (`digest-field.test.js`). Subject: `src/knowledge/` and `src/shared/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md).

```bash
node --test "tests/knowledge/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
