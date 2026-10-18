// RealScout "Search <Town> Homes With Christine" button on the Northern Colorado
// town pages.
//
// 2026-10-18 (Christine). The mountain pages already carry her RealScout search
// ("Search Mountain Listings With Christine", build/collection_pages.py). build.py's
// _town_search_html() puts the same button on every town page build_city_pages()
// makes in Larimer, Weld and Boulder County -- the three counties this site calls
// Northern Colorado -- in its own section straight after the page's "Search Homes
// In <Town>" section, behind the build setting TOWN_SEARCH_LINK (exactly "on",
// trimmed, any case). Pinned here:
//
//   1. the switch: anything but "on" gives nothing, so every page is byte for
//      byte what it was;
//   2. the address: REALSCOUT_SEARCH_URL (else the default, the mountain pages'
//      address) is linked only when it is https on realscout.com or a subdomain;
//      anything else leaves the button out;
//   3. the pages: switched on, exactly one button on each Northern Colorado town
//      page and none anywhere else, new tab with rel="noopener", outside every
//      form, after the town's search section, the rest of the page untouched;
//      its click is the privacy-safe roi_cta_click (CTA id + page path), never a
//      lead/conversion event;
//   4. the built site/ (in tests/run-all.sh, the postprocessed output Netlify
//      publishes) agrees with the switch the build ran with;
//   5. switching it on does not make any town page look edited (freshness).
//
// The generator is imported (build.py has a __main__ guard, so nothing is
// written) with page() captured, the same way test-hva-signup.js does it.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const DEFAULT_URL = "https://christinegwinnup.realscout.com/agent/search";
const CTA = "town-realscout-search";
const NOCO = ["larimer", "weld", "boulder"];
// Towns Christine named, plus the rest of the three counties' town pages; each
// must carry the button when it is on. A town page that disappears fails here.
const MUST_HAVE = [
  "larimer/loveland", "larimer/fort-collins", "larimer/windsor", "larimer/berthoud",
  "larimer/timnath", "larimer/wellington", "larimer/estes-park", "weld/greeley",
  "weld/windsor", "weld/johnstown", "weld/eaton", "weld/severance", "weld/milliken",
  "weld/ault", "boulder/boulder", "boulder/longmont",
].map((s) => `/communities/${s}.html`);

