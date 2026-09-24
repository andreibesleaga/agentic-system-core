'use strict';
// CONTEXT Interchange — the licences an import recognises (AGSC-01-22): a foreign
// record whose licence cannot be established as permitting publication is written
// with `status: draft`. Shared by the skills adapter and the OKF reader, so the two
// imports recognise the same set. PURE: no fs, no clock, no network.

const { oneLine } = require('./records.js');

/** The Content Use Terms identifier this format's own nodes publish under (AGSC-06-18). */
const CONTENT_USE_TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';

/** A licence file, by name. */
const LICENSE_NAME = /^(?:LICEN[CS]E|COPYING)(?:[.-][A-Za-z0-9]+)?$/u;

/**
 * The licences an import recognises as open (SPDX identifiers; a `-only` or
 * `-or-later` suffix is accepted). A recognised licence is carried, never judged
 * against the node's own licence — the import says so once.
 */
const OPEN_LICENSES = Object.freeze(['0BSD', 'AGPL-3.0', 'Apache-2.0', 'Artistic-2.0', 'BSD-2-Clause',
  'BSD-3-Clause', 'BSL-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'EPL-2.0', 'GPL-2.0', 'GPL-3.0',
  'ISC', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'MIT-0', 'MPL-2.0', 'Unlicense', 'Zlib']);

/** Common spellings that are not SPDX identifiers but name one unambiguously. */
const LICENSE_ALIASES = Object.freeze({
  'apache 2.0': 'Apache-2.0', 'apache license 2.0': 'Apache-2.0', 'apache license, version 2.0': 'Apache-2.0',
  'apache2': 'Apache-2.0', 'cc0': 'CC0-1.0', 'mit license': 'MIT', 'the unlicense': 'Unlicense',
});

/** The first lines of the recognised licence texts, for a licence FILE. */
const LICENSE_TEXTS = Object.freeze([
  [/Apache License[\s\S]{0,80}Version 2\.0/u, 'Apache-2.0'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE/u, 'AGPL-3.0'],
  [/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/u, 'LGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/u, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 2/u, 'GPL-2.0'],
  [/Mozilla Public License,? [Vv]ersion 2\.0/u, 'MPL-2.0'],
  [/CC0 1\.0 Universal/u, 'CC0-1.0'],
  [/Attribution-ShareAlike 4\.0 International/u, 'CC-BY-SA-4.0'],
  [/Attribution 4\.0 International/u, 'CC-BY-4.0'],
  [/This is free and unencumbered software released into the public domain/u, 'Unlicense'],
  [/\bISC License\b/u, 'ISC'],
  [/\bMIT License\b|Permission is hereby granted, free of charge/u, 'MIT'],
  [/Redistribution and use in source and binary forms[\s\S]*Neither the name/u, 'BSD-3-Clause'],
  [/Redistribution and use in source and binary forms/u, 'BSD-2-Clause'],
]);

/** Words that state a licence is not open, whatever else its sentence names. */
const RESTRICTIVE = /\b(?:all rights reserved|proprietary|source-available|confidential)\b/iu;

/** An SPDX identifier (or a known alias) → the recognised id, or `null`. */
function licenceId(value) {
  const text = oneLine(value);
  if (text === null) return null;
  const alias = LICENSE_ALIASES[text.toLowerCase()];
  if (alias !== undefined) return alias;
  const bare = text.replace(/-(?:only|or-later)$/u, '').replace(/\+$/u, '');
  return OPEN_LICENSES.find((id) => id.toLowerCase() === bare.toLowerCase()) || null;
}

/** A licence file's text → the recognised id, or `null`. Only its opening is read. */
function licenceFromText(text) {
  const head = String(text).slice(0, 4000);
  for (const [pattern, id] of LICENSE_TEXTS) if (pattern.test(head)) return id;
  return null;
}

/**
 * AGSC-01-22: does a DECLARED licence permit publication? An open licence this module
 * recognises, or this format's own Content Use Terms — the terms a node of this format
 * publishes its prose under, whose text travels beside every export — and never a
 * value that says the terms are restrictive.
 * @returns {boolean}
 */
function established(value) {
  const text = oneLine(typeof value === 'string' ? value : String(value == null ? '' : value));
  if (text === null || RESTRICTIVE.test(text)) return false;
  return text === CONTENT_USE_TERMS || licenceId(text) !== null;
}

/** AGSC-01-22: does a licence FILE's text permit publication (a recognised open text, or the Content Use Terms)? */
function establishedText(text) {
  const head = String(text).slice(0, 4000);
  if (RESTRICTIVE.test(head.split('\n')[0])) return false;
  return head.includes(`SPDX-License-Identifier: ${CONTENT_USE_TERMS}`) || licenceFromText(head) !== null;
}

module.exports = {
  CONTENT_USE_TERMS, LICENSE_NAME, OPEN_LICENSES, RESTRICTIVE,
  established, establishedText, licenceFromText, licenceId,
};
