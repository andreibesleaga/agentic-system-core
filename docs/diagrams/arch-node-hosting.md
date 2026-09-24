# Architecture — where a node can live

**What this shows.** A node is a set of files. Any place that can put those files
behind an HTTPS origin — serving the discovery document and the routes, with the
response headers the build wrote — can host it. The seven built-in hosting profiles
translate the build's header rules for each kind of place; a ledger can anchor the
bundle hash and the content version of one build. No rule of 1.x pins a transport
other than HTTP.

```mermaid
flowchart LR
  BUILD["agsc build<br/>www/ + _headers + _redirects"]
  subgraph PROFILES["agsc-host emit profile"]
    CF["cloudflare-pages<br/>(the reference)"]
    SH["static-host<br/>(nginx, Apache)"]
    GP["github-pages"]
    LO["local<br/>(agsc-host serve)"]
    GC["git-clone"]
    IP["ipfs<br/>(through an HTTP gateway)"]
    LA["ledger-anchor<br/>(a record of one build)"]
  end
  ORIGIN["HTTPS origin<br/>/.well-known/knowledge-linkset + routes"]
  BUILD --> CF --> ORIGIN
  BUILD --> SH --> ORIGIN
  BUILD --> GP --> ORIGIN
  BUILD --> LO --> ORIGIN
  BUILD --> GC --> ORIGIN
  BUILD --> IP --> ORIGIN
  BUILD --> LA
  LA -. "agsc-host verify-anchor" .-> BUILD
```

Trace: AGSC-00-24 (the deployment-profile kind), AGSC-06-01 and AGSC-06-17 (routes and
headers), AGSC-04-25 (the content version), AGSC-11-05 (response headers).