// One fresh import per environment, so the test holds whether build.py reads the
// settings at import time or at call time. full=false returns, per page, only the
// number of RealScout links (enough for the address checks, and much smaller).
function gen(env, full = true) {
  const e = { ...process.env };
  delete e.TOWN_SEARCH_LINK;
  delete e.REALSCOUT_SEARCH_URL;
  Object.assign(e, env);
  const code = [
    "import importlib.util, json, re, sys",
    "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
    "pages = {}",
    "m.page = lambda title, description, path, active, body, *a, **k: pages.__setitem__(path, body)",
    "m.build_city_pages()",
    "fn = getattr(m, '_town_search_html', None)",
    "towns = [[c['slug'], city, url] for c, city, url in m._all_town_pages()]",
    "blocks = {url: fn(city, c['slug']) for c, city, url in m._all_town_pages()} if fn else {}",
    "out = {'block': fn('Loveland', 'larimer') if fn else None,",
    "       'denver': fn('Denver', 'denver') if fn else None,",
    "       'morgan': fn('Fort Morgan', 'morgan') if fn else None,",
    "       'towns': towns, 'blocks': blocks}",
    `if ${full ? "True" : "False"}: out['pages'] = pages`,
    "else: out['counts'] = {p: len(re.findall(r'href=\"https?://[^\"]*realscout\\.com', b)) for p, b in pages.items()}",
    "print(json.dumps(out))",
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-W", "ignore", "-c", code], { cwd: ROOT, env: e, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-600) };
  try { return JSON.parse(r.stdout.split("\n").filter(Boolean).pop()); } catch (err) { return { error: `unparseable: ${r.stdout.slice(-200)}` }; }
}

// Every <a ...> pointing at realscout.com, with its attributes and link text.
function realscoutLinks(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)) {
    const href = (m[1].match(/\bhref="([^"]*)"/i) || [])[1] || "";
    if (/^https?:\/\/([a-z0-9-]+\.)*realscout\.com(\/|$|\?)/i.test(href)) {
      out.push({ at: m.index, href, text: m[2],
        target: (m[1].match(/\btarget="([^"]*)"/i) || [])[1] || "",
        rel: (m[1].match(/\brel="([^"]*)"/i) || [])[1] || "",
        cta: (m[1].match(/\bdata-roi-cta="([^"]*)"/i) || [])[1] || "" });
    }
  }
  return out;
}
// [open, close] of every <form>...</form> on the page.
function formSpans(html) {
  const spans = [];
  for (const m of html.matchAll(/<form\b/gi)) {
    const close = html.indexOf("</form>", m.index);
    spans.push([m.index, close < 0 ? html.length : close]);
  }
  return spans;
}
const insideForm = (html, at) => formSpans(html).some(([a, b]) => at > a && at < b);
const countOf = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const isNoco = (p) => NOCO.some((c) => p.startsWith(`/communities/${c}/`));

console.log("1. The switch: exactly \"on\" (trimmed, any case), anything else gives nothing");
const off = gen({});
check("build.py imports and builds the town pages", !off.error && off.pages && Object.keys(off.pages).length > 0, off.error);
check("_town_search_html() exists", off.block !== null && off.block !== undefined, "missing from build/build.py");
check("unset: no button", off.block === "", JSON.stringify(off.block).slice(0, 120));
for (const v of ["", " ", "off", "OFF", "true", "1", "yes", "enabled", "onn", "o n", "on1", "\"on\""]) {
  const r = gen({ TOWN_SEARCH_LINK: v }, false);
  check(`TOWN_SEARCH_LINK=${JSON.stringify(v)}: no button, no RealScout link on any town page`,
    r.block === "" && r.counts && Object.values(r.counts).every((n) => n === 0), r.error || JSON.stringify(r.block).slice(0, 80));
}
for (const v of ["on", "ON", "On", " on ", "\ton\n"]) {
  const r = gen({ TOWN_SEARCH_LINK: v }, false);
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`TOWN_SEARCH_LINK=${JSON.stringify(v)}: one button, to the default search address`,
    links.length === 1 && links[0].href === DEFAULT_URL, r.error || JSON.stringify(links));
}

