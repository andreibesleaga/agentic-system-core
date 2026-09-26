# Workflow — CI/CD lanes (PLAN §7) + w3id conneg

## The four lanes

```mermaid
flowchart TD
  subgraph L1["Engine CI - ci.yml"]
    T1["Trigger: push, PR"]
    P1["permissions: contents: read"]
    Sec1["secrets: none"]
    R1["npm test (fixed clock, no network),\ncoverage >=99%, lint --self, vectors;\nOS matrix on tags"]
    T1 --> R1
  end

  subgraph L2["Engine release - release.yml"]
    T2["Trigger: tag v* pushed by the maintainer"]
    P2["permissions: contents: read,\nid-token: write, attestations: write"]
    Sec2["secrets: none (OIDC)"]
    R2["Node 24 -> npm trusted publishing:\nagentic-system-core + agsc-cli alias,\nactions/attest provenance"]
    T2 --> R2
  end

  subgraph L3["Content CI + deploy - site ci.yml"]
    T3["Trigger: push to main, PR"]
    P3["permissions: contents: read;\ndeploy job elevated only as needed"]
    Sec3["secrets: CLOUDFLARE_API_TOKEN,\nCLOUDFLARE_ACCOUNT_ID\n(deploy job only, never in fork context)"]
    R3["npx agsc-cli ci -> publish www/\nto Cloudflare Pages;\n_headers/_redirects from the build"]
    T3 --> R3
  end

  subgraph L4["Refresh - refresh.yml"]
    T4["Trigger: weekly cron 29 5 * * 0"]
    P4["permissions: contents: read, issues: write"]
    Sec4["secrets: none"]
    R4["build: NOW lists stale items\n(no network at 1.0) -> at most ONE issue,\nnever a commit"]
    T4 --> R4
  end

  NOTE["All actions SHA-pinned + Dependabot;\nNEVER pull_request_target;\nnpm ci with a committed lockfile;\nsecrets only in the jobs that need them"]
  L1 -.-> NOTE
  L2 -.-> NOTE
  L3 -.-> NOTE
  L4 -.-> NOTE
```

## `/ns/` content negotiation via w3id `.htaccess`

```mermaid
sequenceDiagram
  participant Client
  participant W3ID as w3id.org (.htaccess)
  participant Site as agenticsystemcore.com /ns/

  Client->>W3ID: GET https://w3id.org/agentic-system-core/ns#Concept\nAccept: text/turtle
  W3ID->>W3ID: match Accept against a fixed table
  W3ID-->>Client: 303 See Other -> /ns/agsc.ttl
  Client->>Site: GET /ns/agsc.ttl
  Site-->>Client: 200 text/turtle (static file)

  Note over Client,Site: Accept: application/ld+json -> 303 -> /ns/context.jsonld<br/>Accept: application/rdf+xml -> 303 -> /ns/agsc.rdf<br/>no match -> /ns/ HTML index (no redirect, same-origin only)
```

Four lanes, no fifth: there is no server lane because there is no server (C2). Content CI is the only
lane that spends a credentialed secret, and only in the deploy job — never reachable from a fork PR.
The w3id `.htaccess` is the one piece of "conneg logic" in the whole system and it lives outside this
repo entirely (ADR-005); every redirect target is a same-origin static file, so there is no open
redirect to exploit (T5 in PLAN.md §12).

Trace: PRD-048–051, NFR-04, NFR-09 · PLAN.md §7 (lane table), §12 T4/T5/T6 · ADR-005.
