# 01 — Bundle, in plain language

**The directory.** `content/` holds the items in type folders, `content/attachments/<slug>/` holds media, and `agsc.config.json` is the single configuration file. Nothing else is required.

**Names.** Every item has a slug: lowercase letters, digits and single hyphens, 1–64 characters, unique in the Bundle. The slug is the file name and the last part of the item's web address.

**The configuration file.** It is closed: a key the specification does not name is an error, except vendor keys that start with `x-`. It carries the site base URL, licences, tag lists, release switches, peers, channels and the boundary parameters (`federation`, `chunks`, `contribute`, `visibility`, `attachments`), each with a default and a maximum.

**Import.** A folder of bare Markdown can be adopted with one command; unknown frontmatter keys are kept and reported as warnings, never errors.

**Export.** Markdown, JSON-LD and JSONL exports are lossless round trips; the prose exports carry the Content Use Terms, or the prose licence the node names in their place.

**Channels.** Messages from a mailbox or a chat can become proposals, under guards: a sender list, a rate, a cap on open proposals, injection checks.

**Paths.** A relative path never contains `..`, `.` segments, a leading slash, a backslash or a NUL, and always resolves inside the Bundle.

**Agent lanes.** The configuration may declare agents: a name, a kind (model or program), the forge identity and the accountable person, the model, what it may do, which item types it may touch, the channel its proposals go through, a schedule, a monthly budget, how many items one proposal may create (default twenty) and how many tasks it may hold at once (default one). Disabled unless switched on. The whole node has one cap on model spend of every kind, ten dollars a month unless changed, and the agents' budgets may not add up to more. Anything host-specific or secret — the cap, an agent's switch or budget, the model key — can be set in a `.env` file in the Bundle root that is never committed; `init` lists the recognised names in `.env.example`.

Rules: `spec/01-bundle.md`, `AGSC-01-01` … `AGSC-01-38`.
