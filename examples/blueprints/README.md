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
model, that checks the Bundle (`agsc lint`, `agsc ci`, `agsc conform --level 2`), shows
that two runs write the same bytes, writes the blueprint, and then carries out the plan's
checks. The two steps every blueprint shares are written once, below under
[The common steps](#the-common-steps); each README sets its folder and architecture,
sends you there, and goes on with its own steps. `tests/examples/blueprints.test.js` runs
every one of those commands in that order and compares what they print with the lines the
pages quote.

```bash
node --test tests/examples/blueprints.test.js   # all three, offline
```

Each decision record quotes its decision's own text, which lists the options that were
considered and why the others lost. A decision record written by `compose` leaves its
`### Consequences` heading to be filled in; the consequences are in the quoted text.

## The common steps

Every command below runs offline, needs no model and no account, and is run by
`tests/examples/blueprints.test.js` with the build instant fixed: each block prints at least the lines
quoted after it (other lines are left out). `$ENGINE` is the folder of this repository,
or of the installed `agentic-system-core` package from 1.1 on (a 1.0 release has no
`compose --from` and no `--http`); `agsc` is its command line. `$BLUEPRINT` and `$ARCHITECTURE` are the folder and the
architecture slug that the blueprint's README sets. A commit needs a git
identity, so the opening block sets one for this shell.

Copy the folder, give it a git history (a Level 2 node derives its ledger from it), and
run the three checks a node must pass:

```bash demo
export SOURCE_DATE_EPOCH=1789380000
export GIT_AUTHOR_NAME=Operator GIT_AUTHOR_EMAIL=operator@example.org GIT_COMMITTER_NAME=Operator GIT_COMMITTER_EMAIL=operator@example.org
cp -r "$ENGINE/examples/blueprints/$BLUEPRINT" . && cd "$BLUEPRINT"
git init -q -b main && git add -A && git commit -q -m "$BLUEPRINT blueprint"
agsc lint | tail -1
agsc ci | tail -1
agsc conform --level 2 | tail -1
```

```text expect
lint: pass (0 error, 0 warn)
ci: pass (0 error, 0 warn)
conform: pass (0 error, 0 warn)
```

The same input writes the same bytes. Compose twice and build twice, and compare:

```bash demo
agsc compose --from "$ARCHITECTURE" --brief --zip > /dev/null 2>&1
blueprint="$(ls -d dist/harness/*.companion)/blueprint"
cp -r "$blueprint" ../blueprint-1 && cp dist/harness/*.zip ../harness-1.zip
rm -rf dist/harness && agsc compose --from "$ARCHITECTURE" --brief --zip > /dev/null 2>&1
diff -r ../blueprint-1 "$blueprint" && cmp ../harness-1.zip dist/harness/*.zip && echo "blueprint and archive: same bytes"
agsc build > /dev/null 2>&1 && mv www ../www-1 && agsc build > /dev/null 2>&1
diff -r ../www-1 www && echo "site: same bytes"
```

```text expect
blueprint and archive: same bytes
site: same bytes
```

On the built site, the page of the architecture links `/compose/?from=<architecture slug>`,
where a browser shows the same brief and offers it, with the blueprint, as an archive to
download. `--zip` writes the Harness archive beside the Harness folder; the blueprint
folder sits beside it, never inside it.