console.log("\n2. The address: https on realscout.com (or a subdomain) only");
const collection = fs.readFileSync(path.join(ROOT, "build", "collection_pages.py"), "utf8");
check("the default is the mountain pages' RealScout search address (collection_pages.py)",
  (collection.match(/^REALSCOUT_SEARCH_URL = "([^"]+)"/m) || [])[1] === DEFAULT_URL);
const refused = [
  "http://christinegwinnup.realscout.com/agent/search",
  "https://example.com/agent/search",
  "https://realscout.com.example.com/x",
  "https://evilrealscout.com/x",
  "https://realscout.co/x",
  "https://realscout.com@example.com/x",
  "https://user@christinegwinnup.realscout.com/x",
  "https://christinegwinnup.realscout.com:8443/x",
  "https://christinegwinnup.realscout.com:443/x",
  "https://christinegwinnup.realscout.com/x\" onclick=\"alert(1)",
  "https://christinegwinnup.realscout.com/x'><script>",
  "https://christinegwinnup.realscout.com/a b",
  "https://christinegwinnup.realscout.com\\@example.com/",
  "https://christinegwinnup.realscout.com/é",
  "//christinegwinnup.realscout.com/x",
  "christinegwinnup.realscout.com/x",
  "javascript:alert(1)//realscout.com",
  "ftp://christinegwinnup.realscout.com/x",
];
for (const u of refused) {
  const r = gen({ TOWN_SEARCH_LINK: "on", REALSCOUT_SEARCH_URL: u }, false);
  check(`refused, button left out of every town page: ${JSON.stringify(u)}`,
    r.block === "" && r.counts && Object.values(r.counts).every((n) => n === 0), r.error || JSON.stringify(r.block).slice(0, 80));
}
const accepted = [
  ["https://realscout.com/x", "https://realscout.com/x"],
  ["https://CHRISTINEGWINNUP.RealScout.com/agent/search", "https://CHRISTINEGWINNUP.RealScout.com/agent/search"],
  ["  https://christinegwinnup.realscout.com/agent/search?a=1&b=2  ", "https://christinegwinnup.realscout.com/agent/search?a=1&amp;b=2"],
];
for (const [u, want] of accepted) {
  const r = gen({ TOWN_SEARCH_LINK: "on", REALSCOUT_SEARCH_URL: u }, false);
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`accepted: ${JSON.stringify(u)}`, links.length === 1 && links[0].href === want, r.error || JSON.stringify(links));
}
for (const blank of ["", "   "]) {
  const r = gen({ TOWN_SEARCH_LINK: "on", REALSCOUT_SEARCH_URL: blank }, false);
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`REALSCOUT_SEARCH_URL=${JSON.stringify(blank)} falls back to the default`, links.length === 1 && links[0].href === DEFAULT_URL);
}
const custom = gen({ REALSCOUT_SEARCH_URL: "https://realscout.com/x" }, false);
check("an address alone does not switch it on", custom.block === "" && Object.values(custom.counts || { x: 1 }).every((n) => n === 0));
check("the Home Value Alert address does not move this button",
  (() => { const r = gen({ TOWN_SEARCH_LINK: "on", REALSCOUT_HVA_SIGNUP_URL: "https://realscout.com/hva" }, false);
    const l = r.block ? realscoutLinks(r.block) : []; return l.length === 1 && l[0].href === DEFAULT_URL; })());

console.log("\n3. The pages: one button per Northern Colorado town page, nowhere else");
const on = gen({ TOWN_SEARCH_LINK: "on" });
check("both builds produced the town pages", !!off.pages && !!on.pages && !on.error, on.error);
const offPages = off.pages || {}, onPages = on.pages || {};
const towns = off.towns || [];
const nocoTowns = towns.filter(([county]) => NOCO.includes(county));
const otherTowns = towns.filter(([county]) => !NOCO.includes(county));
check(`${towns.length} town pages built, ${nocoTowns.length} of them in Larimer, Weld and Boulder`,
  towns.length === Object.keys(offPages).length && nocoTowns.length >= 30, `${towns.length} towns, ${Object.keys(offPages).length} pages`);
check("every town Christine named (and Boulder County's main towns) is covered",
  MUST_HAVE.every((p) => nocoTowns.some(([, , u]) => u === p)), MUST_HAVE.filter((p) => !nocoTowns.some(([, , u]) => u === p)).join(", "));
check("Denver-metro, Broomfield and Morgan County town pages are not covered",
  otherTowns.length > 0 && otherTowns.every(([county]) => ["denver", "broomfield", "morgan", "jefferson", "arapahoe", "adams"].includes(county)),
  JSON.stringify(otherTowns.map((t) => t[2])));
check("off: no RealScout link on any town page",
  Object.values(offPages).every((b) => realscoutLinks(b).length === 0 && !b.includes(CTA)));
check("the button is never made for a town outside the three counties", on.denver === "" && on.morgan === "");
check("on: a button for every town in the three counties and for no other town; off: none at all",
  towns.every(([county, , u]) => !!(on.blocks || {})[u] === NOCO.includes(county) && (off.blocks || {})[u] === ""));

