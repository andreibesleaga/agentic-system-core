# agsc.config.json — the keys the modes use

Required: `spec_version`, `site{base, title}`, `bundle{id, operator, license_prose, license_schema}`. `tags.allowed[]` is the closed tag list. A node's own configuration is closed: an unknown key is an error.

```json
{
  "peers": ["https://other.example/.well-known/knowledge-linkset"],
  "contribute": [{ "mode": "pr", "target": "https://github.com/owner/repo" }],
  "run": { "enabled": true, "allow": ["echo", "npm"] },
  "budget": { "usd_month": 10 },
  "channels": [{ "name": "main", "adapter": "github", "author": "board-bot", "owner": "human:operator" }],
  "agents": [{
    "name": "worker", "kind": "llm", "model": "<model id>", "operator": "human:operator",
    "author": "board-bot", "channel": "main", "enabled": true,
    "tasks": ["plan", "claim", "work", "refresh"], "types": ["concept", "episode"],
    "budget_usd_month": 5, "max_claims": 1, "max_new_items": 20
  }]
}
```

| Key | Mode | Meaning |
|---|---|---|
| `peers[]` | 1 | other nodes' discovery URLs, at the root of their origins; check both sides with `validate-wellknown <a> --level 2 --peer <b>` |
| `contribute[]` | 1, 5 | where proposals go: `mode` `pr` (an https target), `channel` (`mailto:` or `urn:agsc:channel:<name>`) or `form` |
| `run{}` | 4 | `enabled` (default false) and the programs a `run` block may start |
| `compose.brief` | 4 | `true` makes every `compose` write the brief beside the Harness, as `--brief` does (default false) |
| `budget.usd_month` | 0, 5 | the node's monthly cap on model spend; the enabled lanes' budgets may not add up to more (`AGSC-E212`) |
| `channels[]` | 5 | where an agent lane's proposals are opened; `author` is the forge login, `owner` the accountable person; `publish: auto` merges only under the standing-ratification rules |
| `agents[]` | 0, 5 | agent lanes, off unless `enabled`; `types` may be `concept`, `episode`, `lesson`, never a procedure, gate or cluster; `budget_usd_month` and `model` required when `kind` is `llm` |
| `federation{}` | 1 | walk limits: `hop_limit` 3, `fan_out` 50, `max_requests` 500, `redirect_limit` 3, `timeout_ms` 10000 by default |
| `releases{}` | any | an item with `release: <key>` publishes only when that key is true |
| `bundle.creator{name, orcid}`, `site.author_orcid` | 0 | the creator of the home page's Dataset block, with an ORCID iD; without `bundle.creator`, `site.author` and `site.author_orcid` are used |
| `bundle.license_url` | 0 | the address of a specific version of the licence (for example `https://creativecommons.org/licenses/by/4.0/`): the Dataset block's `license` and the `license` link of `/`; without it, `/legal/` when the node uses the Content Use Terms |
| `surfaces[]` | 1 | the declaration-only surfaces: `responder` (a remote endpoint; `binding` is its A2A protocol binding, default `JSONRPC`), `a2a-card` and `solid`; `/.well-known/agent-card.json` is written only when both `a2a-card` and a `responder` are declared, and `a2a-card` alone is `AGSC-E210` |
| `discovery.ai_catalog` | 1 | `true` writes `/.well-known/ard.json` and `/.well-known/ai-catalog.json`, two proposed catalogue formats that point at the discovery document and the card (default false; `site.base` must be a domain name) |

A value outside its bound is `AGSC-E209`. Schema: the engine's `schema/config.schema.json`.
