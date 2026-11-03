'use strict';
// src/application/cli/verbs/_site-checks.js — the check of AGSC-09-20, wired for `verify` and
// `ci`. APPLICATION LAYER: it gathers the inputs the check needs from the loaded Bundle and the
// build (the published `graph.nq`, the engine's ontology, the site vocabulary, the shapes and
// the questions) and hands them to `knowledge/site-checks.js`, which owns the rule.
//
// A Bundle that declares neither `domain.shapes` nor `domain.questions` runs no check: `check`
// returns `null` and the verbs exit as 1.0 does (AGSC-09-20). The knowledge module, and with it
// the SHACL and SPARQL libraries, is required only then, so that a node without the files does
// not load them.

const helpers = require('./_helpers.js');

/** The members of `domain` the check reads, and the loader's texts of them. */
function declaredOf(bundle) {
  const object = (bundle.config && bundle.config.domain) || {};
  const named = (key) => typeof object[key] === 'string';
  return { named, object, texts: bundle.domain || {} };
}

/** A named file as `{file, text}`; `undefined` when it is not named. */
const fileOf = ({ named, object, texts }, key) => (named(key) ? { file: object[key], text: texts[key] } : undefined);

/** Does the Bundle declare a file of the check (AGSC-09-20)? */
function declares(bundle) {
  const { named } = declaredOf(bundle);
  return named('shapes') || named('questions');
}

/**
 * The loader's findings about the files the check reads (`AGSC-E901` for an absent one, or the
 * refusal of a file it may not read, AGSC-01-41), for `verify`, which reports no other loader
 * finding; `ci` reports them with the rest of the Bundle's.
 */
function loaderFindings(bundle) {
  if (!declares(bundle)) return [];
  const { named, object } = declaredOf(bundle);
  const files = new Set(['vocabulary', 'shapes', 'questions'].filter(named).map((key) => object[key]));
  return (bundle.findings || []).filter((f) => files.has(f.file));
}

/**
 * AGSC-09-20: the site's invariants and competency questions over the `graph.nq` of a build.
 *
 * @param {object} bundle the loaded Bundle
 * @param {Map<string, string>} files the routes of a build of it
 * @returns {Array<object>|null} the findings, or `null` when the Bundle declares neither file; a
 *   declared file the loader could not read is not checked (its finding is the loader's)
 */
function check(bundle, files) {
  if (!declares(bundle)) return null;
  const declared = declaredOf(bundle);
  const [vocabulary, shapes, questions] = ['vocabulary', 'shapes', 'questions'].map((key) => fileOf(declared, key));
  const unread = (input) => input !== undefined && input.text === null;
  if (unread(vocabulary)) return [];
  const siteChecks = require('../../../knowledge/site-checks.js');
  return siteChecks.check({
    base: (bundle.config.site || {}).base,
    graph: files.get('/graph.nq'),
    items: bundle.items,
    ontology: helpers.ontology().text,
    questions: unread(questions) ? undefined : questions,
    shapes: unread(shapes) ? undefined : shapes,
    vocabulary,
  }).findings;
}

module.exports = { check, declares, loaderFindings };
