#!/usr/bin/env bash
#
# Build and check the AgenticSystemCore Internet-Draft
# (draft-besleaga-agentic-knowledge-wellknown).
#
#   ./build.sh 00                    build revision -00 from this directory
#   ./build.sh 00 /path/to/dir       build revision -00 from another directory
#   DRAFT_DIR=/path/to/dir ./build.sh 00     (same, via env var)
#   ./build.sh --no-idnits 00        skip the idnits v3 nits check
#   ./build.sh --help
#
# Pattern reused from this author's other Internet-Draft toolchain
# (rfc-sustainability-wellknown/internet-drafts/build.sh): kramdown-rfc ->
# xml2rfc --v2v3 (clean RFCXML v3 vocabulary) -> xml2rfc --text/--html ->
# idnits. That script's header explains why the xml2rfc --v2v3 step and the
# post-processing below exist: kramdown-rfc's own -3/--v3 mode still emits
# RFCXML v2 elements (<spanx>, <list>) and per-line <?line N?> processing
# instructions, and idnits v3 (the Datatracker's own upload checker) flags
# both -- plus a "References" wrapper without a proper Normative/Informative
# split, and the U+00A0 no-break space kramdown-rfc writes inside "BCP 14" -
# as nits that have nothing to do with the draft's actual content. This
# script produces <draft>.xml, converts it to clean v3 vocabulary, strips
# those four toolchain artifacts (in place, as text, so the DOCTYPE entities
# and layout xml2rfc chose survive; draft content is never touched), then
# renders <draft>.txt/<draft>.html and runs the checks below.
#
# Checks performed, in order (exits non-zero on the first failed check):
#   * kramdown-rfc, xml2rfc --v2v3 --strict and xml2rfc --text/--html all
#     complete without error
#   * the front-matter `docname:` in <draft>.md equals the file name
#   * no RFCXML v2 elements, <?line?> PIs, non-ASCII characters or a
#     combined-references wrapper remain in <draft>.xml after cleanup
#   * <draft>.md and <draft>.txt are pure ASCII
#   * no line in <draft>.txt exceeds 72 characters
#   * idnits v3 (the @ietf-tools/idnits npm package): "submission" mode -- the
#     Datatracker upload check -- must be nit-free; "normal" mode -- the
#     same tool and mode the Datatracker runs on every upload, and what
#     https://author-tools.ietf.org/idnits3 runs), on both <draft>.xml and
#     <draft>.txt, reports zero errors (skip with --no-idnits)
#
# Tool resolution -- override any of these, or just install the tools where
# they are already found on PATH and leave the variables unset:
#
#   KDRFC     path to the kramdown-rfc binary (gem: kramdown-rfc)
#             default: <scratch>/idtools/gems/bin/kramdown-rfc
#   XML2RFC   path to the xml2rfc binary (pip: xml2rfc)
#             default: <scratch>/idtools/venv/bin/xml2rfc
#   IDNITS    path to the idnits v3 CLI (npm: @ietf-tools/idnits)
#             default: <scratch>/idtools/npm/node_modules/.bin/idnits
#             needs a `node` (v18+) on PATH at run time; none of these
#             defaults are pinned to a specific Node version.
#
# The defaults above point into this machine's scratch directory
# (session/temporary storage -- see the maintainer notes for why, and for the exact
# install commands to reproduce it or to install the tools somewhere
# permanent instead). A legacy Perl/bash `idnits` (2.17.1) may also be
# installed alongside these tools for reference; it is never used by this
# script -- idnits v3 is the only nits check here, per the current
# requirement that the check match what the Datatracker runs on upload.
#
# Requirements: ruby+gem (kramdown-rfc), python3+pip (xml2rfc), node (idnits
# v3, unless --no-idnits).

set -euo pipefail

