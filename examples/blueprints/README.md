# `examples/blueprints/` — three worked blueprints

**Summary.** Three small Bundles, each holding one saved architecture: a selection of
items kept as a concept of `kind: architecture`. `agsc compose --from <slug> --brief`
turns each into a blueprint, written beside the Harness in `blueprint/`: the C4 levels 1
to 3 as Mermaid diagrams, one decision record for each decision a selected item names
with `decided-by`, and a build plan with one step per item, in dependency order, each
with the check that proves it. Every file of a blueprint comes from the items; none is
typed by hand.

**Read with:** [docs/guides/mode-4.md](../../docs/guides/mode-4.md), the part on saved
architectures.

| Folder | The design it describes | Architecture slug |
|---|---|---|
| [engine/](engine/README.md) | the AgenticSystemCore engine itself: its contexts and layers in the order the dependency rule allows | `agenticsystemcore-engine` |
| [linked-sites/](linked-sites/README.md) | two knowledge sites, built from two Bundles, that name each other as peers | `two-linked-sites` |
| [tool-server/](tool-server/README.md) | a local agent tool server over a knowledge node, a client, the same tools on the published pages, and the HTTP transport | `tool-server-and-client` |

Each folder's README ends with **Build from this**: a dry run, offline and with no
model, that checks the Bundle (`agsc lint`, `agsc ci`, `agsc conform --level 2`), writes
the blueprint, shows that two runs write the same bytes, and then carries out the plan's
checks. `tests/examples/blueprints.test.js` runs every one of those commands and compares
what they print with the lines the README quotes.

```bash
node --test tests/examples/blueprints.test.js   # all three, offline
```

Each decision record quotes its decision's own text, which lists the options that were
considered and why the others lost. A decision record written by `compose` leaves its
`### Consequences` heading to be filled in; the consequences are in the quoted text.
