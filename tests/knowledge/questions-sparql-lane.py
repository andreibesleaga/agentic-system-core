"""Development lane for AGSC-05-34: runs the SPARQL text of the questions over graph.nq.

Reads one JSON object from standard input, {"nquads": ..., "runs": [{"sparql": ...}]},
and writes, for each run, the rows of its result as lists of strings (an IRI as its text,
a literal as its lexical form, an unbound variable as null) in the order the query
returns them. The caller turns the rows into the answer shape and compares them with
the function. Needs pyoxigraph (Oxigraph); its version goes to standard error. Never part
of the build or of the engine.
"""
import json
import sys

import pyoxigraph

data = json.load(sys.stdin)
store = pyoxigraph.Store()
store.bulk_load(data["nquads"].encode("utf-8"), format=pyoxigraph.RdfFormat.N_QUADS)
print("pyoxigraph " + pyoxigraph.__version__, file=sys.stderr)


def text(term):
    if term is None:
        return None
    return term.value


out = []
for run in data["runs"]:
    solutions = store.query(run["sparql"], use_default_graph_as_union=True)
    variables = [v.value for v in solutions.variables]
    out.append([[text(row[name]) for name in variables] for row in solutions])
json.dump(out, sys.stdout)
