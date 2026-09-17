# w3id.org/agentic-system-core

Permanent identifiers for **AgenticSystemCore** — an ontological agentic memory for humans and agents.

| Identifier | Resolves to |
|---|---|
| `https://w3id.org/agentic-system-core/ns#<Term>` | vocabulary term (HTML anchor / RDF, by `Accept`) |
| `https://w3id.org/agentic-system-core/ns` + `Accept: text/turtle` | `https://agenticsystemcore.com/ns/agsc.ttl` |
| `https://w3id.org/agentic-system-core/ns` + `Accept: application/ld+json` | `https://agenticsystemcore.com/ns/context.jsonld` |
| `https://w3id.org/agentic-system-core/ns` + `Accept: application/rdf+xml` | `https://agenticsystemcore.com/ns/agsc.rdf` |
| `https://w3id.org/agentic-system-core/ns` (browser / anything else) | `https://agenticsystemcore.com/ns/` |
| `https://w3id.org/agentic-system-core/ns/<major>.<minor>.<patch>` | the immutable published copy of that version (`owl:versionIRI`), same negotiation |
| `https://w3id.org/agentic-system-core/ns/<file>.<ext>` | that distribution file |
| `https://w3id.org/agentic-system-core/profile/agentic-knowledge` | `https://agenticsystemcore.com/specs/agentic-knowledge/` (D55, decided 2026-09-03) |
| `https://w3id.org/agentic-system-core/rel#<name>` | `https://agenticsystemcore.com/specs/agentic-knowledge/`, where the client's own `#<name>` selects the relation's row (AGSC-06-01, AGSC-06-10) |

Versioned IRIs may carry a SemVer pre-release suffix (e.g. `1.0.0-draft.1`), matched by the same
content-negotiation rules as the plain `<major>.<minor>.<patch>` form.

All targets are static files on `agenticsystemcore.com`; there is no server-side code anywhere in the chain.
All redirects are `303 See Other`, per the W3C "Cool URIs for the Semantic Web" recipe.

## Maintainer

Andrei Nicolae Besleaga — <andrei.besleaga.nicolae@gmail.com> — GitHub: `andreibesleaga`

## Post-merge verification

```bash
# after the PR merges — every line must be 303 with the right Location
for a in "text/turtle" "application/ld+json" "application/rdf+xml" "text/html" "*/*"; do
  curl -sI -H "Accept: $a" https://w3id.org/agentic-system-core/ns | grep -iE '^(HTTP|location)'
done
curl -sI -H "Accept: text/turtle" https://w3id.org/agentic-system-core/ns/1.0.0
curl -sI https://w3id.org/agentic-system-core/ns/agsc.ttl
curl -sI https://w3id.org/agentic-system-core/ns/Pattern   # Location must contain '#', not '%23'
curl -sI https://w3id.org/agentic-system-core/profile/agentic-knowledge   # 303 to /specs/agentic-knowledge/
curl -sI https://w3id.org/agentic-system-core/rel          # 303 to /specs/agentic-knowledge/ (no fragment in Location)
```

Locally, the same can be run against Apache with `AllowOverride All` + `a2enmod rewrite headers`
(the shape of the repo's own disabled Travis job).

## Status

PR not yet opened — open it only once https://agenticsystemcore.com/ns/ serves the vocabulary files with
correct media types (see 16-PRERELEASE-PLAN.md P3); w3id states no requirement that the target be live and
runs no automated check (2026-09-03), but maintainers review PRs by hand.
