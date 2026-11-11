# `domain-layer/` — the smallest Bundle with a domain layer

**Summary.** The two concepts of the other demos, with the four parts of the domain layer
added: a vocabulary of the site, one bounded context, one rule that must always hold and one
question the graph must answer. `agsc verify` checks the rule and the question; nothing else
in the folder is new. The step-by-step guide is the domain layer section of
[docs/guides/mode-1.md](../../../docs/guides/mode-1.md); the rules are AGSC-05-38 to AGSC-05-41.

## What is in the folder

| Path | What it holds |
|---|---|
| `agsc.config.json` | the `domain` object: the vocabulary, the shapes, the questions and one context |
| `domain/vocabulary.ttl` | two classes (`Coordinator`, `Handover`) and one relation (`controls`), in the namespace of the context |
| `domain/shapes.ttl` | the rule: every coordinator controls at least one handover |
| `domain/questions.json` | the question: which coordinator controls which handover, with its expected answer |
| `content/concepts/` | `supervisor` (a coordinator that controls `handoff`) and `handoff` (a handover) |
| `content/clusters/agent-patterns.md` | the cluster that is the bounded context |

## Run it

Every block below runs offline and is run by `tests/examples/domain-layer.test.js` with the
build instant fixed; each prints at least the lines quoted after it. `$ENGINE` is the folder
of this repository, or of the installed package from 1.1 on, and `agsc` is its command line.
Copy the folder, give it a git history, and check it:

```bash demo
export SOURCE_DATE_EPOCH=1789380000
export GIT_AUTHOR_NAME=Operator GIT_AUTHOR_EMAIL=operator@example.org GIT_COMMITTER_NAME=Operator GIT_COMMITTER_EMAIL=operator@example.org
cp -r "$ENGINE/examples/demos/domain-layer" . && cd domain-layer
git init -q -b main && git add -A && git commit -q -m "domain layer"
agsc lint | tail -1
agsc verify
```

```text expect
lint: pass (0 error, 0 warn)
verify: pass (0 error, 0 warn)
```

The build publishes the vocabulary with the graph. The two notes now have a domain type, and
the supervisor controls the handoff:

```bash demo
agsc build > /dev/null 2>&1
grep -oE 'concepts/(handoff|supervisor)/> <[^>]+> <[^>]+(Coordinator|Handover|handoff/)>' www/graph.nq
```

```text expect
concepts/handoff/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://domain-layer.example/ns/agent-patterns#Handover>
concepts/supervisor/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://domain-layer.example/ns/agent-patterns#Coordinator>
concepts/supervisor/> <https://domain-layer.example/ns/agent-patterns#controls> <https://domain-layer.example/concepts/handoff/>
```

Take the link away. The rule is broken (`AGSC-E421`), and because the question was answered
by that link, its answer changes too (`AGSC-E422`):

```bash demo
sed -i.bak '/^domain_links:/,/- handoff/d' content/concepts/supervisor.md
agsc verify 2>&1 | grep -oE '^(verify: fail \(2 error, 0 warn\)|error: AGSC-E42[12])' || true
mv content/concepts/supervisor.md.bak content/concepts/supervisor.md
agsc verify
```

```text expect
verify: fail (2 error, 0 warn)
error: AGSC-E421
error: AGSC-E422
verify: pass (0 error, 0 warn)
```

Compose a selection. `compose` writes the context map beside the Harness: which context each
member is in. The seven Harness files do not change:

```bash demo
agsc compose handoff supervisor > /dev/null 2>&1
node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(JSON.stringify(m.contexts)); console.log(JSON.stringify(m.unassigned))' "$(ls -d dist/harness/*.companion)/context-map.json"
```

```text expect
[{"members":["handoff","supervisor"],"name":"agent-patterns","namespace":"https://domain-layer.example/ns/agent-patterns#"}]
[]
```

## Change it

Name another class in `domain/vocabulary.ttl`, give a note its `domain_type`, and run
`agsc lint`: a type the file does not define is `AGSC-E418`. Add a second cluster under
`domain.contexts` with a namespace of its own, and a word can mean one thing in each context.
