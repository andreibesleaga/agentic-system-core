'use strict';
// The probe of the conditional need "browser" (tests/acceptance/pending/), and the
// browser half of the persona steps that need one. A scenario whose pending file has
// `class: "conditional"` and `needs: "browser"` runs where `probe()` answers
// `available: true` and is skipped, with the reason it gives, where it does not.
//
// The need, as the browser lanes of tests/distribution/search-page-browser.test.js
// and tests/e2e/modes/browser.test.js state it: AGSC_BROWSER=1, CHROME_EXE naming a
// Chromium or chrome-headless-shell binary, and `playwright-core` resolvable
// (NODE_PATH may point at an install outside the repository; nothing is installed
// here). Probed without the network.
//
// `open(world, route)` serves the scenario's built node read-only on loopback with
// the real `agsc-host serve` (which applies the node's own `_headers`, its
// Content-Security-Policy included), starts one headless browser per scenario and
// opens the route in a fresh page that records every console error, every uncaught
// exception and every request. The browser is closed when the scenario ends.
// Nothing leaves loopback: a request to any other origin is recorded and fails the
// step that checks it.
//
// Not a step definition file: its name starts with `_`.

const fs = require('node:fs');

/** @returns {{available: boolean, reason: string}} */
function probe() {
  if (process.env.AGSC_BROWSER !== '1') {
    return { available: false, reason: 'the browser lane runs only with AGSC_BROWSER=1' };
  }
  if (!process.env.CHROME_EXE || !fs.existsSync(process.env.CHROME_EXE)) {
    return { available: false, reason: 'CHROME_EXE names no browser binary' };
  }
  try {
    require.resolve('playwright-core');
  } catch (e) {
    return {
      available: false,
      reason: 'playwright-core is not installed (npm i --no-save playwright-core outside the repository, then NODE_PATH)',
    };
  }
  return { available: true, reason: '' };
}

/** The scenario's browser, started once and closed with the scenario's other clients. */
async function browserOf(world) {
  if (!world.state.browser) {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
    world.state.browser = browser;
    // The World closes every entry of `clients` when the scenario ends.
    world.clients.push({ close: () => browser.close() });
  }
  return world.state.browser;
}

/** The scenario's built node, served once on loopback; resolves with its origin. */
async function originOf(world) {
  if (!world.state.served) world.state.served = await world.serve('www');
  return world.state.served.origin;
}

/**
 * Open a route of the served node in a fresh page.
 * @param {object} world
 * @param {string} route a path beginning with `/`
 * @param {{acceptDownloads?: boolean, init?: Function}} [options] `init` runs in the
 *   page before any of its scripts (Playwright's `addInitScript`)
 * @returns {Promise<{page: object, context: object, origin: string, errors: string[],
 *   offOrigin: string[], requests: string[]}>}
 */
async function open(world, route, options = {}) {
  const browser = await browserOf(world);
  const origin = await originOf(world);
  const context = await browser.newContext({ acceptDownloads: Boolean(options.acceptDownloads) });
  const page = await context.newPage();
  const errors = [];
  const offOrigin = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    requests.push(r.url());
    if (!r.url().startsWith(`${origin}/`)) offOrigin.push(r.url());
  });
  if (options.init) await page.addInitScript(options.init);
  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
  return { context, errors, offOrigin, origin, page, requests };
}

module.exports = { open, probe };
