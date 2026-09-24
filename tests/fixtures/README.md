# `tests/fixtures/` — the inputs the tests share

**Summary.** Small, fixed inputs used by many tests. The files inside each folder are
test data, byte for byte: a `README.md` inside a fixture folder is part of the fixture
(an import source that carries one), not documentation of it.

**Read after:** [tests/README.md](../README.md).

| Folder | What it is |
|---|---|
| `minimal/` | the smallest conforming Bundle; a port in another language can use it (`src/README.md` §6) |
| `with-assets/` | a Bundle with attachments |
| `diagrams/` | diagram sources and their expected SVG (the compiler's golden files) |
| `old-site-10/` | ten cards of the retired pattern site, for `import --from old-site` |
| `pm-*/` | exports of project-board tools (GitHub, GitLab, Jira, Trello, Linear, Asana, Notion, Obsidian Kanban, Todo.txt, Markdown, and this node's own board format), for the `board` adapter |
| `skills-*/` | skills repositories in each layout the `skills` adapter reads |

Changing a fixture changes what the tests prove; a change here needs the tests that use
it re-read, and a golden file is regenerated only by the test that owns it.
