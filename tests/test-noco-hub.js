// The Northern Colorado listings hub is a real, linked page (2026-09-29).
//
// /homes-for-sale-in-northern-colorado.html is the page Google associates with
// "homes for sale in northern colorado" / "homes northern colorado" (iHouseWeb-era
// Search Console: ~350 impressions over 480 days at positions ~50-57; the retired
// Bold Collective site showed up for the same searches around position 82). It
// was reachable only from the site directory and its copy didn't answer the
// query. This pins what fixed that:
//   - it links every town's listings page, grouped by county (which is also the
//     first real inbound link those 23 pages have had);
//   - it points buyers to the land, multigenerational and rent-to-own guides
//     rather than competing with them, and sends luxury to Signature;
//   - the home page and the communities hub link to it;
//   - it stays an ordinary indexable .html page in the sitemap.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
const HUB = "homes-for-sale-in-northern-colorado.html";
const hub = read(HUB);

console.log("\n1. The hub answers the search");
check("it is not noindex", !/name="robots"[^>]*noindex/.test(hub));
check("its canonical is its own .html URL",
  hub.includes(`<link rel="canonical" href="https://www.thelittleladysellshomes.com/${HUB}">`));
check("it is in the sitemap",
  read("sitemap.xml").includes(`<loc>https://www.thelittleladysellshomes.com/${HUB}</loc>`));
check("the town-by-town section is there", /Homes for sale by town/.test(hub));
check("the description no longer says \"This is the answer!\"",
  !/This is the answer!/.test((hub.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ""));

console.log("\n2. It links every town's listings page");
const townPages = fs.readdirSync(SITE).filter((f) => /^homes-for-sale-in-[a-z-]+-co\.html$/.test(f));
check(`there are town listings pages to link (${townPages.length})`, townPages.length >= 20);
const missing = townPages.filter((f) => !hub.includes(`href="/${f}"`));
check("the hub links all of them", missing.length === 0, missing.join(", "));
check("Nunn is one of them (the other gap from the Bold Collective data)", hub.includes('href="/homes-for-sale-in-nunn-co.html"'));

console.log("\n3. It sends people to the pages that already own those searches");
for (const [label, href] of [
  ["land guide", "/buying-land-northern-colorado.html"],
  ["ILC / survey guide", "/what-is-an-ilc-and-when-should-you-get-a-full-survey.html"],
  ["raw land cost guide", "/whats-the-real-cost-to-develop-raw-land-in-colorado.html"],
  ["multigenerational page", "/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html"],
  ["rent-to-own page", "/rent-to-own.html"],
  ["communities hub", "/communities/index.html"],
  ["Signature for luxury", "https://signaturepropertycollection.com/"],
]) check(`links the ${label}`, hub.includes(`href="${href}"`));

console.log("\n4. People (and Google) can reach it");
check("the home page links it", read("index.html").includes(`href="/${HUB}"`));
check("the communities hub links it", read("communities/index.html").includes(`href="/${HUB}"`));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