const bad = [];
for (const [county, city, url] of nocoTowns) {
  const offBody = offPages[url] || "", onBody = onPages[url] || "";
  // The page with the button is the page without it plus exactly one section.
  const block = (on.blocks || {})[url] || "";
  const links = realscoutLinks(onBody);
  const L = links[0] || {};
  const problems = [];
  if (!offBody || !onBody) problems.push("page missing");
  if (links.length !== 1) problems.push(`${links.length} RealScout links`);
  if (L.href !== DEFAULT_URL) problems.push(`href ${L.href}`);
  if (L.target !== "_blank") problems.push(`target ${L.target}`);
  if (!/(^|\s)noopener(\s|$)/.test(L.rel || "")) problems.push(`rel ${L.rel}`);
  if (L.cta !== CTA) problems.push(`data-roi-cta ${L.cta}`);
  if (L.text !== `Search ${city} Homes With Christine &rsaquo;`) problems.push(`label ${JSON.stringify(L.text)}`);
  if (insideForm(onBody, L.at)) problems.push("inside a form");
  const search = onBody.indexOf(`<h2 class="section-title">Search Homes In ${city}</h2>`);
  if (search < 0 || !(L.at > search)) problems.push("not after the town's search section");
  if (!block || countOf(onBody, block) !== 1 || onBody.split(block).join("") !== offBody) problems.push("page is not the off page plus one section");
  if (/<(form|input|h[1-6]|script)\b|generate_lead|fbq|gtag|onclick/i.test(block)) problems.push("section holds a form, heading or script");
  if (problems.length) bad.push(`${url} (${county}, ${city}): ${problems.join("; ")}`);
}
check(`on: each of the ${nocoTowns.length} Northern Colorado town pages has exactly one button — right address, ` +
  "new tab, noopener, its CTA id, \"Search <Town> Homes With Christine\", outside every form, after the town's search, " +
  "and nothing else on the page changed", nocoTowns.length > 0 && bad.length === 0, bad.slice(0, 4).join(" | "));
check("on: every other town page is identical to the off build",
  otherTowns.every(([, , u]) => onPages[u] === offPages[u] && realscoutLinks(onPages[u] || "").length === 0),
  otherTowns.filter(([, , u]) => onPages[u] !== offPages[u]).map((t) => t[2]).join(", "));
// The click is counted by the ROI client's existing [data-roi-cta] listener,
// which sends only the CTA id and the page path. No lead/conversion event.
const roi = fs.readFileSync(path.join(ROOT, "build", "postprocess_roi_conversion.py"), "utf8");
check("the ROI client's [data-roi-cta] listener sends only cta_id + page_path",
  /closest\('\[data-roi-cta\]'\)[\s\S]{0,200}gtag\('event', 'roi_cta_click', \{cta_id: el\.getAttribute\('data-roi-cta'\) \|\| 'unknown', page_path: location\.pathname \|\| '\/'\}\)/.test(roi));
check("the button section fires no lead or conversion event and has no form or heading",
  !!on.block && !/generate_lead|fbq|gtag|onclick|<script|<form|<input|<h[1-6]/i.test(on.block));

