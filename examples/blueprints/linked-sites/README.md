# `linked-sites/` — a blueprint of two linked knowledge sites

**Summary.** A small Bundle that describes two knowledge sites, each built from its own
Bundle by a different person, that name each other as peers and cite each other by
address. `agsc compose --from two-linked-sites --brief` turns it into a blueprint: three
C4 diagrams, one decision record per decision and a build plan. Nothing in the
blueprint is typed by hand; every file comes from the items below. The plan is then
carried out on the two real nodes of the engine's memory demo,
[`examples/demos/mode-1-memory/`](../../demos/mode-1-memory/README.md).

**Read with:** [docs/guides/mode-4.md](../../../docs/guides/mode-4.md) (saved
architectures and blueprints) and Mode 1 of
[docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md),
from which the checks are taken.

## What is in the folder

| Path | What it holds |
|---|---|
| `content/concepts/two-linked-sites.md` | the saved architecture: the selection, in a `yaml agsc-selection` block |
| `content/concepts/bundle-a.md`, `bundle-b.md` | the two sources, Markdown in git, each naming the other site in `peers` |
| `content/concepts/site-a.md`, `site-b.md` | the two built sites; each `requires` its Bundle, and `site-a` is `related` to `site-b` once |
| `content/procedures/` | four checks; each `verifies` the part it proves and `requires` it |
| `content/concepts/decision-*.md` | four decisions; each body lists the options that were considered and why the others lost |
| `content/concepts/static-host.md`, `forge.md`, `assistant.md` | the outside systems: listed, never selected |

How the three C4 levels read here. Level 1 draws the pair as one box, with the static
host and the forge it `uses`, the assistant that reads it, and the decisions around it.
Level 2 draws the two Bundles and the two sites. Level 3 places each check inside the
part it is drawn to: the build and the citation in `bundle-a`, the peer check and the
cross-site read in `site-a`.

## Build from this

Every command below runs offline, needs no model and no account, and is run by
`tests/examples/blueprints.test.js` with the build instant fixed: each block prints at least the lines
quoted after it (other lines are left out). `$ENGINE` is the folder of this repository,
or of the installed `agentic-system-core` package from 1.1 on (a 1.0 release has no
`compose --from` and no `--http`); `agsc` is its command line. A commit needs a git
identity, so the opening block sets one for this shell.

Copy the folder, give it a git history, and run the three checks a node must pass:

```bash demo
export SOURCE_DATE_EPOCH=1789380000
export GIT_AUTHOR_NAME=Operator GIT_AUTHOR_EMAIL=operator@example.org GIT_COMMITTER_NAME=Operator GIT_COMMITTER_EMAIL=operator@example.org
cp -r "$ENGINE/examples/blueprints/linked-sites" . && cd linked-sites
git init -q -b main && git add -A && git commit -q -m 'linked sites blueprint'
agsc lint | tail -1
agsc ci | tail -1
agsc conform --level 2 | tail -1
```

```text expect
lint: pass (0 error, 0 warn)
ci: pass (0 error, 0 warn)
conform: pass (0 error, 0 warn)
```

Write the blueprint. The four warnings are the forge and the static host, each named
under `uses` by two parts and never added to the selection: that is what keeps them
outside the box.

```bash demo
agsc compose --from two-linked-sites --brief --zip 2>&1 | grep '^compose:'
blueprint="$(ls -d dist/harness/*.companion)/blueprint"
ls "$blueprint/decisions"
sed -n '/^### Step/p' "$blueprint/build-plan.md"
```

```text expect
compose: pass (0 error, 4 warn)
0001-decision-cite-through-sources.md
0002-decision-client-walks-the-peers.md
0003-decision-linkset-discovery-document.md
0004-decision-peers-name-each-other.md
### Step 1 — adopt `bundle-a`
### Step 2 — adopt `bundle-b`
### Step 3 — adopt `build-each-site`
### Step 4 — adopt `cite-the-other-site`
### Step 5 — adopt `site-a`
### Step 6 — adopt `site-b`
### Step 7 — adopt `check-the-mutual-peering`
### Step 8 — adopt `read-across-the-sites`
```

