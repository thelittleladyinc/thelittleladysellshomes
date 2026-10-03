// The keep-what-ranks layer (build/legacy_pages.py): every URL the old
// iHouseWeb site ranked with either renders at its exact address or 301s to
// its engine successor. The 2023 traffic loss is why this suite exists.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const terms = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "data", "legacy_terms.json"), "utf8")).terms;
check(`the term map covers the crawled site (${terms.length} URLs)`, terms.length >= 600);

// Every term URL must resolve: its own file, an engine file, or a 301.
const redirects = fs.existsSync(path.join(SITE, "_redirects"))
  ? fs.readFileSync(path.join(SITE, "_redirects"), "utf8") : "";
const unresolved = [];
for (const t of terms) {
  if (t.url === "/" || t.url.startsWith("/-/")) continue;
  const rel = t.url.replace(/^\//, "");
  const served = fs.existsSync(path.join(SITE, rel + ".html")) ||
    fs.existsSync(path.join(SITE, rel, "index.html")) ||
    redirects.includes(`${t.url} `);
  if (!served) unresolved.push(t.url);
}
check(`every legacy URL is served or redirected (${terms.length - unresolved.length}/${terms.length})`,
  unresolved.length === 0, unresolved.slice(0, 5).join(", "));

// The single biggest GSC earner: the zoning post, intact at its address.
const zoning = fs.readFileSync(path.join(SITE, "understanding-open-zoning-in-larimer-county.html"), "utf8");
check("the zoning post keeps its ranking title",
  zoning.includes("What Does Open Zoning Mean in Larimer County Colorado?"));
// 2026-08-25: this asserted the EXTENSIONLESS form until today, and had been
// failing since Wave 4 (2026-08-23) removed the rewrite that produced it. That
// removal was the correction, not a regression: Netlify 301s /foo -> /foo.html in
// production, so declaring /foo canonical named a URL that redirects -- the exact
// input for "Duplicate, Google chose a different canonical", across ~610 pages.
// What has to hold is that the declared canonical is the URL that serves 200.
check("its canonical is the .html URL that actually serves 200",
  zoning.includes('rel="canonical" href="https://www.thelittleladysellshomes.com/understanding-open-zoning-in-larimer-county.html"'),
  "a canonical that redirects is the signal Google ignores");
check("and not the extensionless form, which 301s",
  !/rel="canonical" href="[^"]*larimer-county"/.test(zoning));
check("the article body migrated (not a stub)",
  zoning.includes("Density") && zoning.length > 20000);
check("the body does not repeat the hero h1",
  (zoning.match(/Understanding Open Zoning in Larimer County</g) || []).length <= 2);

// A price-band search page: scoped live feed + full-search link.
const band = fs.readFileSync(path.join(SITE, "homes-for-sale-in-loveland-co-250000-to-400000.html"), "utf8");
check("price-band page embeds a live feed scoped to its filters",
  band.includes("listings-search?") && band.includes("minPrice=250000") && band.includes("maxPrice=400000"));
check("and opts out of the shared backend's luxury floor",
  band.includes("noFloor=true"),
  "without it the shared listings-search applies the Signature $950K floor");
check("with a route into the full search presets",
  band.includes('href="/search-homes.html?'));

// Media: content must not depend on iHouseWeb's CDN (it dies with the account).
const sampled = ["marketing-matters.html", "understanding-open-zoning-in-larimer-county.html", "rent-to-own.html"]
  .filter(f => fs.existsSync(path.join(SITE, f)));
const leaking = sampled.filter(f => /ihouseprd/.test(fs.readFileSync(path.join(SITE, f), "utf8")));
check(`no sampled page still hotlinks the dying CDN (${sampled.length} sampled)`,
  leaking.length === 0, leaking.join(", "));
check("rehosted media shipped with the site",
  fs.existsSync(path.join(SITE, "assets", "legacy-media")) &&
  fs.readdirSync(path.join(SITE, "assets", "legacy-media")).length > 100);

// Page speed on the imported pages (2026-09-30). They were the heaviest URLs on
// the site: multi-megabyte originals, desktop pixel sizes, live players.
{
  const ours = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "data", ".legacy_outputs.json"), "utf8"))
    .map((u) => path.join(SITE, u)).filter((f) => fs.existsSync(f));
  const bodyOf = (html) => (html.match(/<main id="main">([\s\S]*)<\/main>/) || [, html])[1]
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const players = [], unsized = [], eager = [], pinned = [], srcsets = [], missing = [];
  let legacyImgs = 0;
  for (const f of ours) {
    const body = bodyOf(fs.readFileSync(f, "utf8"));
    const rel = path.relative(SITE, f);
    for (const t of body.match(/<iframe\b[^>]*>/gi) || []) {
      if (/youtube(-nocookie)?\.com\/embed|wistia\.(com|net)/i.test(t)) players.push(rel);
      else if (!/loading="lazy"/.test(t)) eager.push(`${rel} iframe`);
    }
    for (const t of body.match(/<img\b[^>]*>/gi) || []) {
      if (!/\/assets\/legacy-media\//.test(t)) continue;
      legacyImgs++;
      const src = (t.match(/\ssrc="([^"]+)"/) || [])[1] || "";
      if (!/\swidth="\d+"/.test(t) || !/\sheight="\d+"/.test(t)) unsized.push(rel);
      if (!/loading="lazy"/.test(t) && !/fetchpriority="high"/.test(t)) eager.push(rel);
      if (/style="[^"]*(?:^|[;\s])(?:max-|min-)?(?:width|height)\s*:\s*\d+px/i.test(t)) pinned.push(rel);
      if (/\ssrcset=/.test(t) || src.includes("?")) srcsets.push(rel);
      if (!fs.existsSync(path.join(SITE, src))) missing.push(`${rel} ${src}`);
    }
  }
  check(`no imported page loads a YouTube or Wistia player before a click (${ours.length} pages)`,
    players.length === 0, [...new Set(players)].slice(0, 5).join(", "));
  check(`every rehosted image has width and height (${legacyImgs})`, unsized.length === 0,
    [...new Set(unsized)].slice(0, 5).join(", "));
  check("every rehosted image and remaining embed loads lazily (unless marked as the LCP image)",
    eager.length === 0, [...new Set(eager)].slice(0, 5).join(", "));
  check("no rehosted image is pinned to a pixel width or height", pinned.length === 0,
    [...new Set(pinned)].slice(0, 5).join(", ") + " -- a 960px box on a 412px phone stretches");
  check("no rehosted image carries the old ?width= query or srcset pairs", srcsets.length === 0,
    [...new Set(srcsets)].slice(0, 5).join(", "));
  check("every rehosted image a page names exists", missing.length === 0, missing.slice(0, 3).join(", "));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "data", "legacy_media_webp.json"), "utf8")).files;
  const absent = Object.values(manifest).filter((e) => e.webp
    && !fs.existsSync(path.join(ROOT, "build", "assets", "legacy-media", e.webp)));
  check("every WebP copy the manifest names exists", absent.length === 0,
    absent.map((e) => e.webp).slice(0, 3).join(", "));
  // The two pages that measured 5.2MB each.
  for (const [rel, cap] of [["northern-colorado-downsizing-guide.html", 600], ["day-trips-from-loveland-co.html", 900]]) {
    const html = fs.readFileSync(path.join(SITE, rel), "utf8");
    const bytes = [...bodyOf(html).matchAll(/<img\b[^>]*\ssrc="(\/assets\/legacy-media\/[^"]+)"/g)]
      .reduce((n, m) => n + fs.statSync(path.join(SITE, m[1])).size, 0);
    check(`${rel} images weigh ${Math.round(bytes / 1024)}KB (under ${cap}KB; it was 5.2MB)`, bytes < cap * 1024);
  }
  const css = (fs.readFileSync(path.join(SITE, "index.html"), "utf8").match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || "";
  check("article images shrink with the column instead of stretching (.blog-article img{height:auto})",
    /\.blog-article img\{height:auto\}/.test(css));
}

// Discovery: the directory de-orphans the long tail and the footer reaches it.
const dir = fs.readFileSync(path.join(SITE, "site-directory.html"), "utf8");
check("the site directory exists and is substantial",
  (dir.match(/<li><a href="\//g) || []).length > 400);
const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
check("the footer links the directory from every page (checked on /)",
  home.includes('href="/site-directory.html"'));

// Renames became 301s, not dead ends.
for (const [from, to] of [["/my-active-listings", "/current-listings.html"], ["/quick-search", "/search-homes.html"]]) {
  check(`${from} 301s to ${to}`, redirects.includes(`${from} ${to} 301`));
}

console.log(failures === 0 ? "All checks passed" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
