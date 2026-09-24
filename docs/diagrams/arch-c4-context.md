# Architecture — C4 level 1: the system and its neighbours

**What this shows.** The system context in C4 terms: who uses a knowledge node and
which outside systems it touches. Everything outside the box is someone else's; the
node depends on none of them at build time (no network during a build).

```mermaid
flowchart TB
  PUB["Publisher<br/>(a person who owns a Bundle)"]
  REV["Reviewer<br/>(ratifies proposals)"]
  RD["Reader<br/>(a person with a browser)"]
  AGT["Agent<br/>(assistant, crawler, framework, browser agent)"]
  SYS["AgenticSystemCore<br/>specification + engine + checkers<br/>turns a Bundle into a knowledge node"]
  FORGE["Forge<br/>(git host: pull requests, CI)"]
  HOST["Static host<br/>(web host, local machine, IPFS gateway, …)"]
  PEERS["Other nodes<br/>(peers)"]
  TOOLS["Other tools' formats<br/>(OKF, COGX, GABBE, skills repos, boards, steering files)"]
  PUB -->|writes Markdown, runs agsc| SYS
  REV -->|merges or refuses proposals| FORGE
  SYS -->|writes static files for| HOST
  RD -->|reads pages| HOST
  AGT -->|discovers and reads files| HOST
  AGT -->|proposes changes| FORGE
  FORGE -->|runs agsc ci| SYS
  SYS <-->|import and export| TOOLS
  HOST -. "rel#peer links, walked by clients" .- PEERS
```

Trace: AGSC-00-02, AGSC-01-22, AGSC-01-26, AGSC-04-03 (no network in a build),
AGSC-08-04 (proposals), AGSC-09-08 (`ci`), AGSC-11-06.
