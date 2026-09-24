# ILLUSTRATIVE — not executed by the test suite. No network, no key.
# examples/connectors/frameworks/autogen_memory.py
#
# Load a node's chunks into an AutoGen agent memory. AutoGen's Memory protocol has
# add / query / update_context / clear / close, and a record is
# MemoryContent{content, mime_type, metadata}
# (microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html,
# read 2026-09-23). The records come from `records.js` (run by the test suite):
#
#   node records.js www/chunks.jsonl autogen > node.autogen.jsonl
#
# Check the import path of MemoryContent below against the AutoGen documentation
# for the version you run; it has moved between releases.
import json

from autogen_core.memory import MemoryContent  # check against your AutoGen version


async def load(memory, path="node.autogen.jsonl"):
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            await memory.add(MemoryContent(content=record["content"],
                                           mime_type=record["mime_type"],
                                           metadata=record["metadata"]))
