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
check("its canonical is the extensionless legacy URL",
  zoning.includes('rel="canonical" href="https://www.thelittleladysellshomes.com/understanding-open-zoning-in-larimer-county"'));
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
