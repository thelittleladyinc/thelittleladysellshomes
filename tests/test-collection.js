// The Little Lady's Signature Property Collection -- the luxury tier's pages.
//
// 2026-09-30 (Signature move, part 2, docs/SIGNATURE-MOVE.md). Pins what the
// Collection has to be while it is built but not yet announced:
//   1. every page answers under /signature-property-collection/, and its canonical
//      is the Signature URL it stands in for -- so none is in the sitemap and none
//      competes with the live Signature page until its redirect goes live (phase e);
//   2. nothing outside the Collection links to it yet;
//   3. its look (body.tier-signature) and fonts load on its pages only, and the
//      Libre Baskerville bold is a real bold, not a copy of the regular;
//   4. the copy rules: no "dream home", no self-nominating "best", no claim that
//      listings are live from IRES or on the page right now, Christine only;
//   5. its forms: new names, labelled and tagged for Lofty, with the thank-you
//      contract, plus hidden definitions for every form name the Signature site used;
//   6. its search (tier floor and campaign), schema (one Christine, a Brand node),
//      analytics (content_group, collection_click, view_item) and listing shell;
//   7. the book landing page keeps every tracking parameter a printed piece carries;
//   8. the tier's colours pass WCAG AA where they are used (build/assets/css/collection.css).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const DIR = "/signature-property-collection";
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

// build.py's own constants, and the two listing shells as a production build
// writes them (GA on), generated into a scratch folder.
const GA = "G-TEST1234567";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tll-collection-"));
const constants = JSON.parse(execFileSync("python3", ["-c", [
  "import importlib.util, json, os, sys",
  "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  `m.HERE = os.path.join(${JSON.stringify(tmp)}, 'build')`,
  "m.write_listing_page_shell()",
  "print('@@JSON@@' + json.dumps({'sig': m._SIGNATURE_URL, 'map': m.COLLECTION_CANONICAL_TO_SIGNATURE,",
  "  'blog': sorted(m.COLLECTION_BLOG_SLUGS), 'domain': m.SITE['domain'], 'phone': m.SITE['phone'],",
  "  'agent_id': m.AGENT_ID, 'collection_id': m.COLLECTION_ID,",
  "  'fonts': [f[3] for f in m.COLLECTION_FONTS], 'preload': list(m.COLLECTION_PRELOAD_FONTS),",
  "  'tag_on': m._analytics_tag('signature-collection'), 'tag_off': m._analytics_tag()}))",
].join("\n")], { cwd: ROOT, env: { ...process.env, GA_MEASUREMENT_ID: GA }, stdio: ["ignore", "pipe", "pipe"] })
  .toString().split("@@JSON@@").pop());

const MAP = constants.map;
const pages = Object.keys(MAP);
const collectionFiles = pages.map((p) => path.join(SITE, p));
const isCollection = (file) => collectionFiles.includes(file);

console.log("\n1. Every Collection page is built, and canonical to its Signature URL for now");
check(`${pages.length} pages in the canonical map (20 pages and 3 posts)`, pages.length >= 23, String(pages.length));
for (const p of pages) {
  const f = path.join(SITE, p);
  if (!fs.existsSync(f)) { check(`${p} is built`, false); continue; }
  const html = fs.readFileSync(f, "utf8");
  const m = html.match(/<link rel="canonical" href="([^"]+)">/);
  check(`${p} → ${MAP[p]}`, m && m[1] === constants.sig + MAP[p], m && m[1]);
}
check("every page under the Collection folder is mapped (or is the noindex form page)",
  fs.readdirSync(path.join(SITE, DIR.slice(1))).filter((n) => n.endsWith(".html"))
    .every((n) => MAP[`${DIR}/${n}`] || n === "form-definitions.html"));
check("the luxury-agent guide is retitled and no longer claims \"best\"",
  /<title>How To Choose A Luxury Real Estate Agent In Northern Colorado<\/title>/.test(read(`site${DIR}/how-to-choose-a-luxury-real-estate-agent.html`)));

