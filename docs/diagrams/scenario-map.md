# Scenario map — personas → features → surfaces

```mermaid
flowchart LR
  subgraph PERSONAS["Personas (PRD.md §1)"]
    P0["P0 Drop-in user"]
    P1["P1 Human reader"]
    P2["P2 Human contributor"]
    P3["P3 Agent reader"]
    P4["P4 Agent proposer"]
    P5["P5 Architect / combiner"]
    P6["P6 Integrator"]
    P7["P7 Project team (Mode 2)"]
    P8["P8 Agent-as-memory (Mode 1)"]
    P9["P9 Owner-as-operator"]
    P10["P10 Port implementer"]
    P11["P11 Standards implementer"]
  end

  subgraph FEATURES["features/*.feature"]
    F0["persona-0-dropin"]
    Fa["persona-a-reader"]
    Fb["persona-b-contributor"]
    Fc["persona-c-agent-mcp"]
    Fd["persona-d-agent-proposer"]
    Fe["persona-e-architect"]
    Ff["persona-f-integrator"]
    Fg["persona-g-team"]
    Fh["persona-h-memory"]
    Fi["persona-i-maintainer"]
    Fj["persona-j-standards"]
  end

  subgraph SURFACES["Surfaces touched"]
    SITE["Static site (HTTPS www/)"]
    MCP["Local stdio MCP (7 tools)"]
    CLI["agsc CLI (npx)"]
    PR["GitHub PR / fork-edit"]
    FILES["spec/ + tests/vectors/ (files only)"]
  end

  P0 --> F0 --> CLI
  F0 --> SITE
  P1 --> Fa --> SITE
  P2 --> Fb --> SITE
  Fb --> PR
  P3 --> Fc --> MCP
  Fc --> SITE
  P4 --> Fd --> CLI
  Fd --> PR
  P5 --> Fe --> SITE
  Fe --> CLI
  P6 --> Ff --> CLI
  P7 --> Fg --> CLI
  Fg --> SITE
  P8 --> Fh --> CLI
  Fh --> MCP
  P9 --> Fi --> CLI
  Fi --> PR
  P10 --> FILES
  P11 --> Fj --> SITE
```

12 personas from `docs/PRD.md` §1 map to the eleven `features/*.feature` files (audit/D §3 walkthroughs
(a)–(j)) and on to the four live surfaces plus the files-only surface used by P10 (no (k) walkthrough
exists; P10's acceptance is `spec/` + `tests/vectors/`, not a runtime scenario). Fan-out on Fb/Fc/Fe/Fg/Fh/Fi
shows personas that cross more than one surface in their walkthrough.

Trace: PRD-001–052 (persona table §1), audit/D §3 (a)–(j), PLAN.md §1.2 stakeholder table.
