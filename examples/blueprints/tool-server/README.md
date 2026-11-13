# `tool-server/` — a blueprint of an agent tool server with a client

**Summary.** A small Bundle that describes a local tool server that gives an agent ten
tools over a knowledge node, a client that calls them, the same tools on the published
pages, and the server's HTTP transport. `agsc compose --from tool-server-and-client
--brief` turns it into a blueprint: three C4 diagrams, one decision record per decision
and a build plan. Nothing in the blueprint is typed by hand; every file comes from the
items below. The plan is then carried out on this same Bundle: the tool server serves
the blueprint itself.

**Read with:** [docs/guides/mode-4.md](../../../docs/guides/mode-4.md) (saved
architectures and blueprints), [`examples/demos/agents/`](../../demos/agents/README.md)
(the two clients used below) and the agent section of
[docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md),
from which the checks are taken.

## What is in the folder

| Path | What it holds |
|---|---|
| `content/concepts/tool-server-and-client.md` | the saved architecture: the selection, in a `yaml agsc-selection` block |
| `content/concepts/knowledge-bundle.md`, `tool-server.md`, `http-transport.md`, `tool-client.md`, `page-tools.md` | the five parts; each `requires` what it cannot work without |
| `content/procedures/` | six checks; each `verifies` the part it proves and `requires` what it runs against |
| `content/concepts/decision-*.md` | five decisions; each body lists the options that were considered and why the others lost |
| `content/concepts/forge.md`, `mcp-sdk.md`, `assistant.md`, `browser.md` | the outside systems: listed, never selected |

How the three C4 levels read here. Level 1 draws the design as one box, with the forge
and the protocol packages it `uses`, the assistant and the browser that reach it, and the
decisions around it. Level 2 draws the five parts. Level 3 places each check inside the
part it is drawn to.

## Build from this

Set the folder and the architecture, run the two blocks of
[the common steps](../README.md#the-common-steps) (copy the folder and check it, then show
that two runs write the same bytes) (the lint and ci checks there are also step 2 of the plan,
`check-the-bundle`), and go on below in the same shell:

```bash demo
export BLUEPRINT=tool-server ARCHITECTURE=tool-server-and-client
```

Write the blueprint. The two warnings are the forge and the protocol packages, each named
under `uses` and never added to the selection: that is what keeps them outside the box.

```bash demo
agsc compose --from tool-server-and-client --brief --zip 2>&1 | grep '^compose:'
blueprint="$(ls -d dist/harness/*.companion)/blueprint"
ls "$blueprint/decisions"
sed -n '/^### Step/p' "$blueprint/build-plan.md"
```

```text expect
compose: pass (0 error, 2 warn)
0001-decision-answers-are-untrusted-data.md
0002-decision-loopback-only.md
0003-decision-official-mcp-packages.md
0004-decision-same-tools-on-the-page.md
0005-decision-tools-write-nothing.md
### Step 1 — adopt `knowledge-bundle`
### Step 2 — adopt `check-the-bundle`
### Step 3 — adopt `page-tools`
### Step 4 — adopt `tool-server`
### Step 5 — adopt `compare-page-and-server`
### Step 6 — adopt `http-transport`
### Step 7 — adopt `list-the-tools`
### Step 8 — adopt `prepare-a-change`
### Step 9 — adopt `serve-over-http`
### Step 10 — adopt `tool-client`
### Step 11 — adopt `call-a-tool`
```

Now follow the plan, with this Bundle as the knowledge the agent works on. Steps 4 and 7:
start the tool server and list its tools with the three lines every Model Context
Protocol client sends:

```bash demo
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"blueprint","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | agsc mcp | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { for (const line of s.trim().split("\n")) { const m = JSON.parse(line); if (m.id === 1) console.log("server:", m.result.serverInfo.name, "protocol", m.result.protocolVersion); if (m.id === 2) console.log("tools:", m.result.tools.map((t) => t.name).sort().join(" ")); } });'
```

```text expect
server: agentic-system-core protocol 2025-11-25
tools: ask brief check compose explain links propose read remember search
```

Step 8: `propose` and `remember` hand back a proposal, the prepared text and its path,
and the Bundle stays as it was:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"tool-server"}' | grep -E '"(slug|type)"'
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"lesson","title":"Check the origin header","body":"## Lesson\n\nA local HTTP server checks the Origin header.\n\n## Evidence\n\nThe loopback decision.\n\n## Check before\n\nThe server listens over HTTP.","operator":"human:operator"}' | grep -E '"(path|type)"'
ls content/lessons 2>/dev/null || echo "content unchanged"
```

```text expect
    "slug": "tool-server"
  "type": "proposal"
      "type": "lesson",
    "path": "content/lessons/check-the-origin-header.md",
content unchanged
```

Steps 3 and 5: the built pages offer the same tools. The same question, asked through
the tool server and the way a page asks it, gets the same bytes:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"how does the server stay local"}' > server-ask.json
node "$ENGINE/examples/demos/agents/page-tools.js" www ask '{"question":"how does the server stay local"}' > page-ask.json
cmp server-ask.json page-ask.json && echo "the page tools and the tool server gave the same answer"
```

```text expect
the page tools and the tool server gave the same answer
```

Steps 6 and 9: the HTTP transport refuses an address that is not loopback before it starts
anything:

```bash demo
agsc mcp --http 0 --bind 10.0.0.1 || echo "mcp exit $?"
```

```text expect
{"code":"AGSC-E003","severity":"error","message":"mcp: --bind \"10.0.0.1\" is not a loopback address: one in 127.0.0.0/8, or ::1 (AGSC-09-18)"}
mcp exit 2
```

The rest of step 9 opens a socket, so it is shown and not run here: start the server,
read the port it reports on standard error, and point a Model Context Protocol client
that speaks Streamable HTTP at it.

```bash
agsc mcp --http 0          # reports the port it listens on, on 127.0.0.1
# then connect a client to http://127.0.0.1:<port>/mcp
```

Steps 10 and 11: a client. `mcp-call.js` is one in plain Node; every answer is an envelope
that names its source and licence and is marked untrusted:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" search '{"query":"loopback"}' | grep -E '"(slug|source|trust)"'
node "$ENGINE/examples/demos/agents/mcp-call.js" read '{"slug":"tool-server"}' | grep -E '"(source|trust)"'
```

```text expect
        "slug": "decision-loopback-only",
        "slug": "http-transport",
  "source": "search",
  "trust": "untrusted",
  "source": "read",
```

To connect an assistant app instead, configure it with the command `agsc mcp` and the
Bundle as its working directory, as
[docs/USING-WITH-ASSISTANTS.md](../../../docs/USING-WITH-ASSISTANTS.md) shows.

## Change the blueprint

Edit an item, run `agsc lint`, and compose again: the diagrams, records and plan follow.
A new part is a concept with `kind: spec` in the selection; a new choice is a concept with
`kind: decision` whose body lists the options, named under `decided-by` on the part it
shapes.
