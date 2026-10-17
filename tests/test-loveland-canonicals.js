// The 11 Loveland neighbourhood pages are this site's own pages again.
//
// 2026-10-13 (Signature cutover, before group 5). Since 2026-08-23 these pages
// named the identical Signature address as their canonical and were left out of
// this site's sitemap (build.py CROSS_BRAND_CANONICAL_TO_SIGNATURE). Cutover
// group 5 301s those Signature addresses to the pages here, so that canonical
// would have pointed at a URL that redirects straight back. The Signature repo's
// docs/CUTOVER-RUNBOOK.md lists it as a group-5 blocker. This pins, on the built
// site:
//   1. the set in build.py is still there (the Signature cutover check reads it by
//      name) and empty;
//   2. each of the 11 pages names itself as canonical and og:url, on this domain;
//   3. each is in sitemap.xml again;
//   4. no built page names a Signature /communities/ address as its canonical.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const DOMAIN = "https://www.thelittleladysellshomes.com";
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const PAGES = [
  "boyd-lake-north-loveland", "buckhorn-subdivisions-loveland", "downtown-loveland-real-estate",
  "kinston-centerra-loveland", "lakes-at-centerra-loveland", "mariana-butte-loveland",
  "namaqua-hills-loveland", "pyrenees-french-country-loveland", "thompson-valley-loveland",
  "waterfront-at-boyd-lake-loveland", "west-loveland-riverfront-homes",
].map((s) => `/communities/loveland/${s}.html`);

console.log("\n1. The set in build.py");
const buildPy = fs.readFileSync(path.join(ROOT, "build", "build.py"), "utf8");
// The same expression the Signature repo's build/cutover.py uses to read it.
const m = buildPy.match(/CROSS_BRAND_CANONICAL_TO_SIGNATURE\s*=\s*frozenset\(\[(.*?)\]\)/s);
check("CROSS_BRAND_CANONICAL_TO_SIGNATURE is still defined (Signature's cutover check reads it)", !!m);
check("and it names no page", !!m && !/"\//.test(m[1]), m && m[1].trim());

console.log("\n2. Each page names itself");
const sitemap = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
for (const p of PAGES) {
  const f = path.join(SITE, p);
  if (!fs.existsSync(f)) { check(`${p} is built`, false); continue; }
  const html = fs.readFileSync(f, "utf8");
  const canon = (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
  const ogUrl = (html.match(/<meta property="og:url" content="([^"]+)">/) || [])[1];
  check(`${p}: canonical and og:url are this page on this site`,
    canon === DOMAIN + p && ogUrl === DOMAIN + p, `${canon} / ${ogUrl}`);
  check(`${p}: in sitemap.xml`, sitemap.includes(`<loc>${DOMAIN}${p}</loc>`));
}

console.log("\n3. Nothing canonicalises to a Signature neighbourhood page");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const offenders = walk(SITE).filter((f) =>
  /<link rel="canonical" href="https?:\/\/(www\.)?signaturepropertycollection\.com\/communities\//.test(fs.readFileSync(f, "utf8")))
  .map((f) => "/" + path.relative(SITE, f));
check("no built page", offenders.length === 0, offenders.slice(0, 5).join(", "));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
process.exit(failures ? 1 : 0);
