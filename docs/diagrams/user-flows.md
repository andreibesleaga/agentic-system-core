# User flows — the five richest journeys

## 1. Reader find-pattern (P1, Mode 0)

```mermaid
flowchart TD
  A["Open https://agenticsystemcore.com/"] --> B["Read install line + counts + surface links"]
  B --> C{"Know what to search?"}
  C -- yes --> D["Type query in search box"]
  D --> E["Browser fetches /search.json once"]
  E --> F["Client-side inverted-index match"]
  C -- no --> G["Browse /clusters/<slug>/"]
  G --> H["Pick member tile"]
  F --> I["Open /concepts/<slug>/"]
  H --> I
  I --> J["Read facets, inlined SVG diagram, Sources, typed Links"]
  J --> K["Download .md / .jsonld, or Propose a change"]
```

## 2. Contributor propose → merge (P2, Mode 0)

```mermaid
flowchart TD
  A["Click 'Propose a change' on an item page"] --> B["GitHub fork-and-edit UI opens"]
  B --> C["Edit frontmatter / body"]
  C --> D["Commit with Signed-off-by ... (CA-v1)"]
  D --> E["PR body carries agsc:proposal v1 marker"]
  E --> F["ci.yml: npx agsc ci (lint L1+L2, build x2, diff)"]
  F --> G{"CI status check green?"}
  G -- no --> C
  G -- yes --> H["Maintainer reviews, adds verified[] entry"]
  H --> I{"Ruleset: 1 approval + Code Owner + green ci?"}
  I -- no --> H
  I -- yes --> J["Owner merges"]
  J --> K["site ci.yml (deploy job): agsc ci then Cloudflare Pages publish www/"]
  K --> L["Live in ~2 minutes"]
```

## 3. Architect compose → Harness (P5, Mode 4)

```mermaid
flowchart TD
  A["Open /compose/"] --> B["Load graph.jsonld + agsc-core.js"]
  B --> C["Tick Concepts, filter by cluster/tag"]
  C --> D["closure.js runs client-side"]
  D --> E["1 requires closure adds items + explanation path"]
  E --> F["2 supersedes hides superseded items\n(a survivor requiring a hidden item = AGSC-E802)"]
  F --> G["3 excludes mutex reported over the survivors"]
  G --> H["4 contradicts / missing uses warnings shown"]
  H --> I["Name the Harness"]
  I --> J["Generate seven files in memory"]
  J --> K{"Browser zip writer available?"}
  K -- yes --> L["Download harness-<name>.zip"]
  K -- no --> M["Download files one by one (fallback)"]
```

## 4. Integrator skills install (P6, Mode 3)

```mermaid
flowchart TD
  A["Run npx agsc skills install https://agenticsystemcore.com"] --> B["Fetch /skills/index.json"]
  B --> C{"--into target"}
  C -- default --> D[".claude/skills/agsc-<cluster>/"]
  C -- agents --> E[".agents/skills/agsc-<cluster>/"]
  C -- github --> F[".github/skills/agsc-<cluster>/"]
  D --> G["Write SKILL.md + references/<slug>.md, sha256 lockfile"]
  E --> G
  F --> G
  G --> H["Also write agsc-index/SKILL.md"]
  H --> I["Agent's skill tree now carries 20 packs + index"]
  I --> J{"Later: integrator edits a SKILL.md locally?"}
  J -- yes --> K["agsc skills import <dir> maps it to a Procedure"]
  K --> L["Round-trips via persona-d propose flow"]
```

Trace: PRD-011/013/014 (flow 1), PRD-039–042/050 (flow 2), PRD-036–038 (flow 3), PRD-032–035 (flow 4);
PLAN.md §6(b), §6(c).

## Flow 0 — Drop-in user (PRD-053; the front-door scenario)

```mermaid
flowchart LR
  A["Folder of plain .md notes"] --> B["npx agentic-system-core init\n(adopt: minimal frontmatter, body bytes untouched,\nmoved to content/concepts/<slug>.md, original path in aliases)"]
  B --> C["npx agentic-system-core ci\n(lint warn-only -> build -> verify)"]
  C --> D["www/ static site\n+ graph.jsonld + llms.txt\n+ .well-known/knowledge-linkset"]
  D --> E["git push -> Cloudflare Pages\n= online live wiki"]
  D --> F["npx agentic-system-core mcp\n= agent-readable memory"]
```
Trace: PRD-053, AGSC-02-90..93.
