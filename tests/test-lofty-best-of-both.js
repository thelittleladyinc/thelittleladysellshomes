// What moved over from the old Lofty pages before they were hidden (2026-09-29).
//
// Christine's Lofty site (now thelittleladyhomesearch.com) carried its own town
// guides and relocation pages that repeated this site. She approved keeping
// Lofty as the home search only and hiding those pages ("go ahead"), after the
// few things they said that this site didn't were brought over:
//   - the Loveland buyer checks (metro-district taxes, water rules, wind, flood
//     and fire history), as one card on the Loveland town page only;
//   - NOCO Unlocked, her video series, named and linked on the relocation page.
// The Lofty wording that broke this site's rules (fair-housing lists, "#1",
// stale market numbers) was deliberately left behind; test-copy.js and the
// fair-housing checks still guard the copy.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

console.log("\n1. The Loveland buyer checks are on the Loveland town page");
const loveland = text(read("communities/larimer/loveland.html"));
check("card heading", /Before You Write An Offer In Loveland/.test(loveland));
for (const [label, re] of [["metro-district taxes", /metro-district taxes/], ["water and irrigation rules", /Water, irrigation and lawn-watering rules/],
  ["wind", /Spring and fall wind/], ["flood and wildfire history", /flood and wildfire history, the 2013 Big Thompson flood/]]) {
  check(`says: ${label}`, re.test(loveland));
}

console.log("\n2. Only the town that has the data gets the card");
const fortCollins = text(read("communities/larimer/fort-collins.html"));
check("Fort Collins has no Loveland checks", !/Before You Write An Offer In/.test(fortCollins));

console.log("\n3. NOCO Unlocked is named and linked on the relocation page");
const relocation = read("relocation.html");
check("links NOCO Unlocked to her YouTube channel",
  /<a href="https:\/\/www\.youtube\.com\/@thelittleladysellshomes"[^>]*>NOCO Unlocked<\/a>/.test(relocation));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
