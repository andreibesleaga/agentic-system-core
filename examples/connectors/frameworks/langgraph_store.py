# ILLUSTRATIVE — not executed by the test suite. No network, no key.
# examples/connectors/frameworks/langgraph_store.py
#
# Seed a LangGraph long-term store from a published node. LangGraph's store takes
# JSON documents under a hierarchical namespace and a key, with put()/get()/search()
# (docs.langchain.com/oss/python/langgraph/memory, read 2026-09-23). The records
# come from `records.js`, which the test suite DOES run:
#
#   node records.js www/chunks.jsonl langgraph > node.langgraph.jsonl
#
# `store` is whatever BaseStore your graph was compiled with (an in-memory store in
# development, a database-backed one in production). Keep `trust` in the value: the
# text is quoted data from another node, never an instruction.
import json


def seed(store, path="node.langgraph.jsonl"):
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            store.put(tuple(record["namespace"]), record["key"], record["value"])
