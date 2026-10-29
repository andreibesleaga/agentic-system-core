# Publish — put a node online and check it live

**Who it is for:** anyone with a node that builds — the `www/` folder of the
[Mode 0 guide](mode-0.md) or of any other mode — who wants it at a real address that
people and agents can rely on.

**What you get:** the node at an `https:` address of your own, with the response
headers the specification asks for, and a check of the live address by the shipped
checker (and, if you want a second opinion, by the Python checker): every file the
discovery document lists is fetched and its SHA-256 digest compared with the bytes the
host serves. No account with this project, no server code of your own.

**Read after:** [the Mode 0 guide](mode-0.md). **Next:** [Mode 1](mode-1.md), where two
published nodes name and check each other.

---

## Before you start

You need the package installed as in [the guides](README.md#before-any-guide) (Node.js
22.13 or later, `git`, a POSIX shell, the two `export` lines), a host that serves files
over HTTPS at an address you control, and a way to upload a folder to it. The steps up to
the upload run offline; the repository test `tests/docs/guides.test.js` runs them again
on every change. The upload and the live check need the network and are shown, not run.

## 1. A node ready to publish

If you followed the Mode 0 guide, use your own notes and skip to step 2. Otherwise make a
small node with the steps of that guide: notes, a security contact, the licence text, the
real address in `site.base`, one commit, then `ci` and `build`:

```bash demo
mkdir my-node && cd my-node
printf '# Sourdough starter\n\nFlour and water, fed once a day.\n' > sourdough.md
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
node -e 'const fs = require("node:fs"), base = "https://notes.example.org/", f = "agsc.config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.site.base = base; fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n"); const i = "content/index.md"; fs.writeFileSync(i, fs.readFileSync(i, "utf8").replace(/^base: .*$/m, "base: " + base));'
git init -q -b main && git add -A && git commit -q -m 'ready to publish'
agsc ci
agsc build
```

```text expect
ci: pass (0 error, 3 warn)
build: pass (0 error, 2 warn)
```

