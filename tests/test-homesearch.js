// Every home search opens Christine's Lofty site (2026-09-28).
//
// She approved it ("lets do it!!!") after we timed her sites against her Lofty
// site from click to data: Lofty was faster, so it does the home search, and her
// own sites keep her own listings and the town pages. This site's data already
// comes through the shared Signature backend (lib/_sig-proxy.js), which now
// answers a public search with the same search on her Lofty site. What THIS site
// adds, and this suite pins:
//   - /search-homes.html (and /search-homes, /search-homes/) hands off: a forced
//     rewrite to home-search.js, which asks the shared backend for the redirect;
//   - this site searches every price, so that request carries noFloor=true unless
//     the link says otherwise (the shared backend defaults to Signature's $950K);
//   - the map offers her Lofty search's Save Search instead of alert emails the
//     backend can no longer send;
//   - no page still credits MLS Grid for listings that no longer come from it.
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

(async () => {
  console.log("\n1. The search page hands off");
  const redirects = fs.readFileSync(path.join(SITE, "_redirects"), "utf8").split("\n");
  const first = (p) => redirects.find((l) => l.split(/\s+/)[0] === p) || "";
  for (const p of ["/search-homes.html", "/search-homes/", "/search-homes"]) {
    check(`${p} is a forced rewrite to home-search (and its first rule)`,
      /^\S+\s+\/\.netlify\/functions\/home-search\s+200!$/.test(first(p)), first(p));
  }
  check("the old trailing-slash 301s to the static page are gone",
    !redirects.some((l) => /^\/search-homes\/?\s+\/search-homes\.html\s+301!?$/.test(l.trim())));

  console.log("\n2. home-search asks the shared backend, at any price");
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return {
      status: 302,
      headers: { get: (h) => ({ location: "https://theboldcollectivehomes.com/listing?condition=x", "cache-control": "public, max-age=300" })[h.toLowerCase()] || null },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  const handler = require(path.join(ROOT, "netlify", "functions", "home-search.js")).handler;
  const res = await handler({ rawQuery: "cities=Loveland&maxPrice=650000&beds=3", headers: {} });
  const asked = new URL(seen[0].url);
  check("it calls the shared backend's home-search",
    asked.origin === "https://signaturepropertycollection.com" && asked.pathname === "/.netlify/functions/home-search", seen[0].url);
  check("with the visitor's filters", asked.searchParams.get("cities") === "Loveland" &&
    asked.searchParams.get("maxPrice") === "650000" && asked.searchParams.get("beds") === "3");
  check("and noFloor=true, because this site searches every price", asked.searchParams.get("noFloor") === "true");
  check("the backend's redirect reaches the visitor unchanged",
    res.statusCode === 302 && res.headers.location === "https://theboldcollectivehomes.com/listing?condition=x", JSON.stringify(res.headers));
  check("it does not follow the redirect itself", seen[0].init && seen[0].init.redirect === "manual");
  seen.length = 0;
  await handler({ rawQuery: "city=Windsor&noFloor=false&minPrice=950000", headers: {} });
  check("a link that says otherwise keeps its own noFloor", new URL(seen[0].url).searchParams.get("noFloor") === "false");

  console.log("\n3. The built pages");
  const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  check("the home page's search form still points at /search-homes.html", /<form class="hero-search" method="GET" action="\/search-homes\.html"/.test(home));
  const mapPages = ["index.html", "explore.html"].filter((f) => fs.existsSync(path.join(SITE, f)));
  for (const f of mapPages) {
    const h = fs.readFileSync(path.join(SITE, f), "utf8");
    if (!/id="spc-explore"/.test(h)) continue;
    check(`${f}: the map is told the home search is Lofty`, /window\.SPC_HOME_SEARCH = 'lofty';/.test(h));
  }
  const jsDir = path.join(SITE, "assets", "js");
  const mapFile = fs.readdirSync(jsDir).find((f) => /^explore-map\.[0-9a-f]+\.js$/.test(f) || f === "explore-map.js");
  const mapJs = mapFile ? fs.readFileSync(path.join(jsDir, mapFile), "utf8") : "";
  check("the map offers Save This Area On My Home Search on Lofty", /Save This Area On My Home Search/.test(mapJs) && /LOFTY_SEARCH/.test(mapJs));
  check("the map shows the backend's moved answer as a link", /out\.error === 'moved'/.test(mapJs));
  const listings = fs.readFileSync(path.join(SITE, "current-listings.html"), "utf8");
  check("the disclaimer no longer names MLS Grid", !/as distributed by MLS Grid/.test(listings) && /Listings courtesy of IRES MLS/.test(listings));
  const blogDir = path.join(SITE, "blog");
  const aPost = fs.readdirSync(blogDir).find((f) => f.endsWith(".html") && f !== "index.html");
  const post = fs.readFileSync(path.join(blogDir, aPost), "utf8");
  check("a blog post's listing spotlight no longer says \"via MLS Grid\"", !/Source: IRES MLS<\/span> via MLS Grid/.test(post));
  const legal = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "data", "legal.json"), "utf8"));
  check("the privacy policy says where listings come from now",
    /IRES MLS, delivered to this Site through Lofty/.test(JSON.stringify(legal)) && !/comes from MLS Grid/.test(JSON.stringify(legal)));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
