# `engine/` — a blueprint of the engine itself

**Summary.** A small Bundle that describes how the AgenticSystemCore engine is put
together: its bounded contexts and layers, the check that proves each one, the decisions
they rest on and the outside systems they meet. `agsc compose --from
agenticsystemcore-engine --brief` turns it into a blueprint: three C4 diagrams, one
decision record per decision and a build plan. Nothing in the blueprint is typed by hand;
every file comes from the items below. Someone writing a port of the engine can follow
the plan step by step and run the named check after each step.

**Read with:** [docs/guides/mode-4.md](../../../docs/guides/mode-4.md) (saved
architectures and blueprints) and the engine's own architecture page,
[docs/ARCHITECTURE-DDD.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md),
from which these items are taken.

## What is in the folder

| Path | What it holds |
|---|---|
| `content/concepts/agenticsystemcore-engine.md` | the saved architecture: the selection, in a `yaml agsc-selection` block |
| `content/concepts/` (ten parts) | `shared-kernel`, `ports`, `adapters`, the six contexts `knowledge`, `governance`, `composition`, `boundary`, `interchange`, `distribution`, and `application-layer`; each `requires` what the engine's dependency rule lets it require |
| `content/procedures/` | eight checks; each `verifies` the part it proves and `requires` it |
| `content/concepts/decision-*.md` | six decisions; each body lists the options that were considered and why the others lost |
| `content/concepts/` (six outside systems) | `markdown-bundle`, `forge`, `static-host`, `peer-nodes`, `other-tools-formats`, `mcp-sdk`: listed, never selected, reached through `uses` |

How the three C4 levels read here. Level 1 draws the engine as one box with the outside
systems and the decisions around it. The engine is one program, so level 2 draws the
parts it is built from, the contexts and layers, with the `requires` edges of
[`.dependency-cruiser.js`](https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js);
it is the picture the engine's own
[component diagram](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-component.md)
shows. Level 3 places each check inside the part it proves.

## Build from this

Set the folder and the architecture, run the two blocks of
[the common steps](../README.md#the-common-steps) (copy the folder and check it, then show
that two runs write the same bytes), and go on below in the same shell:

```bash demo
export BLUEPRINT=engine ARCHITECTURE=agenticsystemcore-engine
```

Write the blueprint. The seven warnings are the six outside systems, each named under
`uses` and never added to the selection: that is what keeps them outside the box.

```bash demo
agsc compose --from agenticsystemcore-engine --brief --zip 2>&1 | grep '^compose:'
blueprint="$(ls -d dist/harness/*.companion)/blueprint"
ls "$blueprint" "$blueprint/decisions"
sed -n '/^### Step/p' "$blueprint/build-plan.md" | head -4
```

```text expect
compose: pass (0 error, 7 warn)
build-plan.md
c4-components.mmd
c4-containers.mmd
c4-context.mmd
decisions
0001-decision-dependency-rule.md
0002-decision-files-only-adapters.md
0003-decision-ledger-from-git.md
0004-decision-no-network-in-build.md
0005-decision-no-reasoner-at-build.md
0006-decision-official-mcp-sdk.md
### Step 1 — adopt `ports`
### Step 2 — adopt `shared-kernel`
### Step 3 — adopt `adapters`
### Step 4 — adopt `knowledge`
```

Each record is numbered in the order of its slug and quotes the decision's own text, so
the options that were considered, and why the others lost, travel with it.

Now follow the plan. Each step names the check that proves it. The checks below run
against this engine, so a port shows what passing looks like; run the same commands with
your port's command line in place of `agsc`. Distribution and Governance, on this Bundle:

```bash demo
node "$ENGINE/tools/validate-wellknown" www/.well-known/knowledge-linkset --level 2 | tail -1
agsc verify --ledger | tail -1
```

```text expect
validate-wellknown pass (level 2): 13 input file(s) read, 0 error(s), 0 warning(s)
verify: pass (0 error, 0 warn)
```

Interchange: export the Bundle and import it into a fresh one twice. Imported items are
drafts in the new node, so each import also prints one warning per item:

```bash demo
cp "$ENGINE/LICENSE-CONTENT" . && agsc export --okf | tail -1
mkdir ../fresh && cd ../fresh && agsc init > /dev/null 2>&1
agsc import ../engine/dist/export/okf --from okf 2>&1 | grep 'written,'
agsc import ../engine/dist/export/okf --from okf 2>&1 | grep 'written,'
cd ../engine
```

```text expect
export: pass (0 error, 0 warn)
import: 32 written, 0 replaced, 0 unchanged
import: 0 written, 0 replaced, 32 unchanged
```

Boundary: two nodes that name each other pass the mutual check, on two local files. The
nodes are the engine's own memory demo:

```bash demo
cp -r "$ENGINE/examples/demos/mode-1-memory" ../peers && cd ../peers
for n in a b; do (cd $n && git init -q -b main && git add -A && git commit -q -m "node $n" && agsc build > /dev/null 2>&1); done
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset | tail -1
cd ../engine
```

```text expect
validate-wellknown pass (level 2): 26 input file(s) read, 0 error(s), 0 warning(s)
```

Composition is proved by the compose step above. The last three checks need the
engine's repository with its development dependencies, so they are shown and not run
here:

```bash
npm ci
node --test "tests/ports/*.test.js" "tests/adapters/*.test.js"   # run-the-port-tests
npm run arch                                                     # check-the-dependency-rule
agsc conform --level 2                                           # run-the-conformance-vectors, in any Bundle
```

## Change the blueprint

Edit an item, run `agsc lint`, and compose again: the diagrams, records and plan follow.
Add a part by writing a concept with `kind: spec`, listing it in the selection and naming
what it `requires`; add a decision by writing a concept with `kind: decision` whose body
lists the options, and name it under `decided-by` on the part it shapes.