console.log("\n4. The built site/ agrees with the switch the build ran with");
const SITE = path.join(ROOT, "site");
if (!fs.existsSync(path.join(SITE, "communities"))) {
  check("site/communities exists (run tests/run-all.sh)", false);
} else {
  const switchedOn = (process.env.TOWN_SEARCH_LINK || "").trim().toLowerCase() === "on";
  const withCta = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html") && fs.readFileSync(p, "utf8").includes(`data-roi-cta="${CTA}"`)) withCta.push("/" + path.relative(SITE, p).split(path.sep).join("/"));
    }
  })(SITE);
  const builtNoco = nocoTowns.map((t) => t[2]);
  if (!switchedOn) {
    check("switch off: no built page carries the town search button", withCta.length === 0, withCta.slice(0, 5).join(", "));
    const communityLinks = [];
    for (const [, , u] of towns) {
      const f = path.join(SITE, u);
      if (fs.existsSync(f) && realscoutLinks(fs.readFileSync(f, "utf8")).length) communityLinks.push(u);
    }
    check("switch off: no built town page links to RealScout", communityLinks.length === 0, communityLinks.join(", "));
  } else {
    check("switch on: exactly the Northern Colorado town pages carry it",
      JSON.stringify([...withCta].sort()) === JSON.stringify([...builtNoco].sort()),
      `${withCta.length} pages vs ${builtNoco.length} expected`);
    const wrong = builtNoco.filter((u) => {
      const f = path.join(SITE, u);
      if (!fs.existsSync(f)) return true;
      const h = fs.readFileSync(f, "utf8");
      const l = realscoutLinks(h).filter((x) => x.cta === CTA);
      return !(l.length === 1 && l[0].href.startsWith("https://") && l[0].target === "_blank" &&
        /(^|\s)noopener(\s|$)/.test(l[0].rel) && !insideForm(h, l[0].at));
    });
    check("switch on: one https button per built town page, new tab, noopener, outside every form", wrong.length === 0, wrong.join(", "));
  }
}

// A page's date is decided by comparing it with its committed copy, and the
// committed site/ is built with the switch off. Switched on in Netlify, the
// button must not date the town pages "today" on every deploy (CLAUDE.md,
// Freshness).
console.log("\n5. Switching it on doesn't make a town page look edited");
const normalizeAll = (texts) => {
  const r = spawnSync("python3", ["-I", "-W", "ignore", "-c", [
    "import json, sys",
    "sys.path.insert(0, 'build')",
    "import postprocess_audit_fixes as p",
    "sys.stdout.write(json.dumps([p._normalize_for_change_detection(t) for t in json.loads(sys.stdin.read())]))",
  ].join("\n")], { cwd: ROOT, input: JSON.stringify(texts), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return texts.map(() => `ERROR ${r.stderr}`);
  return JSON.parse(r.stdout);
};
{
  const urls = nocoTowns.map((t) => t[2]).filter((u) => offPages[u] && onPages[u]);
  const norm = normalizeAll(urls.flatMap((u) => [offPages[u], onPages[u]]));
  const differ = urls.filter((u, i) => norm[2 * i] !== norm[2 * i + 1]);
  check(`all ${urls.length} generated town pages compare equal with and without the button`, urls.length > 0 && differ.length === 0, differ.slice(0, 5).join(", "));
}
const builtFile = path.join(SITE, "communities", "larimer", "loveland.html");
if (fs.existsSync(builtFile) && on.block) {
  const built = fs.readFileSync(builtFile, "utf8");
  const offPage = built.split(on.block).join("");
  // Put the button where the generator does: after the search section (and its
  // script), before the next section.
  const s = offPage.indexOf("Search Homes In Loveland</h2>");
  const end = s < 0 ? -1 : offPage.indexOf("</section>", s);
  const at = end < 0 ? -1 : offPage.indexOf("\n<section", end);
  const onPage = at < 0 ? "" : offPage.slice(0, at) + on.block + offPage.slice(at);
  const edited = onPage.replace(/<h1([^>]*)>/, "<h1$1>Edited ");
  const otherCta = onPage.replace(`data-roi-cta="${CTA}"`, 'data-roi-cta="something-else"');
  const [nOff, nOn, nEdited, nOther] = normalizeAll([offPage, onPage, edited, otherCta]);
  check("the built Loveland page without the button has no RealScout link", realscoutLinks(offPage).length === 0);
  check("the same built page with the button compares equal", !!onPage && realscoutLinks(onPage).length === 1 && nOn === nOff);
  check("the town's search section is still there after the comparison's clean-up", nOn.includes("Search Homes In Loveland"));
  check("a real edit to the page still counts", edited !== onPage && nEdited !== nOff);
  check("the clean-up is this section only: the same section with another CTA id still counts", nOther !== nOff);
} else {
  check("site/communities/larimer/loveland.html and the generated button are available", false);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