const sitemaps = ["site/sitemap.xml", "site/sitemap-videos.xml"].filter(exists).map(read).join("\n");
const inSitemap = pages.filter((p) => sitemaps.includes(constants.domain + p));
check("none of them is in a sitemap while it canonicalises to Signature", inSitemap.length === 0, inSitemap.join(", "));
const formDefs = read(`site${DIR}/form-definitions.html`);
check("the old-form-names page is noindex and not in the sitemap",
  /<meta name="robots" content="noindex/.test(formDefs) && !sitemaps.includes(`${DIR}/form-definitions.html`));

console.log("\n2. Nothing outside the Collection links to it yet (phase e)");
const collectionBlog = constants.blog.map((s) => path.join(SITE, "blog", `${s}.html`));
const outside = walk(SITE).filter((f) => !isCollection(f) && !collectionBlog.includes(f) &&
  !f.includes(`${path.sep}signature-property-collection${path.sep}`));
const linking = outside.filter((f) => /href="(?:https:\/\/www\.thelittleladysellshomes\.com)?\/signature-property-collection\//.test(fs.readFileSync(f, "utf8")));
check(`no other page links to a Collection page (${outside.length} pages)`, linking.length === 0,
  linking.slice(0, 5).map((f) => path.relative(ROOT, f)).join(", "));
const blogIndex = read("site/blog/index.html");
const feed = read("site/feed.xml");
check("the moved posts are not in the blog index or the RSS feed",
  constants.blog.every((s) => !blogIndex.includes(`/blog/${s}.html`) && !feed.includes(`/blog/${s}.html`)));

console.log("\n3. The tier's look and fonts load on its pages only");
const tierFont = new RegExp(`/assets/fonts/(?:${constants.fonts.map((f) => f.replace(/[.-]/g, (c) => `\\${c}`)).join("|")})`);
const leaking = outside.filter((f) => {
  const h = fs.readFileSync(f, "utf8");
  return tierFont.test(h) || /class="tier-signature"/.test(h) || h.includes("body.tier-signature{");
});
check("no page outside the Collection loads a Collection font, its stylesheet or its body class", leaking.length === 0,
  leaking.slice(0, 5).map((f) => path.relative(ROOT, f)).join(", "));
for (const p of [`${DIR}/index.html`, `${DIR}/sellers.html`, `/blog/${constants.blog[0]}.html`]) {
  const html = read(`site${p}`);
  check(`${p}: body.tier-signature, the Collection bar, its preloads and font faces`,
    /<body class="tier-signature">/.test(html) && html.includes('class="collection-bar"') &&
    constants.preload.every((f) => html.includes(`<link rel="preload" href="/assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`)) &&
    /@font-face\{font-family:'Libre Baskerville'/.test(html.replace(/\s+/g, "").replace(/font-family:/g, "font-family:")) || /font-family:\s*'Libre Baskerville'/.test(html));
  check(`${p}: none of the site's own font preloads (they would render nothing here)`,
    !/<link rel="preload" href="\/assets\/fonts\/open-sans/.test(html));
  check(`${p}: the Collection's share card`, html.includes(`${constants.domain}/assets/img/signature-collection/og-card.png`));
}
check("every tier font file is on disk", constants.fonts.every((f) => exists(`build/assets/fonts/${f}`)));
const tierBytes = constants.fonts.reduce((n, f) => n + fs.statSync(path.join(ROOT, "build/assets/fonts", f)).size, 0);
check(`the nine tier fonts are subset (${Math.round(tierBytes / 1024)} KB, budget 140 KB)`, tierBytes < 140 * 1024);

// WOFF2: header, table directory, one brotli stream holding the tables in
// directory order. OS/2 is never transformed, so its bytes sit in the stream
// at the running offset; usWeightClass is at byte 4 of it.
function woff2WeightClass(file) {
  const b = fs.readFileSync(file);
  if (b.toString("latin1", 0, 4) !== "wOF2") return null;
  const numTables = b.readUInt16BE(12);
  const TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];
  let pos = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const x = b[pos++]; v = (v << 7) | (x & 0x7f); if (!(x & 0x80)) return v >>> 0; } return null; };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[pos++];
    let tag = TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = b.toString("latin1", pos, pos + 4); pos += 4; }
    const version = (flags >> 6) & 3;
    const orig = base128();
    const transformed = (tag === "glyf" || tag === "loca") ? version !== 3 : version !== 0;
    const len = transformed ? base128() : orig;
    dir.push({ tag, len });
  }
  const total = b.readUInt32BE(20);
  const data = zlib.brotliDecompressSync(b.subarray(pos, pos + total));
  let off = 0;
  for (const t of dir) {
    if (t.tag === "OS/2") return data.readUInt16BE(off + 4);
    off += t.len;
  }
  return null;
}
const lb = (w) => path.join(ROOT, "build/assets/fonts", `libre-baskerville-${w}-latin.woff2`);
check("Libre Baskerville 700 is its own file, not a copy of the 400",
  !fs.readFileSync(lb(400)).equals(fs.readFileSync(lb(700))));
