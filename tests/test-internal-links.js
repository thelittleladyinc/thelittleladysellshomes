// Internal-link structure and orphan/indexing contract.
//
// Town/subdivision pages must retain a healthy internal-link mesh. A page with
// zero inbound links is allowed only when it is intentionally non-indexable OR
// when its exact URL is a permanent redirect source and is absent from sitemap.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const files = walk(SITE);
const urlOf = (f) => "/" + path.relative(SITE, f).split(path.sep).join("/");
const html = new Map(files.map((f) => [urlOf(f), fs.readFileSync(f, "utf8")]));

// Inbound internal links, resolved the way the CDN serves final HTML targets.
const inbound = new Map([...html.keys()].map((u) => [u, 0]));
for (const [from, body] of html) {
  const seen = new Set();
  for (const m of body.matchAll(/href="(\/[^"#?]*)"/g)) {
    let t = m[1];
    if (t.endsWith("/")) t += "index.html";
    if (!t.endsWith(".html")) {
      if (html.has(t + ".html")) t += ".html";
      else continue;
    }
    if (t === from || seen.has(t)) continue;
    seen.add(t);
    if (inbound.has(t)) inbound.set(t, inbound.get(t) + 1);
  }
}

const townPages = [...html.keys()].filter((u) => /^\/communities\/[a-z-]+\/[a-z-]+\.html$/.test(u));
const subdivisions = townPages.filter((u) => u.startsWith("/communities/loveland/"));
const towns = townPages.filter((u) => !u.startsWith("/communities/loveland/"));

check(`town pages were found (${towns.length})`, towns.length >= 25, String(towns.length));
check(`subdivision pages were found (${subdivisions.length})`, subdivisions.length >= 8, String(subdivisions.length));

const MIN = 3;
for (const [label, group] of [["town", towns], ["subdivision", subdivisions]]) {
  const starved = group.filter((u) => inbound.get(u) < MIN);
  const min = Math.min(...group.map((u) => inbound.get(u)));
  check(`every ${label} page has ${MIN}+ inbound links (lowest: ${min})`,
    starved.length === 0,
    starved.slice(0, 4).map((u) => `${u}=${inbound.get(u)}`).join(", "));
}

const hub = html.get("/communities/index.html") || "";
const linkedFromHub = towns.filter((u) => hub.includes(`href="${u}"`));
check(`the communities hub links every town page (${linkedFromHub.length}/${towns.length})`,
  linkedFromHub.length === towns.length,
  towns.filter((u) => !linkedFromHub.includes(u)).slice(0, 4).join(", "));

const sample = towns.filter((u) => u.startsWith("/communities/weld/"));
const crossLinked = sample.filter((u) =>
  sample.some((o) => o !== u && html.get(u).includes(`href="${o}"`)));
check(`towns link their county siblings (${crossLinked.length}/${sample.length} in Weld)`,
  sample.length > 1 && crossLinked.length === sample.length);

const sitemap = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
const noindex = (u) => /name="robots"[^>]*noindex/.test(html.get(u) || "");

// Parse exact literal 301 sources from the production redirect file. Redirect-source
// HTML can remain on disk as generator output while Netlify never serves it as 200.
const redirectSources = new Set();
const redirectsText = fs.readFileSync(path.join(SITE, "_redirects"), "utf8");
for (const raw of redirectsText.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const parts = line.split(/\s+/);
  if (parts.length < 3 || !/^301!?$/.test(parts[2])) continue;
  const src = parts[0];
  if (!src.startsWith("/") || /[*:]/.test(src)) continue;
  redirectSources.add(src);
}

const orphans = [...inbound].filter(([, n]) => n === 0).map(([u]) => u);
const intentionallyRedirected = (u) => redirectSources.has(u) && !sitemap.includes(`<loc>https://www.thelittleladysellshomes.com${u}</loc>`);
const badOrphans = orphans.filter((u) =>
  u !== "/404.html" && !noindex(u) && !intentionallyRedirected(u));
check(`every orphan is noindex, 404, or an intentional 301 source (${orphans.join(", ")})`,
  badOrphans.length === 0, badOrphans.join(", "));

const noindexed = [...html.keys()].filter(noindex);
const contradictory = noindexed.filter((u) => sitemap.includes(u));
check(`no noindex page is submitted in the sitemap (${noindexed.length} noindex)`,
  contradictory.length === 0, contradictory.join(", "));
check("404.html is not in the sitemap", !sitemap.includes("/404.html"));

const broken = [];
for (const m of hub.matchAll(/href="(\/communities\/[^"#?]*\.html)"/g)) {
  if (!html.has(m[1])) broken.push(m[1]);
}
check("no directory entry points at a missing page", broken.length === 0, broken.join(", "));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
