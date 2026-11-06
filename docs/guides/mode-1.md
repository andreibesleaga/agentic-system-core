# Mode 1 — memory for an assistant, and nodes that check each other

**Who it is for:** a developer who wants an AI assistant to search, read and cite a
folder of notes; two publishers who want their nodes to name and check each other; an
agent, or its operator, reading someone else's node.

**What you get:** a local tool server, `agsc mcp`, with ten tools over your Bundle —
`search`, `read`, `links`, `compose`, `ask`, `propose`, `remember`, `brief`, `explain`, `check` — that runs on your
computer, needs no key and writes nothing; two nodes that list each other as peers and a
shipped checker that confirms it; the commands to verify any published node by hand.

**Read after:** [Mode 0](mode-0.md). **Next:** [Mode 2](mode-2.md).

---

## Before you start

Node.js 22.13 or later, `git` with your name and e-mail set, a POSIX shell. Install once,
in a working folder:

```bash
mkdir agsc-work && cd agsc-work
npm install agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"
export ENGINE="$PWD/node_modules/agentic-system-core"
```

Every command below was run on the package and printed the lines quoted under it
(other lines are left out); `tests/docs/guides.test.js` runs them again on every change.

## 1. A Bundle with two items

The Bundle from [Mode 0](mode-0.md) works. To follow along, write two items by hand —
this is the whole format of an item: a header between `---` lines, then Markdown. The
`related:` line is a **typed link**, which the graph and the tools follow:

```bash demo
mkdir -p node-a/content/concepts && cd node-a
cat > content/concepts/handoff.md <<'ITEM'
---
type: concept
title: Handoff
description: Passing work and its context from one agent to another, with a record of why it moved.
prov:
  origin: human
  operator: human:you
kind: explainer
related:
  - supervisor
---

# Handoff

The sending agent writes what it knows, names the receiver, and stops acting.
ITEM
cat > content/concepts/supervisor.md <<'ITEM'
---
type: concept
title: Supervisor
description: An agent that splits a task into parts and hands each part to another agent.
prov:
  origin: human
  operator: human:you
kind: explainer
---

# Supervisor

It keeps the plan and checks each result before the next handoff.
ITEM
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'start'
agsc lint
```

```text expect
lint: pass (0 error, 1 warn)
```

`init` found the two items already in place and wrote only the configuration and the
home page. Write `human:<your-id>` instead of `human:you`.

## 2. Connect an assistant

Your assistant starts the tool server itself. For Claude Code, from inside the Bundle:

```bash
claude mcp add --transport stdio my-notes -- npx -y agsc-cli mcp
```

