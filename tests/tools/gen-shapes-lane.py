"""Development lane for AGSC-05-24: runs schema/item-shapes.ttl with pySHACL over graphs.

Reads one JSON object from standard input,
{"shapes": <Turtle text>, "cases": [{"id": ..., "format": "nquads"|"turtle", "data": ...}]},
and writes, for each case in the order given, the results of the validation as a list of
{"severity", "shape", "focus", "path", "value"} (severity as sh:Violation, sh:Warning or
sh:Info; shape is the source shape; absent parts are null), sorted. Needs pySHACL (and its
rdflib); their versions go to standard error. Never part of the build or of the engine, and
never a dependency of the package.

One normalisation, applied to the shapes and to every graph: a simple literal becomes an
xsd:string literal. RDF 1.1 makes the two the same literal; rdflib 7 keeps them apart, and
graph.nq writes the datatype where graph.ttl does not.
"""
import json
import sys

import pyshacl
import rdflib
from rdflib.namespace import RDF, SH, XSD


def load(text, fmt):
    """Parse into one flat graph (graph.nq carries a graph name; the shapes ignore it)."""
    if fmt == "nquads":
        dataset = rdflib.Dataset()
        dataset.parse(data=text, format="nquads")
        graph = rdflib.Graph()
        for s, p, o, _ in dataset.quads((None, None, None, None)):
            graph.add((s, p, o))
    else:
        graph = rdflib.Graph()
        graph.parse(data=text, format="turtle")
    return normalise(graph)


def normalise(graph):
    plain = [(s, p, o) for s, p, o in graph if isinstance(o, rdflib.Literal) and o.datatype is None and o.language is None]
    for s, p, o in plain:
        graph.remove((s, p, o))
        graph.add((s, p, rdflib.Literal(str(o), datatype=XSD.string)))
    return graph


def short(term):
    if term is None:
        return None
    return str(term)


def results_of(report):
    found = []
    for node in report.subjects(RDF.type, SH.ValidationResult):
        found.append({
            "severity": short(report.value(node, SH.resultSeverity)),
            "shape": short(report.value(node, SH.sourceShape)),
            "focus": short(report.value(node, SH.focusNode)),
            "path": short(report.value(node, SH.resultPath)),
            "value": short(report.value(node, SH.value)),
        })
    return sorted(found, key=lambda r: json.dumps(r, sort_keys=True))


request = json.load(sys.stdin)
print("pyshacl " + pyshacl.__version__ + ", rdflib " + rdflib.__version__, file=sys.stderr)
shapes = load(request["shapes"], "turtle")
out = []
for case in request["cases"]:
    data = load(case["data"], case["format"])
    _, report, _ = pyshacl.validate(data, shacl_graph=shapes, inference="none", abort_on_first=False)
    out.append({"id": case["id"], "results": results_of(report)})
json.dump(out, sys.stdout)
