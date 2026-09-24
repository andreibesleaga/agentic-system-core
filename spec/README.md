# `spec/` — the specification

**Summary.** The normative text of AgenticSystemCore: twelve chapters, `00-overview.md`
to `11-boundary.md`, each a list of numbered rules with the key words MUST, SHOULD and
MAY. With `schema/`, `ontology/` and `tests/vectors/`, this folder *is* the standard;
everything else in the repository implements, explains or checks it. Where any other
file disagrees with a rule here, the rule wins.

**Read first:** `00-overview.md` (the model, the item types, the version rules).
**Read next:** [docs/SPEC-ORIENTATION.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SPEC-ORIENTATION.md), which says how
the chapters fit, the reading order for each kind of reader and how a rule is written;
[docs/plain/](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/README.md) says the same in shorter sentences, one page
per chapter.

| Chapter | About |
|---|---|
| `00-overview.md` | scope, terms, versions, forward compatibility, plugin kinds |
| `01-bundle.md` | the folder, the configuration, import and export |
| `02-item.md` | an item: frontmatter keys, types, body, adoption |
| `03-links.md` | the fourteen Link keys, inverses, cycles |
| `04-canonicalization.md` | the byte rules: canonical JSON, ordering, the build instant, the content version |
| `05-graph.md` | the ontology and the four RDF views |
| `06-surfaces.md` | the route set, pages, discovery document, agent text files, search, chunks |
| `07-composition.md` | selection, closure, the Harness, skill packs |
| `08-governance.md` | provenance, lints, gates, the ledger, channels, agents |
| `09-conformance.md` | the command line, the diagnostics envelope, the error codes, the vectors |
| `10-implementation-profiles.md` | the four Levels, hosting, the live board |
| `11-boundary.md` | federation, visibility, the agent surfaces and their plugin contract |

## Check it

```bash
node tools/validate-spec --json     # status "pass"
node tools/count-artifacts --json   # rules, codes, vectors and terms, derived from these files
```

This folder is frozen between release candidates: a change is made only in a
specification pass, with a dated amendment note on the rule, and the rule id never
changes. A defect found here is reported (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
Licence: Apache-2.0.
