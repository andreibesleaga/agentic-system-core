'use strict';
// The `build` case of the page-level link relations of llms.txt v2 (AGSC-06-46):
//
//   build-0033  every generated HTML page carries in its `<head>` a `describedby` link to
//               `/llms.txt` of type `text/plain`, and every item page also an `alternate`
//               link of type `text/markdown` to its `/pages/<slug>.md`; a page that is not an
//               item page carries no such `alternate`; the discovery document is still
//               reached by its own `describedby` link, selected by its type (AGSC-06-25).
//
// One build of the named fixture with the real command line (`onBuild`); each page's
// `<head>` is read as markup: every `<link>` element, its attributes as a map. A stated
// link is present when one `<link>` carries exactly its attributes (others may follow).

const { checks } = require('./_assert.js');
const { fileOf, onBuild } = require('./_build-surfaces.js');

/** The attributes of every `<link>` of the page's `<head>`, each as `{name: value}`. */
function headLinks(page) {
  const head = /<head>([\s\S]*?)<\/head>/u.exec(page);
  if (head === null) return [];
  return [...head[1].matchAll(/<link\b([^>]*)>/gu)].map((m) => Object.fromEntries(
    [...m[1].matchAll(/([a-z-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]])));
}

/** Whether one link of `links` carries every attribute of `want`, with the same value. */
const carries = (links, want) => links.some((link) => Object.entries(want).every(([name, value]) => link[name] === value));

/** build-0033 (AGSC-06-46): the stated links on each stated page, and the excluded ones absent. */
function pageLinksCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => {
    const list = [['the build passes', run.exit === 0, `exit ${run.exit}`]];
    for (const [route, want] of Object.entries(vector.expected.pages)) {
      const bytes = run.files.get(fileOf(route));
      const links = bytes === undefined ? [] : headLinks(bytes.toString('utf8'));
      list.push([`${route} emitted`, bytes !== undefined, route]);
      for (const link of want.head_links_include || []) {
        list.push([`${route} carries ${JSON.stringify(link)}`, carries(links, link), JSON.stringify(links)]);
      }
      for (const link of want.head_links_exclude || []) {
        list.push([`${route} carries no ${JSON.stringify(link)}`, !carries(links, link), JSON.stringify(links)]);
      }
    }
    list.push(['deployment profile', vector.input.deployment_profile === 'cloudflare-pages',
      'this writer emits the Cloudflare Pages profile (AGSC-06-17)']);
    list.push(['no git history', vector.input.git_history === false, 'the case runs with the file-system port alone']);
    return checks(list);
  });
}

const HANDLERS = Object.freeze({ 'build-0033': pageLinksCase });

module.exports = { HANDLERS, headLinks };
