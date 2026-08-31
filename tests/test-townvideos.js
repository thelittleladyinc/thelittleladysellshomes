// Town listing-tour regression coverage. Validate the rendered production output,
// not JSON-LD whitespace formatting: post-build gates compact structured data.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const BUILD = fs.readFileSync(path.join(ROOT, "build", "build.py"), "utf8");

function block(name) {
  const m = BUILD.match(new RegExp(`\\n${name} = \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`${name} not found in build.py`);
  return m[1];
}

const TOWN_VIDEOS = {};
{
  let slug = null;
  for (const line of block("TOWN_LISTING_VIDEOS").split("\n")) {
    const s = line.match(/^\s{4}"([a-z0-9-]+)": \[/);
    if (s) { slug = s[1]; TOWN_VIDEOS[slug] = []; continue; }
    const v = line.match(/^\s+\("([\w-]+)", (".*?"|'.*?'), (\d+), (None|"[^"]*")\),\s*$/);
    if (v && slug) TOWN_VIDEOS[slug].push({
      id: v[1], title: v[2].slice(1, -1), views: Number(v[3]),
      prop: v[4] === "None" ? null : v[4].slice(1, -1),
    });
  }
}
const OFF_BRAND = new Set(
  [...block("OFF_BRAND_LISTING_VIDEOS").matchAll(/^\s+"([\w-]+)":/gm)].map((m) => m[1]));

console.log("\n1. The data itself");
const towns = Object.keys(TOWN_VIDEOS);
const all = Object.values(TOWN_VIDEOS).flat();
check(`parsed ${towns.length} towns and ${all.length} videos out of build.py`, towns.length >= 10 && all.length >= 30, JSON.stringify(towns));
check(`${OFF_BRAND.size} videos held back, and the parse found them`, OFF_BRAND.size >= 5);
const allIds = all.map((v) => v.id);
check("every id looks like a YouTube id", allIds.every((i) => /^[\w-]{11}$/.test(i)), allIds.filter((i) => !/^[\w-]{11}$/.test(i)).join(", "));
const dupIds = allIds.filter((i, n) => allIds.indexOf(i) !== n);
check("no video is filed under two towns", dupIds.length === 0, dupIds.join(", "));

const pagesBySlug = {};
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) (pagesBySlug[e.name.replace(/\.html$/, "")] ||= []).push(p);
  }
}
walk(path.join(SITE, "communities"));
const pageSlug = (s) => s.replace(/-city$/, "");
const missing = towns.filter((t) => !pagesBySlug[pageSlug(t)]);
check("every town with videos has a page", missing.length === 0, missing.join(", "));

console.log("\n2. What actually reached the pages");
const HEAD = /<span class="eyebrow">[^<]*Work In ([^<]+)<\/span>([\s\S]*?)<\/section>/;
const embedded = {};
let pageCount = 0, embedCount = 0;
for (const paths of Object.values(pagesBySlug)) {
  for (const p of paths) {
    const html = fs.readFileSync(p, "utf8");
    const m = html.match(HEAD);
    if (!m) continue;
    pageCount++;
    const ids = [...m[2].matchAll(/class="yt-facade" data-yt="([\w-]+)"/g)].map((x) => x[1]);
    embedded[path.relative(ROOT, p)] = { ids, section: m[2], town: m[1].trim(), html };
    embedCount += ids.length;
  }
}
check(`the block renders on ${pageCount} town pages with ${embedCount} tours`, pageCount >= 9 && embedCount >= 15, `${pageCount} pages / ${embedCount} tours`);

for (const [page, { ids, section, town, html }] of Object.entries(embedded)) {
  const slug = towns.find((t) => pageSlug(t) === path.basename(page, ".html"));
  const data = TOWN_VIDEOS[slug] || [];
  const byId = Object.fromEntries(data.map((v) => [v.id, v]));
  const foreign = ids.filter((i) => !byId[i]);
  check(`${page}: every tour is one of ${town}'s own`, foreign.length === 0, foreign.join(", "));
  const held = ids.filter((i) => OFF_BRAND.has(i));
  check(`${page}: no price-anchored tour`, held.length === 0, held.join(", "));

  const props = ids.map((i) => byId[i]?.prop).filter(Boolean);
  const dupProp = props.filter((p, n) => props.indexOf(p) !== n);
  check(`${page}: no house shown twice in the block`, dupProp.length === 0, dupProp.join(", "));

  const pageIds = [...html.matchAll(/class="yt-facade" data-yt="([\w-]+)"/g)].map((x) => x[1]);
  const pageProps = pageIds.map((i) => byId[i]?.prop).filter(Boolean);
  const dupPageProp = pageProps.filter((p, n) => pageProps.indexOf(p) !== n);
  check(`${page}: no house shown twice anywhere on the page`, dupPageProp.length === 0, dupPageProp.join(", "));
  check(`${page}: at most 4 tours`, ids.length <= 4, `${ids.length}`);
  const views = ids.map((i) => byId[i]?.views ?? 0);
  check(`${page}: ordered most-watched first`, views.every((v, n) => n === 0 || views[n - 1] >= v), JSON.stringify(views));
  check(`${page}: no sold/pending/under-contract wording in the block`, !/\b(Sold|Pending|Under Contract|Closed)\b/.test(section.replace(/<iframe[\s\S]*?<\/iframe>/g, "")), (section.match(/\b(Sold|Pending|Under Contract|Closed)\b/) || [])[0]);
  check(`${page}: no caption under any tour`, !/video-embed-caption/.test(section));
  check(`${page}: the block quotes no view counts`, !/\d[\d,]*\s*views/.test(section));

  // Whitespace-insensitive by design: JSON-LD is semantically identical whether
  // the postprocessor emits `"embedUrl": "..."` or compact `"embedUrl":"..."`.
  const schemas = [...html.matchAll(/"embedUrl"\s*:\s*"https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]+)"/g)].map((x) => x[1]);
  const unschemad = ids.filter((i) => !schemas.includes(i));
  check(`${page}: every tour carries VideoObject schema`, unschemad.length === 0, unschemad.join(", "));
}

console.log("\n3. The heading claims only what is true of all of them");
for (const [page, { section }] of Object.entries(embedded)) {
  check(`${page}: heading offers examples of the marketing, claims no sale`, /Examples Of [^<]*Marketing In/.test(section) && !/Homes Sold In/.test(section));
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