For an assistant that has no project folder (Claude Desktop), give the folder as an
argument instead: `"command": "npx", "args": ["-y", "agsc-cli", "mcp", "/path/to/node-a"]`.
The setup for Claude Desktop, Cursor, VS Code and Codex CLI is in
[USING-WITH-ASSISTANTS.md](../USING-WITH-ASSISTANTS.md#5-setting-it-up).

To see what the assistant sees without one, the package has a small script that starts
`agsc mcp`, makes one tool call and prints the answer:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"who splits a task into parts"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" links '{"slug":"handoff"}'
```

```text expect
  "body": "An agent that splits a task into parts and hands each part to another agent. Content Use Terms: LicenseRef-AgenticSystemCore-Content-Use-1.0.",
    "http://localhost/concepts/supervisor/"
  "trust": "untrusted",
  "type": "answer"
        "key": "related",
        "target": "supervisor"
```

What to know about the answers:

- `ask` calls no model. It returns the **descriptions** of the best-matching items with
  their addresses as citations, so good one-line descriptions give good answers.
- Every tool result is marked `"trust": "untrusted"`: the text of a node is data for the
  assistant to read, never an instruction to follow.
- `propose` and `remember` return prepared text; nothing is written. `remember` needs
  the person operating it (`"operator": "human:<id>"`) or a declared agent lane, **and**
  the `agent` and `model` that helped write the item, unless the call says
  `"origin": "human"`; without an operator it refuses with `AGSC-E003`, and without
  `agent` and `model` the saved item fails `agsc lint` with `AGSC-E202` (AGSC-08-01).
  To cite a single chunk by its id, read `/chunks.jsonl` of the built site; the tools
  cite whole items by address.

## 3. Two nodes that check each other

Make a second node, give both a real address, and let each list the other as a peer
(`peers` in `agsc.config.json`, one discovery address per peer). The small script below
makes that edit; editing the two files by hand does the same:

```bash demo
cd ..
cp -r node-a node-b
cat > set-node.js <<'JS'
// usage: node set-node.js <bundle folder> <its https address> <the peer's https address>
const fs = require('node:fs');
const [dir, base, peer] = process.argv.slice(2);
const file = `${dir}/agsc.config.json`;
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.bundle.id = dir;
config.site.base = base;
config.peers = [`${peer}.well-known/knowledge-linkset`];
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
JS
node set-node.js node-a https://a.example/ https://b.example/
node set-node.js node-b https://b.example/ https://a.example/
(cd node-a && git commit -qam 'peer b' && agsc build > /dev/null 2>&1)
(cd node-b && git commit -qam 'peer a' && agsc build > /dev/null 2>&1)
node "$ENGINE/tools/validate-wellknown" node-a/www/.well-known/knowledge-linkset --level 2 --peer node-b/www/.well-known/knowledge-linkset
```

```text expect
validate-wellknown pass (level 2): 22 input file(s) read, 0 error(s), 0 warning(s)
```

The checker reads both discovery documents, recomputes every digest they declare, and
confirms that each names the other. If only one side lists the other, it fails with
`resolved, not mutual`. Nodes never call each other: a client reads both.

## 4. Read a published node by hand

This needs the network. The discovery document of any node is at one address:

```bash
curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset
curl -s https://agenticsystemcore.com/llms.txt | openssl dgst -sha256 -binary | base64
node "$ENGINE/tools/validate-wellknown" https://agenticsystemcore.com/.well-known/knowledge-linkset --level 2 --peer https://patterns.agenticsystemcore.com/.well-known/knowledge-linkset
```

The second line prints the same value the discovery document gives for `llms.txt`
(`sha-256=:<that value>:`). On 6 October 2026 the third printed
`validate-wellknown pass (level 2): 26 input file(s) read, 0 error(s), 0 warning(s)`.

## 5. Take the memory elsewhere

Exports carry the licence of the prose with them, so copy the licence text in first
(or name another licence in `bundle.license_prose`):

```bash demo
cd node-a
cp "$ENGINE/LICENSE-CONTENT" . && git add LICENSE-CONTENT && git commit -qm 'content terms'
agsc export --okf
agsc export --to llm-context
ls dist/export/okf dist/export/llm-context
```

```text expect
export --okf: 5 files under dist/export/okf/ (AGSC-01-26; the export root carries LICENSE-CONTENT)
LICENSE-CONTENT
content
llms-ctx.txt
chunks-index.toon
```

The first is the Bundle itself, ready to be read back with `agsc import --from okf`; the
second is one text file and one compact index for a model's context window. Read back by the
node that wrote it, the export keeps every status; read by another node, or any foreign OKF
folder, it arrives as **drafts**, whatever licence it declares, until a person publishes each
item. Add `--manifest` to an export (`agsc export --okf --manifest`) and the folder carries
`export-manifest.json`: the digest of every file, the item count and a digest of the item
addresses, which `import` recomputes and reports as a warning wherever the copy differs.
`agsc import thesaurus.ttl --from skos` brings a SKOS thesaurus in as draft items the same way
([CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md)).

`agsc export --skos` writes `dist/export/skos.ttl`, the node's concepts, lessons and
clusters as SKOS, for a thesaurus or taxonomy tool that reads SKOS and runs no
inference. It states the scheme (title, tagline, author and licence from the
configuration, and the title again as the scheme's SKOS label), the top concepts, and the type of each entry; episodes, procedures and
gates are not SKOS concepts and are left out.

```bash demo
agsc export --skos
head -n 2 dist/export/skos.ttl
```

```text expect
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
```

`agsc lint --suggest` proposes Links without making any. It reads the notes and writes
`dist/suggestions.json`: for each pair that no Link joins, a `related` suggestion where one
note links to the other in its text, where the two cite two or more of the same sources, or
where one names the other's title or alias; a `uses` suggestion where a note names a term; and,
for a lesson with no `derived-from`, the episodes it could come from. Each entry carries its
evidence, so a person can judge it. Nothing under `content/` changes; you accept a suggestion
by editing the note. A note whose provenance says a model wrote it is not evidence for itself.

To have `lint` warn about a pattern, taxonomy, explainer or principle that cites too few sources,
set a minimum in `agsc.config.json`, for example `{"lint": {"min_sources": 2}}`. The default,
`0`, checks nothing. A note below the minimum gets the warning `AGSC-E417`; a source that is the
address of a note a model wrote does not count.

```bash demo
agsc lint --suggest
head -c 17 dist/suggestions.json
```

```text expect
{"bundle_version"
```

`agsc export --closure` writes `dist/export/closure.nt`: the statements that follow from the
graph under a small, named part of OWL 2 RL (domains, ranges, sub-properties, symmetric,
inverse and transitive properties, and sub-classes), minus the ones the graph already holds.
It is for reading what the graph implies, for example that every concept is a `skos:Concept`;
it is never published and never part of a build, and running it twice gives the same bytes.
An item that uses an irreflexive property toward itself is reported as the warning `AGSC-E313`.

```bash demo
agsc export --closure
grep -o 'skos/core#ConceptScheme' dist/export/closure.nt
```

```text expect
skos/core#ConceptScheme
```

A node can also bring a vocabulary of its own: classes and relations for its field, such as
an `Engine` that is a kind of concept, or `controls` as a kind of `uses`. Write them in one
Turtle file and name it in `agsc.config.json`, for example
`{"domain": {"vocabulary": "domain/vocabulary.ttl"}}`. The file declares one `owl:Ontology`,
whose IRI followed by `#` is the namespace of its terms. Each class must be a subclass of
exactly one of the six note types and each relation an `owl:ObjectProperty` under one of the
fourteen link types, every term needs an `rdfs:label`, and no relation may state a domain or a
range. That way a reader that knows only the six note types and the fourteen links still
understands every note.

```bash demo
mkdir -p domain
cat > domain/vocabulary.ttl <<'TTL'
@prefix asc: <https://w3id.org/agentic-system-core/ns#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

asc:Concept a owl:Class .
asc:uses a owl:ObjectProperty .

<https://example.org/ns/domain> a owl:Ontology ; rdfs:label "Our domain vocabulary" .

<https://example.org/ns/domain#Engine> a owl:Class ; rdfs:label "Engine" ;
    rdfs:subClassOf asc:Concept .

<https://example.org/ns/domain#controls> a owl:ObjectProperty ; rdfs:label "controls" ;
    rdfs:subPropertyOf asc:uses .
TTL
node "$ENGINE/tools/validate-ontology" domain/vocabulary.ttl
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.domain = { vocabulary: "domain/vocabulary.ttl" }; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
```

```text expect
validate-ontology: 1 input file(s) read, site vocabulary, 10 triples, 1 classes, 1 properties, 0 error, 0 warn
```

The two lines at the top declare the note type and the link the file builds on. `agsc lint`
and `agsc build` check the file, and a fault is the error `AGSC-E420`;
`node "$ENGINE/tools/validate-ontology" domain/vocabulary.ttl` checks it alone (`$ENGINE` is the
engine's folder, as in section 3). The build publishes every
statement of the file in `graph.nq`, `graph.ttl` and `graph.jsonld`, and `agsc export --closure`
reads it. The file is not copied into the site, and a node without it builds byte for byte as
before.

A note then says which of these terms it is, and what part it plays, in its front matter:

```yaml
domain_type: Engine
domain_role: aggregate-root
domain_links:
  controls:
    - supervisor
```

`domain_type` names a class of the vocabulary file, `domain_role` is one of `aggregate-root`,
`entity`, `value-object`, `domain-event` and `policy`, and each member of `domain_links` names
a relation of the file, with the notes it points to, written as for any link. If the file says
that two relations are each other's inverse (`owl:inverseOf`), write only one of them: the
build adds the other. Both relations of such a pair must be relations the file defines; an
`owl:inverseOf` that names anything else, such as `rdf:type` or `asc:uses`, is `AGSC-E420`.
Which one you write is fixed by the file: the object of the
`owl:inverseOf` statement, or, where the file states the pair both ways, the one whose address
sorts last, is the one the build adds. `agsc lint` refuses a `domain_type` the file does not
define (`AGSC-E418`) and a member that is no relation of the file, that is the added inverse,
or that is a kind of `skos:related`, `skos:broader` or `skos:narrower` used on a cluster
(`AGSC-E317`); a `domain_role` outside the five is `AGSC-E203`. On a node with no vocabulary
file, `domain_type` is the error `AGSC-E418` and `domain_links` the warning `AGSC-E207`: nothing
reads them there.

```bash demo
node -e 'const fs = require("fs"); const f = "content/concepts/handoff.md"; fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("kind: explainer\n", "kind: explainer\ndomain_type: Engine\ndomain_role: aggregate-root\ndomain_links:\n  controls:\n    - supervisor\n"))'
git add -A && git commit -qm 'domain vocabulary'
agsc lint
agsc build > /dev/null 2>&1
grep -o '<https://a.example/concepts/handoff/> <https://example.org/ns/domain#controls> <https://a.example/concepts/supervisor/>' www/graph.nq
```

```text expect
lint: pass (0 error, 2 warn)
<https://a.example/concepts/handoff/> <https://example.org/ns/domain#controls> <https://a.example/concepts/supervisor/>
```

A term can also say why it belongs to the vocabulary, with a `warrant`: what grounds it, and
which of the three kinds of warrant of ANSI/NISO Z39.19 that ground is. `literary` means the
term is used in the published writing of the field, `user` that the people who look for the
subject use it, and `organisational` that your organisation requires it. A warrant needs no
vocabulary file.

```yaml
warrant:
  source: https://example.org/glossary
  type: literary
```

`source` is one line: an address where there is one, otherwise a citation. The build adds two
statements to the note in `graph.nq`, `graph.ttl` and `graph.jsonld`: `dcterms:source` with the
source and `asc:warrant` with the kind. A warrant is not an entry of `sources`, and it changes
none of them. `agsc lint` refuses a warrant without a `source` or a `type`, or of another kind
(`AGSC-E512`), and an empty or multi-line source (`AGSC-E204`).

A node can also write down what must always hold in its graph, and the questions its graph
must answer, and have `agsc verify` and `agsc ci` check both. Rules that must always hold, such
as "every engine has a controller", are SHACL shapes in a Turtle file named by `domain.shapes`;
[SHACL-SHAPES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SHACL-SHAPES.md)
lists the part of SHACL the engine runs. Questions are a JSON file named by `domain.questions`:
each entry has an `id`, the `question` in words, a SPARQL `query` and the `expected` answer. The
query is an `ASK` or a `SELECT` made of basic patterns, the path operators `/`, `^`, `+` and
`*`, `FILTER` with comparisons, `&&`, `||`, `!` and `NOT EXISTS`, `DISTINCT`, `ORDER BY` of
variables and `LIMIT`. An `ORDER BY` of a `SELECT` names every variable the query returns, and
`LIMIT` comes only after such an `ORDER BY`, so the rows kept and their order never depend on
the engine. The expected answer of an `ASK` is `true` or `false`; that of a `SELECT`
is `{"rows": [[...]]}`, each cell a term written as in N-Triples (`"<https://example.org/x>"`,
`"\"text\""`) or `null` where a variable has no value. Both files run over `graph.nq` together
with the statements `agsc export --closure` would add. A broken rule is `AGSC-E421`, a question
whose answer differs is the error `AGSC-E422`, and a file outside these limits is `AGSC-E420`.
The rows of a `SELECT` without `ORDER BY` are compared as a set, in any order, and a title or
description is written with its language tag (`"\"Handoff\"@en"`). Neither file needs a
vocabulary file, and `agsc lint` and `agsc build` do not read them. Below, the shapes file asks
every engine to control something, which `handoff` does, and one question asks whether the node
holds a concept.

```bash demo
cat > domain/shapes.ttl <<'TTL'
@prefix dom: <https://example.org/ns/domain#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

<https://example.org/ns/domain-shapes#EngineControls> a sh:NodeShape ;
    sh:targetClass dom:Engine ;
    sh:property [ sh:path dom:controls ; sh:minCount 1 ; sh:message "Every engine controls something."@en ] .
TTL
cat > domain/questions.json <<'JSON'
[
  {
    "expected": true,
    "id": "has-a-concept",
    "query": "ASK { ?note a <https://w3id.org/agentic-system-core/ns#Concept> }",
    "question": "Does the node hold at least one concept?"
  }
]
JSON
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.domain.shapes = "domain/shapes.ttl"; c.domain.questions = "domain/questions.json"; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc verify
sed -i.bak 's/"expected": true/"expected": false/' domain/questions.json
agsc verify || echo "verify exited $?"
```

```text expect
verify: pass (0 error, 0 warn)
error: AGSC-E422 the competency question has-a-concept ("Does the node hold at least one concept?") is answered true, not the expected false (AGSC-05-41) — domain/questions.json
verify exited 1
```

A cluster can also be a **bounded context**: a part of the field with words of its own, where
a term has one meaning. Name it under `domain.contexts` with a namespace of its own, for example
`{"cluster": "coordination", "namespace": "https://example.org/ns/coordination#"}`. A note is in
the context its `domain_context` names, or else in the context of its first cluster, or in none.
Inside one context two notes with the same title, of any type, are the warning `AGSC-E419`;
notes in two different contexts may share a title without a warning, because the same word can
mean two things in two contexts. With a vocabulary file, a context's namespace holds the classes
and relations that belong to that context alone: a note inside a context names its `domain_type`
and its `domain_links` from that context's namespace, and a note in no context names them from
the vocabulary's own namespace. When such a node composes, `agsc compose` also
writes `context-map.json` beside the Harness, in the folder whose name is the Harness folder's
with `.companion` added: which context each member is in, the links between members of two
contexts, and the members in none. The seven Harness files do not change, and a node without
contexts gets no extra file.

```bash demo
mkdir -p content/clusters
cat > content/clusters/coordination.md <<'ITEM'
---
type: cluster
title: Coordination
description: How agents divide work between them, in the words this team uses.
prov:
  origin: human
  operator: human:you
---

# Coordination
ITEM
cat > content/concepts/supervisor.md <<'ITEM'
---
type: concept
title: Supervisor
description: An agent that splits a task into parts and hands each part to another agent.
prov:
  origin: human
  operator: human:you
kind: explainer
domain_context: coordination
---

# Supervisor

It keeps the plan and checks each result before the next handoff.
ITEM
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.domain.contexts = [{ cluster: "coordination", namespace: "https://example.org/ns/coordination#" }]; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc compose handoff supervisor > /dev/null 2>&1
map="$(ls -d dist/harness/*.companion)/context-map.json"
node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(JSON.stringify(m.contexts)); console.log(JSON.stringify(m.unassigned))' "$map"
```

```text expect
[{"members":["supervisor"],"name":"coordination","namespace":"https://example.org/ns/coordination#"}]
["handoff"]
```

Readers and agents see these parts too. On a node with a vocabulary file, a note's page lists
its domain type, role, context and warrant under its relations table, each with its label: the
`rdfs:label` the file gives the class, the role in words, the title of the context's cluster and
the warrant's kind and source. Where a related note has a domain type or a context, the
relations table shows them in two more columns. For a note that states any of `domain_type`,
`domain_role`, `domain_context` and `warrant`, the tools `search` and `read` add a member
`domain` with its parts, on the local server and in the page tools alike, and a brief
(`agsc compose --brief`) lists them under `## Domain` in `BRIEF.md`, on the note's entry in
`brief.json` and in its section of `context.md`. A note that states none of them looks as it did
before.

```bash demo
agsc build > /dev/null 2>&1
grep -o '<dt>Domain [a-z]*</dt><dd>[^<]*</dd>' www/concepts/handoff/index.html
agsc compose handoff supervisor --brief > /dev/null 2>&1
grep -A3 '^## Domain' "$(ls -d dist/harness/*.companion)/BRIEF.md"
```

```text expect
<dt>Domain type</dt><dd>Engine</dd>
<dt>Domain role</dt><dd>aggregate root</dd>
## Domain

- `handoff`: type Engine; role aggregate-root
- `supervisor`: context coordination
```

A peer can say how its model relates to yours. Instead of the address alone, write the entry
of `peers` as `{"url": "<address>", "relationship": "<kind>", "crosswalk": "<file>"}`: the kind
is `shared-kernel` (the two nodes own part of the model together), `conformist` (this node
takes the peer's model as it is) or `translation-layer` (this node keeps its own model and
translates). The crosswalk, required for `translation-layer`, is a Turtle file of statements
`<a note of yours> skos:exactMatch <the peer's note>`, with `skos:closeMatch`,
`skos:broadMatch` or `skos:narrowMatch` where the match is not exact; the subject is one of
your concepts or lessons. `agsc lint` refuses any other statement (`AGSC-E209`) and a crosswalk
file that is missing (`AGSC-E901`). The built site names the peer by its address alone, as
before. A node that declares contexts also writes the relationship and the crosswalk into
`context-map.json` when it composes; a node without contexts keeps them in its configuration
only. The engine fetches no peer and a build never applies a crosswalk: a client that federates
over peers must mark each result from that peer with them.

`agsc export --to cogx` writes the memory archive that Cognee reads; the routes for
other agent frameworks are in [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md).

## What next

- Turn a project's decisions, specifications and tasks into the same kind of memory:
  [Mode 2](mode-2.md).
- Everything the tool server does and never does: [USING-WITH-ASSISTANTS.md](../USING-WITH-ASSISTANTS.md).
- Walking several nodes and joining their graphs is a library function at 1.0
  (`src/boundary/federation.js`), not a command; [USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#d2--a-client-that-walks-a-neighbourhood) says what it does.
