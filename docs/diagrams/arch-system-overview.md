# Architecture — the system in one picture

**What this shows.** How the pieces meet: a person or an agent writes a Bundle (a
folder of Markdown files); the engine builds it into a node (static files on any
host); readers — people, agents, a browser's own agent, other nodes — find the node
through its discovery document and read its surfaces; changes come back only as
proposals a person ratifies. Nodes never call nodes: a client walks from one to the
next. The rules win over the picture.

```mermaid
flowchart LR
  subgraph AUTHOR["Where knowledge is written"]
    P["People"]
    AG["Agents (agent lanes)"]
    B["Bundle: content/*.md<br/>+ agsc.config.json"]
    P -->|edit| B
    AG -->|proposal| B
  end
  subgraph ENGINE["agsc (the engine)"]
    L["lint"]
    BU["build"]
    V["verify / ci"]
    L --> BU --> V
  end
  B --> L
  subgraph NODE["A node: static files on any host"]
    WK["/.well-known/knowledge-linkset<br/>(discovery, digests)"]
    H["HTML pages<br/>+ seven page tools"]
    G["graph.nq / .ttl / .jsonld<br/>ontology, context"]
    T["llms.txt, chunks.jsonl,<br/>search.json, skills, boards"]
  end
  V --> NODE
  R1["A person in a browser"] --> H
  R2["An agent or crawler"] -->|describedby| WK
  WK --> G
  WK --> T
  R3["The browser's own agent"] --> H
  R4["A local assistant"] -->|agsc mcp| B
  subgraph PEER["Another node"]
    WK2["/.well-known/knowledge-linkset"]
  end
  WK -. "rel#peer (read by the client, never fetched by a node)" .-> WK2
  R2 -. "proposal (pull request or channel)" .-> P
```

Trace: AGSC-00-02 (no server), AGSC-06-01 (the route set), AGSC-06-07 and AGSC-06-08
(discovery and digests), AGSC-06-25 (`describedby`), AGSC-09-13 and AGSC-09-16 (the
seven tools on two transports), AGSC-08-08 (a person ratifies), AGSC-11-06 and
AGSC-11-13 (federation walked by the client).
