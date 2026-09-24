# Flow — a release

**What this shows.** How a version reaches npm. The maintainer runs the release checks
locally, then pushes two tags on one commit: the specification's own tag and the
engine's `v` tag. Only the `v` tag starts the release workflow, which re-runs every
gate on three operating systems, packs both packages once, attests the tarballs and
publishes exactly those tarballs through npm trusted publishing. No token is stored.

```mermaid
flowchart TD
  LOC["Maintainer: npm test, tools/release (dry run),<br/>public-hygiene, npm audit"]
  TAGS["Two tags on one commit:<br/>1.0.0-rc.N (specification) and v1.0.0-rc.N (engine)"]
  WF["release.yml, on the v tag only"]
  GATES["gates job: suite, validators,<br/>fixture discovery document, release checks,<br/>hygiene, architecture lane (3 OS)"]
  PACK["npm pack, once per package"]
  ATT["attest build provenance"]
  PUBL["npm publish the attested tarballs<br/>(trusted publishing, provenance)"]
  LOC --> TAGS --> WF --> GATES --> PACK --> ATT --> PUBL
```

Trace: PRD-048, PRD-049, PRD-050 (the release lane), NFR-09, AGSC-10-05. The file
headers of `.github/workflows/release.yml` and `tools/release` are the detail.
