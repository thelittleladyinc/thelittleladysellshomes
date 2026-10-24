// A listing page is dated by its listing, never by the deploy.
//
// 2026-10-24 (CLAUDE.md "Freshness and lastmod": "a build date is not a content
// modification date"; "MLS/market pages should use the date of the underlying data
// snapshot, not the deploy date"; "Do not put a daily dateModified on the sitewide
// RealEstateAgent entity simply because the generator ran"). /listing/<id> is rendered
// into lib/_listing-page-shell.html (or the collection shell), which build.py writes at
// build time -- so the og:updated_time and last-modified tags and the RealEstateAgent's
// dateModified carried the DEPLOY's date on every listing page. The static pages' guard
// (build/postprocess_audit_fixes*.py) never sees these shells. listing-page.js now dates
// the page by the listing's own modificationTimestamp (Lofty's or the MLS's change time),
// claims no date when there is none (and on the not-found / unavailable pages), and drops
// the agent entity's date. It also stops wrapping the listing schema in a second
// <script> inside the shell's own (it could not be read). Nothing else changes.
"use strict";
process.env.IDX_DISPLAY = "on";
delete process.env.LISTINGS_SOURCE;                 // Lofty, the default
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FN_DIR = path.join(ROOT, "netlify", "functions");
const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const NOW = new Date().toISOString();
const LISTINGS = {
  IRE1061001: { listingId: "IRE1061001", address: "1 Test St", city: "Loveland", state: "CO", zip: "80537", price: 650000, status: "Active",
    beds: 3, baths: 2, sqft: 2000, agentName: "Christine Gwinnup", photos: [], modificationTimestamp: "2026-10-20T15:04:05.000Z" },
  IRE1061003: { listingId: "IRE1061003", address: "3 Test St", city: "Windsor", state: "CO", zip: "80550", price: 1450000, status: "Active",
    beds: 5, baths: 4, sqft: 4800, agentName: "Christine Gwinnup", photos: [], modificationTimestamp: "2026-10-18T09:00:00.000Z" },
  IRE1061002: { listingId: "IRE1061002", address: "2 Test St", city: "Windsor", state: "CO", zip: "80550", price: 600000, status: "Active",
    agentName: "Christine Gwinnup", photos: [] },
};
const store = {
  get: async (k) => ({ "lofty-listings.json": LISTINGS, "lofty-sync-state.json": { lastRunAt: NOW, lastSuccessAt: NOW } })[k] || null,
  setJSON: async () => {}, list: async () => ({ blobs: [] }),
};
require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: { getStore: () => store } };
for (const k of Object.keys(require.cache)) {
  if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
}
process.env.BLOBS_SITE_ID = "s";
process.env.BLOBS_TOKEN = "t";

const meta = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };
const UPDATED = /<meta property="og:updated_time" content="([^"]*)">/;
const MODIFIED = /<meta name="last-modified" content="([^"]*)">/;
const AGENT_DATE = /"@type":\s*"RealEstateAgent"[\s\S]{0,4000}?"dateModified"/;
const jsonLdOk = (html) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  try { return blocks.length > 0 && blocks.every((b) => JSON.parse(b)); } catch (e) { return false; }
};

(async () => {
  for (const name of ["_listing-page-shell.html", "_listing-page-shell-collection.html"]) {
    const shell = fs.readFileSync(path.join(FN_DIR, "lib", name), "utf8");
    check(`${name} carries the build's date (what this fixes)`, !!meta(shell, UPDATED) && !!meta(shell, MODIFIED) && AGENT_DATE.test(shell));
  }
  const lp = require(path.join(FN_DIR, "listing-page.js"));
  for (const [id, label, day] of [["IRE1061001", "a listing", "2026-10-20"], ["IRE1061003", "a Signature-collection listing", "2026-10-18"]]) {
    const res = await lp.localHandler({ queryStringParameters: { id }, path: `/listing/${id}` });
    check(`${label} renders 200`, res.statusCode === 200, String(res.statusCode));
    check(`${label}: og:updated_time and last-modified are the listing's own change date`,
      meta(res.body, UPDATED) === day && meta(res.body, MODIFIED) === day, `${meta(res.body, UPDATED)} / ${meta(res.body, MODIFIED)}`);
    check(`${label}: the agent entity carries no date`, !AGENT_DATE.test(res.body));
    check(`${label}: every JSON-LD block parses, the listing schema wrapped once`, jsonLdOk(res.body) &&
      !/<script type="application\/ld\+json"><script/.test(res.body) && (res.body.match(/"@type":"RealEstateListing"/g) || []).length === 1);
    check(`${label}: the listing schema's datePosted is the record's timestamp`, res.body.includes(`"datePosted":"${LISTINGS[id].modificationTimestamp}"`));
  }
  let res = await lp.localHandler({ queryStringParameters: { id: "IRE1061002" }, path: "/listing/IRE1061002" });
  check("a listing with no change time: 200, and no date claimed at all",
    res.statusCode === 200 && meta(res.body, UPDATED) === null && meta(res.body, MODIFIED) === null && !AGENT_DATE.test(res.body));
  res = await lp.localHandler({ queryStringParameters: { id: "IRE9999999" }, path: "/listing/IRE9999999" });
  check("the not-found page (noindex) claims no date either", res.statusCode === 404 && meta(res.body, UPDATED) === null && meta(res.body, MODIFIED) === null);

  const src = fs.readFileSync(path.join(FN_DIR, "listing-page.js"), "utf8");
  check("every page goes through render(), which dates it (one place)", /return datePage\(out, fields\.DATA_DATE\);/.test(src) &&
    /DATA_DATE: l\.modificationTimestamp \|\| null/.test(src));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("harness error:", e); process.exit(1); });