`site.base` must be the address you will publish at, ending in `/`: every page and every
link of the discovery document is written for that address, and a checker that fetches
the document from another address refuses it (see [When it says no](#when-it-says-no)).

Run `agsc ci` before every publish, not `agsc build` alone. A typed link whose target
does not exist is left out of the graph: `lint` and `ci` refuse it with `AGSC-E301`, and
from 1.1 `build` reports it as a warning with the same code, where at 1.0.0 it said
nothing; `build` refuses only a broken link in the text of a note (`AGSC-E310`).

## 2. Check the build as a reader will

Before anything leaves your machine, run the shipped checker on the discovery document
in `www/`. Given a file, it finds every file the document lists on disk and compares each
one's SHA-256 digest with the bytes:

```bash demo
node "$ENGINE/tools/validate-wellknown" www/.well-known/knowledge-linkset --level 2
```

```text expect
validate-wellknown pass (level 2): 11 input file(s) read, 0 error(s), 0 warning(s)
```

Level 2 is the level a published node claims: every link carries its digest, the graph
link carries the node's facts, and the ledger is linked. If the checker fails here, it
will fail on the live address too; fix the build first.

## 3. Choose a host

`agsc-host list` names the hosting profiles the engine can write settings for, with what
each one claims and its limits:

```bash demo
agsc-host list
```

```text expect
cloudflare-pages — Cloudflare Pages, the reference
static-host — Any web server: nginx or Apache httpd
github-pages — GitHub Pages, with a proxy in front for the headers
local — The node's own machine or device (agsc-host serve)
git-clone — A clone of the node's repository
ipfs — IPFS through an HTTP gateway
ledger-anchor — A ledger-anchored record of each build
```

Under each profile, its `claim:` and `limit:` lines are left out here. The list ends with
`solid`, a declaration only at 1.0.0, with no host settings to write.

Read the limits of the one you choose before you upload. For example, GitHub Pages lets
no site set a response header, so a node there needs a proxy in front that sets them, or
no Level can be claimed for the address.

## 4. Write the host's settings

A host serves the files; the settings make it send the headers a node needs (the
content type of the discovery document, the cross-origin pair, `no-cache` where a file
changes at every build, the security policy). `agsc-host emit <profile>` writes them for
one profile. For Cloudflare Pages, `agsc build` has already written them into `www/`
(`_headers` and `_redirects`), so there is nothing more to write:

```bash demo
agsc-host emit cloudflare-pages
ls www/_headers www/_redirects
```

```text expect
claim: deployment profile cloudflare-pages
agsc-host emit: pass (0 error, 0 warn)
www/_headers
www/_redirects
```

For nginx or Apache httpd, `emit static-host` writes an `nginx.conf` snippet to include
in your server block, and an `.htaccess` file inside `www/`:

```bash demo
agsc-host emit static-host
```

```text expect
wrote www/.htaccess
wrote dist/hosts/static-host/nginx.conf
claim: deployment profile static-host
```

The settings are derived from the build, so emit them again after every build.

## 5. Upload

Upload the contents of `www/` so that `www/index.html` is served at the address in
`site.base` and `www/.well-known/knowledge-linkset` at
`/.well-known/knowledge-linkset` under it. How depends on the host: a folder upload in
its dashboard, a deploy command of its own, or a copy to the server, for example:

```bash
rsync -a --delete www/ you@notes.example.org:/srv/notes/www/
```

Upload the build of the commit you checked, unchanged. A host feature that rewrites
pages on the way out (minifying, hiding e-mail addresses, injecting scripts) changes the
bytes, and the digests in the discovery document then no longer match what is served.

## 6. Check it live

Run the same checker on the live address. Given a URL, it fetches the discovery document
and every file it lists from the host, compares each digest with the bytes served, and
checks the response headers as well.

**On your own machine first.** `agsc-host serve` prints `http://localhost:8080/` (before 1.1 it
printed `http://127.0.0.1:8080/`), and both checkers compare the discovery document's anchor with the origin they fetched it from, and
the configuration admits `http://localhost(:port)/` as the one non-HTTPS `site.base`. To
check a node served locally at Level 2, set `site.base` to `http://localhost:8080/`,
rebuild, serve, and run each checker on
`http://localhost:8080/.well-known/knowledge-linkset --level 2 --dev` (the Python checker
also needs `--allow-network`); use `localhost`, not `127.0.0.1`, in both places. `--dev`
admits plain `http` to a loopback address and nothing else (AGSC-09-93). The Node checker
accepts `--allow-network` too, and says so once when a URL is given without it (from 2.0 the
flag is required); `--max-requests <n>` (1 to 2000, default 500) stops a run that would
fetch more files than that, with `AGSC-E906`.

On the live address:

```bash
node "$ENGINE/tools/validate-wellknown" https://notes.example.org/.well-known/knowledge-linkset --level 2
```

```text
validate-wellknown pass (level 2): … input file(s) read, 0 error(s), 0 warning(s)
```

For a second opinion, the Python checker (`pip install agentic-system-core`, Python 3.9
or later, no other dependency) runs the same rules from another code base. It opens a
connection only when the command line says so:

```bash
python3 -m agentic_system_core.cli validate-wellknown https://notes.example.org/.well-known/knowledge-linkset --level 2 --allow-network
```

Both checkers print one line per finding and exit 0 on a pass, 1 on a finding. Run the
check again after every upload; a scheduled run (once a week, say) tells you when a host
setting has changed under you.

## When it says no

The live check names what is wrong. The usual causes:

| What you see | Why | What to do |
|---|---|---|
| `error AGSC-E907 … HTTP 404 for https://…` | the file is not at that address | upload the contents of `www/`, not the folder itself; check the address |
| `error AGSC-E907 anchor … is not on the origin the document was retrieved from …` | `site.base` names another address | set `site.base` to the published address, commit, build, upload again |
| `error AGSC-E905 scheme not allowed: http:` | the address is not `https:` | publish over HTTPS; plain `http:` is admitted only on your own machine, with `--dev` |
| `error AGSC-E202 no Access-Control-Allow-Origin …`, `no ETag …`, `Cache-Control is …` | the host did not send a header the node needs | apply the settings of step 4 for your host |
| `error AGSC-E201 relation …: digest does not match the bytes of https://…` | the bytes served differ from the bytes built | upload the build again, unchanged; turn off any host feature that rewrites pages |

The last one is easy to see without a host. A copy of the build with one changed byte
fails the same way:

```bash demo
cp -R www changed && printf ' ' >> changed/llms.txt
node "$ENGINE/tools/validate-wellknown" changed/.well-known/knowledge-linkset --level 2 || echo "checker exit $?"
```

```text expect
changed/.well-known/knowledge-linkset:1:1 error AGSC-E201 relation alternate: digest does not match the bytes of https://notes.example.org/llms.txt
checker exit 1
```

Every code the guides and the demos print, with its cause and what to do, is on the
[troubleshooting](troubleshooting.md) page.

## What next

- Name another node as a peer and check each other: [Mode 1](mode-1.md).
- Check every push before it is published: the action in the root
  [README](../../README.md#connecting-agents-and-repositories).
- What a conformance claim states, and how to write one for your node:
  [CONFORMANCE-STATEMENTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONFORMANCE-STATEMENTS.md).