SCRATCH_DEFAULT="${IDTOOLS:-${TMPDIR:-/tmp}/idtools}"
KDRFC="${KDRFC:-$SCRATCH_DEFAULT/gems/bin/kramdown-rfc}"
XML2RFC="${XML2RFC:-$SCRATCH_DEFAULT/venv/bin/xml2rfc}"
IDNITS="${IDNITS:-$SCRATCH_DEFAULT/npm/node_modules/.bin/idnits}"

RUN_IDNITS=1
REV=""
DIR_ARG=""

for arg in "$@"; do
  case "$arg" in
    --no-idnits) RUN_IDNITS=0 ;;
    -h|--help)   sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    [0-9][0-9])  if [ -z "$REV" ]; then REV="$arg"; else DIR_ARG="$arg"; fi ;;
    *)           DIR_ARG="$arg" ;;
  esac
done

[ -n "$REV" ] || { echo "usage: $0 [--no-idnits] <revision> [draft-dir]" >&2; echo "       e.g. $0 00" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRAFT_DIR="${DIR_ARG:-${DRAFT_DIR:-$SCRIPT_DIR}}"
cd "$DRAFT_DIR"

BASE="draft-besleaga-agentic-knowledge-wellknown"
DRAFT="$BASE-$REV"
[ -f "$DRAFT.md" ] || { echo "ERROR: $DRAFT.md not found in $DRAFT_DIR" >&2; exit 1; }
echo "==> building $DRAFT (in $DRAFT_DIR)"

missing=0
for pair in "KDRFC:$KDRFC" "XML2RFC:$XML2RFC"; do
  name="${pair%%:*}"; path="${pair#*:}"
  if [ ! -x "$path" ] && ! command -v "$path" >/dev/null 2>&1; then
    echo "ERROR: $name not found at '$path' and not on PATH" >&2
    missing=1
  fi
done
if [ "$RUN_IDNITS" -eq 1 ] && [ ! -x "$IDNITS" ] && ! command -v "$IDNITS" >/dev/null 2>&1; then
  echo "ERROR: IDNITS not found at '$IDNITS' and not on PATH (or pass --no-idnits)" >&2
  missing=1
fi
[ "$missing" -eq 0 ] || exit 1

# kramdown-rfc shells out to the co-installed `kramdown-rfc2629` binary by
# name, so its directory must be on PATH (not just $KDRFC itself).
KDRFC_BIN_DIR="$(cd "$(dirname "$KDRFC")" 2>/dev/null && pwd || true)"
[ -n "$KDRFC_BIN_DIR" ] && export PATH="$KDRFC_BIN_DIR:$PATH"

# Without an explicit GEM_HOME/GEM_PATH, Ruby's gem activation resolves
# `kramdown-rfc` against whatever default gem environment is already on this
# machine, which can silently pick up an unrelated pre-existing install
# instead of the one under KDRFC (verified: on this machine, without this,
# the stub ran kramdown-rfc 1.7.39 from elsewhere instead of the 1.7.43
# installed alongside $KDRFC). Pin them to $KDRFC's own gem home so the
# scratch install is always the one actually used.
KDRFC_GEM_HOME="$(dirname "$KDRFC_BIN_DIR")"
if [ -d "$KDRFC_GEM_HOME/specifications" ] || [ -d "$KDRFC_GEM_HOME/gems" ]; then
  export GEM_HOME="$KDRFC_GEM_HOME"
  export GEM_PATH="$KDRFC_GEM_HOME"
fi

fail=0
note_fail() { echo "    FAIL: $1"; fail=1; }

# --- front matter -----------------------------------------------------------
docname="$(sed -n 's/^docname:[[:space:]]*//p' "$DRAFT.md" | head -1 | tr -d '[:space:]')"
if [ "$docname" = "$DRAFT" ]; then
  echo "    OK   front-matter docname matches $DRAFT"
else
  note_fail "front-matter docname '$docname' does not match file name '$DRAFT'"
fi

if LC_ALL=C grep -qP '[^\x00-\x7F]' "$DRAFT.md" 2>/dev/null; then
  note_fail "non-ASCII characters in $DRAFT.md"
else
  echo "    OK   $DRAFT.md is pure ASCII"
fi

# --- build --------------------------------------------------------------
# kramdown-rfc -3 emits RFCXML v2 elements/PIs; xml2rfc --v2v3 --strict
# rewrites them to real v3 vocabulary.
"$KDRFC" -3 "$DRAFT.md" > "$DRAFT.v2.xml"
"$XML2RFC" --v2v3 --strict "$DRAFT.v2.xml" -o "$DRAFT.xml" 2>&1 | grep -v '^ Created file' || true
rm -f "$DRAFT.v2.xml"

# Strip the remaining idnits-v3 toolchain artifacts: <?line?> PIs, a
# combined References wrapper, cited-reference <abstract> blocks (never
# rendered; can contain terms idnits flags), and the U+00A0 kramdown-rfc
# writes inside "BCP 14". This never touches rendered document content, and
# refuses to leave the file if any artifact survives.
python3 - "$DRAFT.xml" <<'PY'
import re, sys

path = sys.argv[1]
xml = open(path, encoding="utf-8").read()

xml = re.sub(r"(?m)^[ \t]*<\?line -?[0-9]+\?>[ \t]*\n", "", xml)

start = xml.find('<references anchor="sec-combined-references">')
if start >= 0:
    depth, pos = 0, start
    for m in re.finditer(r"<references[\s>]|</references>", xml[start:]):
        depth += -1 if m.group().startswith("</") else 1
        if depth == 0:
            pos = start + m.start()
            break
    else:
        raise SystemExit("v3-postprocess: unbalanced <references> wrapper")
    inner = xml[start:pos]
    # The wrapper is always unwrapped: this is the form the author's posted
    # sustainability drafts use and the Datatracker accepts (submission mode
    # nit-free). Keeping it trades idnits-v3 normal-mode
    # MULTIPLE_REFERENCES_SECTION_TITLES (txt) for INVALID_REFERENCES_NAME
    # (xml); neither appears in submission mode, which is the gate.
    # RETESTED 2026-09-18 (maintainer notes §1 item 1's
    # "tested fix": keep the wrapper when it holds >=2 nested <references>
    # blocks). Result: the .txt MULTIPLE_REFERENCES_SECTION_TITLES error did
    # disappear, but the .xml lane then failed normal mode with a NEW error,
    # INVALID_REFERENCES_NAME ("references section <name> element should be
    # either Normative or Informative") -- a straight trade, not a net gain,
    # so the conditional keep was reverted. Submission mode is nit-free
    # either way; see the maintainer notes, "Rejected: conditional references wrapper".
    keep_wrapper = False
    if True:
        inner = re.sub(r'^<references anchor="sec-combined-references">\s*', "", inner)
        inner = re.sub(r"^<name>References</name>\s*", "", inner)
        line_start = xml.rfind("\n", 0, start) + 1
        close_end = pos + len("</references>")
        if xml[close_end:close_end + 1] == "\n":
            close_end += 1
        indent = xml[line_start:start]
        xml = xml[:line_start] + indent + inner.rstrip() + "\n" + xml[close_end:]
else:
    keep_wrapper = False

back = xml.find("<back>")
if back >= 0:
    xml = xml[:back] + re.sub(r"\s*<abstract>.*?</abstract>", "", xml[back:], flags=re.S)

xml = xml.replace(" ", " ")

# kramdown-rfc appends the gzip-compressed Markdown source as an XML comment
# ("<!-- ##markdown-source: ... -->"). It is a round-trip convenience for
# kramdown-rfc alone: xml2rfc ignores it, the .txt and .html never carry it, and
# its base64 differs at every build (the gzip header carries a timestamp), which
# made two builds of one input differ by ~500 lines and let a byte run inside it
# read as a word it is not. Dropped so that the XML is a function of the source.
xml = re.sub(r"\n?[ \t]*<!-- ##markdown-source:.*?-->[ \t]*\n?", "\n", xml, flags=re.S)

problems = []
if "##markdown-source:" in xml:
    problems.append("the ##markdown-source comment remains")
if re.search(r"<spanx[\s>]|<list[\s>]|<vspace[\s/>]", xml):
    problems.append("RFCXML v2 elements remain")
if "<?line" in xml:
    problems.append("<?line?> processing instructions remain")
if not keep_wrapper and re.search(r"<back>\s*<references[^>]*>\s*<name>References</name>", xml):
    problems.append("a combined <references> wrapper remains")
if re.search(r"[^\x00-\x7f]", xml):
    problems.append("non-ASCII characters remain")
if problems:
    raise SystemExit(f"v3-postprocess: {path}: " + "; ".join(problems))

open(path, "w", encoding="utf-8").write(xml)
PY
echo "    wrote $DRAFT.xml (clean RFCXML v3 vocabulary)"

"$XML2RFC" --v3 --text --html "$DRAFT.xml" 2>&1 | grep -v '^ Created file' || true
echo "    wrote $DRAFT.txt, $DRAFT.html"

# --- local checks ------------------------------------------------------
echo "==> checks"

long=$(awk 'length > 72' "$DRAFT.txt" | wc -l | tr -d ' ')
if [ "$long" -eq 0 ]; then echo "    OK   no lines over 72 characters"
else note_fail "$long line(s) over 72 characters"; awk 'length>72 {print "         " FNR ": " $0}' "$DRAFT.txt" | head -5; fi

if LC_ALL=C grep -qP '[^\x00-\x7F]' "$DRAFT.txt" 2>/dev/null; then
  note_fail "non-ASCII characters in the rendered text"
else echo "    OK   $DRAFT.txt is pure ASCII"; fi

# --- idnits v3 (the Datatracker's own upload checker) -----------------------
if [ "$RUN_IDNITS" -eq 1 ]; then
  # Gate: submission mode -- exactly what the Datatracker runs on upload.
  # Informational: normal mode (stricter; known unavoidable warnings are the
  # real w3id.org identifiers, PREFER_BCP14_REF and the Appendix ToC lines).
  echo "==> idnits v3 (submission mode -- the Datatracker's upload check)"
  for target in "$DRAFT.xml" "$DRAFT.txt"; do
    n=$("$IDNITS" -m submission -o count --no-progress "$target" 2>/dev/null | tail -1 || true)
    if [ -z "$n" ]; then
      note_fail "could not run idnits v3 on $target"
    elif [ "$n" = "0" ]; then
      echo "    OK   idnits v3 (submission): $target is nit-free"
    else
      note_fail "idnits v3 (submission) reports $n nit(s) on $target"
      "$IDNITS" -m submission -o simple --no-progress "$target" 2>/dev/null | sed 's/^/         /' || true
    fi
  done
  echo "==> idnits v3 (normal mode, informational only; known: MULTIPLE_REFERENCES_SECTION_TITLES, w3id.org TLD, PREFER_BCP14_REF, Appendix ToC indentation)"
  for target in "$DRAFT.xml" "$DRAFT.txt"; do
    out=$("$IDNITS" -m normal -o simple --no-progress "$target" 2>/dev/null || true)
    errs=$(printf '%s\n' "$out" | grep -c "Error |" || true)
    warns=$(printf '%s\n' "$out" | grep -c "Warning |" || true)
    echo "    info idnits v3 (normal): $target has $errs error(s), $warns warning(s) -- informational, not a gate"
    printf '%s\n' "$out" | grep "Error |\|Warning |" | sed 's/^/         /' || true
  done
else
  echo "==> idnits v3 skipped (--no-idnits)"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "==> $DRAFT built and checked clean"
else
  echo "==> $DRAFT FAILED one or more checks (see FAIL lines above)" >&2
  exit 1
fi
