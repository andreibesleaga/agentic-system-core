# `examples/hosts/` — a hosting profile written outside the engine

**Summary.** `header-rules.js` is a minimal plugin of the deployment-profile kind: it
hands a CDN or a proxy that takes a JSON rule list the reference header rules exactly
as the build wrote them, and states what the proxy must do with them. It shows how to
put a node on a host the seven built-in profiles do not cover.

**Read first:** the "Where a node can live" section of
[docs/ARCHITECTURE-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-GUIDE.md), and
[docs/PLUGINS.md](../../docs/PLUGINS.md) for the deployment-profile row.

```bash
node bin/agsc-host.js list                                   # the built-in profiles, from the repository root
node bin/agsc-host.js emit ./examples/hosts/header-rules.js --site <build dir> --out <dir>
```