The same input writes the same bytes. Compose again and build twice, and compare:

```bash demo
cp -r "$blueprint" ../blueprint-1 && cp dist/harness/*.zip ../harness-1.zip
rm -rf dist/harness && agsc compose --from two-linked-sites --brief --zip > /dev/null 2>&1
diff -r ../blueprint-1 "$blueprint" && cmp ../harness-1.zip dist/harness/*.zip && echo "blueprint and archive: same bytes"
agsc build > /dev/null 2>&1 && mv www ../www-1 && agsc build > /dev/null 2>&1
diff -r ../www-1 www && echo "site: same bytes"
cd ..
```

```text expect
blueprint and archive: same bytes
site: same bytes
```

On the built site, the page of the architecture links `/compose/?from=two-linked-sites`,
where a browser shows the same brief and offers it, with the blueprint, as an archive to
download.

Now follow the plan on two real nodes. Steps 1 to 3: the memory demo holds node `a`,
which names `b` as a peer, node `b`, which names `a`, and node `c`, which names `a`
when `a` does not name it. Give each a history and build it; `b` carries the Content Use
Terms, so it builds a `/legal/` page and warns once:

```bash demo
cp -r "$ENGINE/examples/demos/mode-1-memory" sites && cd sites && cp "$ENGINE/LICENSE-CONTENT" b/
for n in a b c; do (cd $n && git init -q -b main && git add -A && git commit -q -m "node $n" && agsc build | tail -1); done
```

```text expect
build: pass (0 error, 0 warn)
build: pass (0 error, 1 warn)
```

Step 4: an item on `a` cites a page of `b` through `sources`. The `remember` tool hands
the item back and writes nothing; nothing is fetched from `b`:

```bash demo
(cd a && node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"lesson","title":"Pair retries with a breaker","body":"## Lesson\n\nPair retries with a breaker.\n\n## Evidence\n\nThe supervisor page of node b.\n\n## Check before\n\nA retry loop exists.","operator":"human:operator","agent":"agent:probe","model":"m","sources":[{"id":"b-supervisor","resource":"https://b.example/concepts/supervisor/"}]}' | grep -E '"(resource|type)"')
```

```text expect
          "resource": "https://b.example/concepts/supervisor/"
  "type": "proposal"
```

Step 7: the peer check passes for `a` and `b`, which name each other, and fails for `a`
and `c`, where only one side names the other:

```bash demo
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset | tail -1
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer c/www/.well-known/knowledge-linkset || echo "checker exit $?"
```

```text expect
validate-wellknown pass (level 2): 26 input file(s) read, 0 error(s), 0 warning(s)
a/www/.well-known/knowledge-linkset:1:1 error AGSC-E907 resolved, not mutual: no rel#peer names https://c.example/.well-known/knowledge-linkset (AGSC-10-12)
checker exit 1
```

Step 8: an agent reads `a`'s discovery document, takes the peer link, and reads `b`'s
`llms.txt` itself:

```bash demo
node -e 'const l = JSON.parse(require("node:fs").readFileSync("a/www/.well-known/knowledge-linkset", "utf8")).linkset[0]; for (const one of l["https://w3id.org/agentic-system-core/rel#peer"]) console.log("peer", one.href);'
grep -m1 '^bundle:' b/www/llms.txt
```

```text expect
peer https://b.example/.well-known/knowledge-linkset
bundle: https://b.example/
```

To publish the pair, serve each `www/` folder from any static host at the address its
`site.base` names.

## Change the blueprint

Edit an item, run `agsc lint`, and compose again: the diagrams, records and plan follow.
A third site is one more Bundle and site concept, one more entry in each peers list, and
the check of each pair.
