# Architecture — C4 level 2: the containers

**What this shows.** The runnable parts of this distribution and what each reads and
writes. The four folders that define the standard are data every container reads; the
checkers read them without importing any engine code.

```mermaid
flowchart TB
  subgraph STD["The standard (data)"]
    SPEC["spec/ rules"]
    SCH["schema/*.json"]
    ONT["ontology/agsc.ttl"]
    VEC["tests/vectors/"]
  end
  CLI["agsc<br/>command line, 16 verbs"]
  HOSTC["agsc-host<br/>hosting profiles, local server"]
  MCP["agsc mcp<br/>local MCP server over stdio"]
  CHK["tools/validate-*, gen-*<br/>nine standalone checkers"]
  OUT["Built node<br/>(static files in build.out)"]
  PAGE["Page tools<br/>(script in the built pages)"]
  ACT["action.yml + pre-commit hook<br/>(run agsc in CI and before commit)"]
  CLI -->|reads| SCH
  CLI -->|reads| ONT
  CLI -->|writes| OUT
  OUT --> PAGE
  CLI --> MCP
  HOSTC -->|reads, serves or configures| OUT
  CHK -->|check| SPEC
  CHK -->|check| VEC
  CHK -->|check| OUT
  ACT --> CLI
  VEC -->|expected bytes for| CLI
```

Trace: AGSC-09-07 (the sixteen verbs), AGSC-09-13 (the local server), AGSC-09-16
(page tools), AGSC-09-90 (independent checkers), AGSC-00-24 (the deployment-profile
plugin kind).
