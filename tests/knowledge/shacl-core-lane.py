"""Development lane for AGSC-05-41: the shared SHACL Core fixtures, run with pySHACL.

Reads one JSON object from standard input, {"cases": [{"id", "shapes", "data"}]} (Turtle
texts), and writes, for each case in the order given, the results of the validation in the
form `src/knowledge/shacl-core.js` returns them: {"component", "focus", "message", "path",
"severity", "shape", "value"}, sorted by focus node, source shape, path, component and value.
A term is an IRI as itself or a literal in N-Triples form (xsd:string written bare); a
property shape that is a blank node is named "<parent> > <path>"; an inverse path is "^<IRI>";
the message is the shape's sh:message values in code-point order joined by " | ", or null.
Only the results the report lists with sh:result are read (never the sh:detail below them).
Needs pySHACL (and its rdflib); their versions go to standard error. Never part of the build
or of the engine, and never a dependency of the package.
"""
import json
import sys

import pyshacl
import rdflib
from rdflib.namespace import RDF, SH, XSD


def literal_text(term):
    value = str(term).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r")
    if term.language:
        return f'"{value}"@{term.language}'
    if term.datatype is None or term.datatype == XSD.string:
        return f'"{value}"'
    return f'"{value}"^^<{term.datatype}>'


def term_text(term):
    if term is None:
        return None
    if isinstance(term, rdflib.Literal):
        return literal_text(term)
    return str(term)


def path_text(shapes, path):
    if path is None:
        return None
    if isinstance(path, rdflib.URIRef):
        return str(path)
    return "^" + str(shapes.value(path, SH.inversePath))


def shape_name(shapes, shape):
    if isinstance(shape, rdflib.URIRef):
        return str(shape)
    parent = sorted(shape_name(shapes, p) for p in shapes.subjects(SH.property, shape))[0]
    return parent + " > " + path_text(shapes, shapes.value(shape, SH.path))


def local(term):
    return str(term).split("#")[1]


def results_of(shapes, report):
    found = []
    top = report.value(predicate=RDF.type, object=SH.ValidationReport)
    for node in report.objects(top, SH.result):
        source = report.value(node, SH.sourceShape)
        messages = sorted(str(m) for m in shapes.objects(source, SH.message))
        found.append({
            "component": local(report.value(node, SH.sourceConstraintComponent)),
            "focus": term_text(report.value(node, SH.focusNode)),
            "message": " | ".join(messages) if messages else None,
            "path": path_text(shapes, shapes.value(source, SH.path)),
            "severity": local(report.value(node, SH.resultSeverity)),
            "shape": shape_name(shapes, source),
            "value": term_text(report.value(node, SH.value)),
        })
    return sorted(found, key=lambda r: (r["focus"], r["shape"], r["path"] or "", r["component"], r["value"] or ""))


request = json.load(sys.stdin)
print("pyshacl " + pyshacl.__version__ + ", rdflib " + rdflib.__version__, file=sys.stderr)
out = []
for case in request["cases"]:
    shapes = rdflib.Graph().parse(data=case["shapes"], format="turtle")
    data = rdflib.Graph().parse(data=case["data"], format="turtle")
    _, report, _ = pyshacl.validate(data, shacl_graph=shapes, inference="none", abort_on_first=False)
    out.append({"id": case["id"], "results": results_of(shapes, report)})
json.dump(out, sys.stdout, ensure_ascii=False)