check("and it is a real bold: OS/2 usWeightClass 700 (the regular is 400)",
  woff2WeightClass(lb(700)) === 700 && woff2WeightClass(lb(400)) === 400,
  `${woff2WeightClass(lb(700))} / ${woff2WeightClass(lb(400))}`);
check("Poppins 600 and Corinthia carry their own weights",
  woff2WeightClass(path.join(ROOT, "build/assets/fonts/poppins-600-latin.woff2")) === 600 &&
  woff2WeightClass(path.join(ROOT, "build/assets/fonts/corinthia-400-latin.woff2")) === 400);

console.log("\n4. The copy rules, on every Collection page and moved post");
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/\s+/g, " ");
const RULES = [
  ["\"dream home\"", /dream[\s-]home/i],
  ["a self-nominating \"best\" agent", /best luxury|best (?:real estate )?agent|best realtor/i],
  ["\"live from IRES\"", /live (?:from|on) (?:the )?ires/i],
  ["\"right now\"", /right now/i],
  ["a second agent", /\bkendra\b|bajcar|970[\s.-]?571[\s.-]?0525/i],
  ["the retired Bold Collective brand", /bold collective/i],
];
const tierPages = [...collectionFiles, ...collectionBlog].filter((f) => fs.existsSync(f));
for (const [label, re] of RULES) {
  const bad = tierPages.filter((f) => re.test(visible(fs.readFileSync(f, "utf8"))));
  check(`no ${label} (${tierPages.length} pages)`, bad.length === 0, bad.map((f) => path.relative(SITE, f)).join(", "));
}
check("no page title or meta description says \"right now\" or \"dream home\"",
  tierPages.every((f) => {
    const h = fs.readFileSync(f, "utf8");
    const head = (h.match(/<title>[^<]*<\/title>/) || [""])[0] + (h.match(/<meta name="description" content="[^"]*"/) || [""])[0];
    return !/right now|dream home/i.test(head);
  }));
check("the moved June report says it is a dated snapshot, with source and window",
  /Source: IRES MLS, trailing 60 days/.test(read(`site/blog/${"june-2026-northern-colorado-luxury-market-report"}.html`)) &&
  /June 2026 snapshot/.test(read("site/blog/june-2026-northern-colorado-luxury-market-report.html")));
check("and holds no street address in its copy (its source did, as stray lines)",
  !/County Road 98|Gold Stone Creek/.test(visible(read("site/blog/june-2026-northern-colorado-luxury-market-report.html"))));

console.log("\n5. Forms: new names, labelled, tagged, with the thank-you contract");
const NEW_FORMS = ["signature-buyers-inquiry", "signature-sellers-inquiry", "signature-concierge-inquiry",
  "signature-luxury-market", "signature-resort-buyer-inquiry", "signature-expired-inquiry"];
const collectionHtml = collectionFiles.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const sub = read("netlify/functions/submission-created.js");
const ty = read("site/thank-you.html");
for (const name of NEW_FORMS) {
  check(`${name}: on a Collection page, posting to /thank-you.html?from=${name}`,
    collectionHtml.includes(`name="${name}" action="/thank-you.html?from=${name}" method="POST" data-netlify="true"`));
  check(`${name}: a Collection source label and the "Signature Collection" tag`,
    new RegExp(`"${name}": "The Little Lady's Signature Property Collection - `).test(sub) &&
    new RegExp(`"${name}": \\["Signature Collection"`).test(sub));
  check(`${name}: a tailored thank-you message`, ty.includes(`"${name}":`));
}
check("the old luxury-market and concierge-page-inquiry names now read as the Collection's",
  /"luxury-market": "The Little Lady's Signature Property Collection - /.test(sub) &&
  /"concierge-page-inquiry": "The Little Lady's Signature Property Collection - /.test(sub));
check("the printed-piece fields reach the Lofty note", /Printed piece: /.test(sub) && /data\.print_mid/.test(sub));

const OLD = {
  "buyers-guide": [], "sellers-guide": [], "relocation-guide": [], "lifestyle-search": [], "luxury-market": [],
  "buyers-page-inquiry": ["message"], "concierge-page-inquiry": ["message"], "contact": ["message"],
  "testimonials-page-inquiry": ["message"], "free-home-valuation": ["address"], "sellers-page-inquiry": ["address"],
  "seller-local-proof": ["address", "local_proof_town"], "relocation": ["moving_from"],
  "listing-alert-request": ["alert_criteria", "alert_query", "message"],
  "listing-inquiry": ["inquiry_type", "listing_address", "listing_mls", "message"],
  "neighborhood-quiz": ["quiz_answers", "quiz_match"],
};
for (const [name, fields] of Object.entries(OLD)) {
  const m = formDefs.match(new RegExp(`<form class="lead-form" name="${name}" action="/thank-you\\.html\\?from=${name}"[\\s\\S]*?</form>`));
  const all = ["name", "email", "phone", ...fields];
  check(`old Signature form "${name}" is registered with ${all.join(", ")}`,
    m && all.every((f) => m[0].includes(`name="${f}"`)) && new RegExp(`"${name}": "`).test(sub));
}

console.log("\n6. Search, schema, analytics, listing shell");
const redirects = read("site/_redirects");
check("the Collection's search is a forced rewrite to the tier-aware home-search",
  ["", "/", ".html"].every((s) => redirects.includes(`${DIR}/search-homes${s}  /.netlify/functions/home-search?tier=signature-collection  200!`)));
delete process.env.IDX_SEARCH_URL;
const hs = require(path.join(ROOT, "netlify/functions/home-search.js"));
const H = require(path.join(ROOT, "netlify/functions/lib/_home-search.js"));
const cond = (u) => JSON.parse(new URL(u).searchParams.get("condition"));
(async () => {
  const tierRes = await hs.localHandler({ path: `${DIR}/search-homes.html`, rawQuery: "cities=Loveland",
    queryStringParameters: { cities: "Loveland", tier: "signature-collection" } });
  const tu = tierRes.headers.Location;
  check("a Collection search keeps the $950K floor", cond(tu).price === "950000,", JSON.stringify(cond(tu)));
  check("and is tagged utm_campaign=signature-collection", new URL(tu).searchParams.get("utm_campaign") === "signature-collection");
  const byPath = await hs.localHandler({ path: `${DIR}/search-homes.html`, rawQuery: "cities=Windsor", queryStringParameters: { cities: "Windsor" } });
  check("the tier is recognised from the path alone", new URL(byPath.headers.Location).searchParams.get("utm_campaign") === "signature-collection");
  const siteRes = await hs.localHandler({ path: "/search-homes.html", rawQuery: "cities=Loveland", queryStringParameters: { cities: "Loveland" } });
  check("the site's own search has no floor and stays utm_campaign=home-search",
    cond(siteRes.headers.Location).price === undefined && new URL(siteRes.headers.Location).searchParams.get("utm_campaign") === "home-search");
  // Passed through to the Signature site (the default until Christine switches
  // the backend): its answer knows nothing of the tier, so it is re-tagged here.
  const realFetch = global.fetch;
  const asked = [];
  global.fetch = async (url) => {
    asked.push(String(url));
    const q = new URL(String(url)).searchParams;
    const loc = "https://thelittleladyhomesearch.com/listing?condition=%7B%7D&page=1&utm_source=thelittleladysellshomes.com" +
      "&utm_medium=website&utm_campaign=home-search" + (q.get("subdivision") ? "&x=1" : "");
    return new Response(null, { status: 302, headers: { location: loc } });
  };
  try {
    const px = await hs.handler({ path: `${DIR}/search-homes.html`, rawQuery: "cities=Loveland",
      queryStringParameters: { cities: "Loveland", tier: "signature-collection" }, headers: {} });
    const up = new URL(asked[asked.length - 1]).searchParams;
    check("passed through, the Collection search asks Signature for the tier without noFloor",
      up.get("tier") === "signature-collection" && !up.has("noFloor") && up.get("site") === "thelittleladysellshomes",
      asked[asked.length - 1]);
    const loc = px.headers && (px.headers.Location || px.headers.location);
    check("and the answer is re-tagged utm_campaign=signature-collection",
      px.statusCode === 302 && loc && new URL(loc).searchParams.get("utm_campaign") === "signature-collection", loc);
    const plain = await hs.handler({ path: "/search-homes.html", rawQuery: "cities=Loveland",
      queryStringParameters: { cities: "Loveland" }, headers: {} });
    const ploc = plain.headers && (plain.headers.Location || plain.headers.location);
    check("the site's own search passes through untouched (noFloor, home-search)",
      new URL(asked[asked.length - 1]).searchParams.get("noFloor") === "true" &&
      new URL(ploc).searchParams.get("utm_campaign") === "home-search");

    check("filters the search can't apply are named, not dropped silently",
      /can't filter for horse property/.test(H.homeSearchNote({ city: "Eaton", subdivision: "Equestrian", noFloor: "true" })) &&
      /waterfront and the Mariana Butte neighborhood/.test(H.homeSearchNote({ city: "Loveland", subdivision: "Mariana Butte", waterfront: "true" })) &&
      /can't filter for land/.test(H.homeSearchNote({ propertyCategory: "land", noFloor: "true" })) &&
      H.homeSearchNote({ city: "Loveland", beds: "3" }) === "");
    const noteRes = await hs.handler({ path: "/search-homes.html", rawQuery: "city=Eaton&subdivision=Equestrian&noFloor=true",
      queryStringParameters: { city: "Eaton", subdivision: "Equestrian", noFloor: "true" }, headers: {} });
    check("a link asking for one gets a note page, not a silent redirect to the wider search",
      noteRes.statusCode === 200 && /can&#39;t filter for horse property/.test(noteRes.body), String(noteRes.statusCode));
    check("the note page is noindex, links the same search and offers Christine",
      /<meta name="robots" content="noindex">/.test(noteRes.body) &&
      /href="https:\/\/thelittleladyhomesearch\.com\/listing\?condition=/.test(noteRes.body) &&
      /href="\/contact\.html">Ask Christine/.test(noteRes.body));
  } finally {
    global.fetch = realFetch;
  }
  const widget = read("build/build.py");
  check("the listing widgets show the same note under their hand-off button",
    /data\.note === 'string'/.test(widget) && /note: homeSearchNote\(params\)/.test(read("netlify/functions/listings-search.js")));

  // Schema: one Christine, a Brand node for the Collection.
  const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean);
  const hub = read(`site${DIR}/index.html`);
  const nodes = ldBlocks(hub).flatMap((o) => (o["@graph"] ? o["@graph"] : [o]));
  const brand = nodes.find((n) => n["@type"] === "Brand");
  check("the hub carries a Brand node for the Collection, with its own logo", brand && brand["@id"] === constants.collection_id &&
    /signature-collection\/logo\.png$/.test(brand.logo || ""));
  check("and ties it to Christine's one @id", nodes.some((n) => n["@id"] === constants.agent_id && n.brand && n.brand["@id"] === constants.collection_id));
  const christineIds = new Set();
  for (const f of tierPages) for (const n of ldBlocks(fs.readFileSync(f, "utf8")).flatMap((o) => (o["@graph"] ? o["@graph"] : [o])))
    if (n["@type"] === "RealEstateAgent" || n["@type"] === "Person" && /Gwinnup/.test(n.name || "")) if (n["@id"]) christineIds.add(n["@id"]);
  check("no Collection page names a second Christine @id (Signature's is not carried over)",
    [...christineIds].every((id) => id === constants.agent_id), [...christineIds].join(", "));

  // Analytics.
  check("tier pages report content_group 'signature-collection' to GA4",
    constants.tag_on.includes(`gtag('config','${GA}',{content_group:'signature-collection'});`) &&
    constants.tag_off.includes(`gtag('config','${GA}');`) && !constants.tag_off.includes("content_group"));
  const analytics = read("build/postprocess_audit_fixes.py");
  check("a click into the Collection (here or on the Signature domain) is collection_click",
    /d==='signaturepropertycollection\.com'\)\{send\('collection_click'/.test(analytics) &&
    /send\('collection_click',\{link_path:u\.pathname/.test(analytics) &&
    !/\['signaturepropertycollection\.com','owninnoco\.com'\]/.test(analytics));

  // Listing shell.
  const shellDir = path.join(tmp, "netlify", "functions", "lib");
  const colShell = fs.readFileSync(path.join(shellDir, "_listing-page-shell-collection.html"), "utf8");
  const mainShell = fs.readFileSync(path.join(shellDir, "_listing-page-shell.html"), "utf8");
  check("the Collection listing shell: tier body, bar, fonts and content_group",
    /<body class="tier-signature">/.test(colShell) && colShell.includes('class="collection-bar"') &&
    colShell.includes("libre-baskerville-400-latin.woff2") && colShell.includes("content_group:'signature-collection'"));
  check("the site's listing shell has none of them",
    !/tier-signature/.test(mainShell) && !mainShell.includes("libre-baskerville") && !mainShell.includes("content_group"));
  check("the Collection shell carries the tier stylesheet after the site's",
    colShell.indexOf("body.tier-signature{") > colShell.indexOf(".eyebrow{"));
  check("both shells keep every slot", ["TITLE", "DESCRIPTION", "CANONICAL", "OG_IMAGE", "SCHEMA", "BODY"]
    .every((k) => colShell.includes(`{{${k}}}`) && mainShell.includes(`{{${k}}}`)));
  const lp = require(path.join(ROOT, "netlify/functions/listing-page.js"));
  check("a listing from $950K gets the Collection shell, one below does not",
    lp.isCollectionListing({ price: 950000 }) && !lp.isCollectionListing({ price: 949999 }));
  const vi = lp.viewItemScript({ listingId: "IRE1", price: 1250000, city: "Loveland", address: "12 Secret Ln" });
  check("listing pages send view_item with the MLS number, price and town -- never the address",
    /"view_item"/.test(vi) && /"item_id":"IRE1"/.test(vi) && /"price":1250000/.test(vi) &&
    /"item_category":"Loveland"/.test(vi) && !/Secret/.test(vi) && /typeof window\.gtag==="function"/.test(vi));
  const toml = read("netlify.toml");
  check("the Collection shell is bundled with the function (included_files)", toml.includes('"netlify/functions/lib/_listing-page-shell-collection.html"'));

  console.log("\n7. The book landing page");
  const book = read(`site${DIR}/expired-listings.html`);
  const digits = constants.phone.replace(/\D/g, "");
  check("canonical to Signature's expired-listings page for now",
    book.includes(`<link rel="canonical" href="${constants.sig}/expired-listings.html">`));
  check("Christine's own number from the site config", book.includes(`href="tel:+1${digits}"`) && book.includes(constants.phone));
  check("a form carrying print_source, print_mid and print_gap as static fields",
    /name="signature-expired-inquiry"[\s\S]*?<input type="hidden" name="print_source" value="">[\s\S]*?name="print_mid"[\s\S]*?name="print_gap"[\s\S]*?<\/form>/.test(book));
  check("filled from the printed QR's src, mid and gap", /"src": "print_source"/.test(book) && /"mid": "print_mid"/.test(book) && /"gap": "print_gap"/.test(book));
  const bookForm = (book.match(/<form class="lead-form" name="signature-expired-inquiry"[\s\S]*?<\/form>/) || [""])[0];
  check("and the static utm_source / utm_medium / utm_campaign fields the site's attribution fills (expiredbook, print, expiredelite)",
    ["utm_source", "utm_medium", "utm_campaign"].every((f) => bookForm.includes(`name="${f}"`)));
  check("tells a reader holding a Signature book they are in the right place", /Signature Property Collection brought you here/.test(book));

  console.log("\n8. The tier's colours, on the values in collection.css");
  const tier = read("build/assets/css/collection.css");
  const tok = (name) => (tier.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const deep = tok("deep-mauve"), rose = tok("rose");
  const CREAM = "#F8F6F4", WHITE = "#FFFFFF", CHARCOAL = "#141415";
  check(`deep mauve ${deep} on cream: ${ratio(deep, CREAM).toFixed(2)}:1 (AA 4.5)`, deep && ratio(deep, CREAM) >= 4.5);
  check(`white on deep mauve buttons: ${ratio(WHITE, deep).toFixed(2)}:1`, deep && ratio(WHITE, deep) >= 4.5);
  check(`rose ${rose} on charcoal (the dark grounds): ${ratio(rose, CHARCOAL).toFixed(2)}:1`, rose && ratio(rose, CHARCOAL) >= 4.5);
  check("light grounds use deep mauve, dark grounds the rose", /--dusty-rose:\s*var\(--deep-mauve\)/.test(tier) &&
    /\.tier-signature \.section-dark[\s\S]{0,200}?\{\s*--dusty-rose:\s*var\(--rose\)/.test(tier));

  if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
  console.log("\nAll checks passed.");
})().catch((e) => { console.log(`  FAIL unexpected error — ${e && e.stack}`); process.exit(1); });
