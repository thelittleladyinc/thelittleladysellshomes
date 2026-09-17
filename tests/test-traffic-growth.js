'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
let fails = 0;
function check(ok, msg) { if (!ok) { console.log('FAIL:', msg); fails++; } }
function read(rel) { return fs.readFileSync(path.join(site, rel), 'utf8'); }
function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}
const dup = {
  '/guides/multi-generational-homes-northern-colorado.html': '/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html',
  '/guides/cost-to-develop-raw-land-colorado.html': '/whats-the-real-cost-to-develop-raw-land-in-colorado.html',
  '/guides/best-places-to-retire-in-northern-colorado.html': '/the-best-places-to-retire-in-northern-colorado.html',
};
const redirects = read('_redirects');
const sitemap = read('sitemap.xml');
for (const [src, dst] of Object.entries(dup)) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  check(new RegExp('^\\s*' + esc(src) + '\\s+' + esc(dst) + '\\s+301!?\\s*$', 'm').test(redirects), `missing duplicate redirect ${src}`);
  check(!sitemap.includes(`<loc>https://www.thelittleladysellshomes.com${src}</loc>`), `duplicate still in sitemap ${src}`);
}
for (const p of walk(site)) {
  const h = fs.readFileSync(p, 'utf8');
  const rel = path.relative(site, p).replace(/\\/g, '/');
  for (const src of Object.keys(dup)) {
    check(!h.includes(`href="${src}"`) && !h.includes(`href='${src}'`), `${rel} links to duplicate ${src}`);
  }
  if (rel.startsWith('communities/')) {
    check(!/Who is (?:the )?(?:best|top)[^<"]*real estate agent/i.test(h), `${rel} has self-nominating FAQ`);
    const staleCard = /Right now there are [\d,]+ active listings[\s\S]{0,300}?IRES MLS feed as of (\d{4}-\d{2}-\d{2})/i.exec(h);
    if (staleCard) {
      const age = (Date.now() - Date.parse(staleCard[1] + 'T00:00:00Z')) / 86400000;
      check(age <= 3, `${rel} has stale static "Right now" market claim`);
    }
    const staleFaq = /As of (\d{4}-\d{2}-\d{2})[\s\S]{0,350}?That is live IRES MLS inventory/i.exec(h);
    if (staleFaq) {
      const age = (Date.now() - Date.parse(staleFaq[1] + 'T00:00:00Z')) / 86400000;
      check(age <= 3, `${rel} has stale FAQ live-inventory claim`);
    }
  }
}
const videos = read('sitemap-videos.xml');
check(!/<video:content_loc>https?:\/\/(?:www\.)?youtube\.com\/watch\?v=/i.test(videos), 'YouTube watch URL used as video:content_loc');
const winners = {
  'multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html': 'https://www.thelittleladysellshomes.com/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html',
  'whats-the-real-cost-to-develop-raw-land-in-colorado.html': 'https://www.thelittleladysellshomes.com/whats-the-real-cost-to-develop-raw-land-in-colorado.html',
  'the-best-places-to-retire-in-northern-colorado.html': 'https://www.thelittleladysellshomes.com/the-best-places-to-retire-in-northern-colorado.html',
};
for (const [rel, canon] of Object.entries(winners)) {
  check(read(rel).includes(`<link rel="canonical" href="${canon}">`), `winner canonical changed: ${rel}`);
}
const fc = read('rent-to-own-homes-in-fort-collins-is-it-right-for-you-in-2025.html');
check(!fc.includes('2025 Buyer’s Guide'), 'Fort Collins RTO title still dated 2025');
check(!fc.includes('It&rsquo;s an excellent choice'), 'Fort Collins RTO still calls option excellent');
check(!fc.includes('smart, strategic way to get into the Fort Collins market'), 'Fort Collins RTO still has promotional promise');
check(fc.includes('href="/rent-to-own.html#roi-rto-funnel"'), 'Fort Collins RTO missing options funnel bridge');
const ilc = read('what-is-an-ilc-and-when-should-you-get-a-full-survey.html');
check(!ilc.includes('Typically $350&ndash;$600'), 'ILC stale dollar range remains');
check(!ilc.includes('$1,000&ndash;$2,500+'), 'boundary survey stale dollar range remains');

// --- blog articles keep their own modification dates -------------------------
// 2026-09-17. This layer used to stamp every page it touched with a fixed
// "change date" of 2026-08-31. Touching a page included rewriting an internal
// href at it, which happens to every blog post, so 61 archived articles -- the
// oldest published 2024-10-25 -- all told Google they were last edited on the
// same August day. A build step that rewrites a link is not an edit to the
// article, and a sitemap full of identical lastmod values is exactly the fake
// freshness the freshness rules in CLAUDE.md exist to prevent.
//
// Asserted as an outcome rather than against the constant: the archive must
// look like an archive, and no article may claim a modification date its own
// BlogPosting schema does not support.
const blogDir = path.join(site, 'blog');
const posts = fs.readdirSync(blogDir)
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => path.join(blogDir, f));
const metaDates = [];
for (const p of posts) {
  const h = fs.readFileSync(p, 'utf8');
  const rel = 'blog/' + path.basename(p);
  const meta = /<meta name="last-modified" content="(\d{4}-\d{2}-\d{2})">/.exec(h);
  check(!!meta, `${rel} has no last-modified date`);
  if (!meta) continue;
  metaDates.push(meta[1]);

  // The article's own schema is the source of truth for when it was written.
  let published = null, modified = null;
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let obj; try { obj = JSON.parse(m[1]); } catch { continue; }
    const stack = [obj];
    while (stack.length) {
      const x = stack.pop();
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if (!x || typeof x !== 'object') continue;
      if (['BlogPosting', 'Article', 'NewsArticle'].includes(x['@type'])) {
        published = published || String(x.datePublished || '').slice(0, 10) || null;
        modified = modified || String(x.dateModified || '').slice(0, 10) || null;
      }
      stack.push(...Object.values(x));
    }
  }
  if (!published) continue;
  check(meta[1] === modified,
    `${rel}: meta last-modified ${meta[1]} disagrees with schema dateModified ${modified}`);
  check(modified >= published,
    `${rel}: claims modified ${modified} before it was published ${published}`);
}
// A real archive has many dates. One shared date means a build step stamped them.
const distinct = new Set(metaDates);
check(distinct.size > posts.length / 2,
  `blog archive collapsed to ${distinct.size} modification date(s) across ${posts.length} posts`);
check(!(distinct.size === 1),
  `every blog post shares the modification date ${[...distinct][0]}`);

if (fails) process.exit(1);
console.log('All checks passed');
