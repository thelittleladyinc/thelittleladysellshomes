// Coming Soon listings, and the Maplebrook video match that was removed with
// them. Both come from the same 2026-09-01 request.
//
// THE DIAGNOSIS THIS PINS DOWN. Christine had a listing of her own -- 357 Blue
// Azurite -- that was in IRES and on neither site, and asked whether that was
// because it wasn't active yet or because something wasn't automated. It was
// the first: "Coming Soon" is its own RESO StandardStatus and it appeared in
// none of the status lists in _mls-shared.js, so the sync discarded the record
// and no search mode could return it. The automation was running exactly as
// designed, every 30 minutes.
//
// WHERE THE FIX LIVES, AND WHY THIS SITE STILL TESTS IT. This site holds no MLS
// credentials -- every listing call proxies to signaturepropertycollection.com
// (see lib/_sig-proxy.js), where sync-listings.js and the schedule actually
// run. What this site owns is the DISPLAY half: the badge, the ribbon, and the
// rule that a home nobody can tour yet is never offered a Request A Tour
// button. A drift between the two copies of _mls-shared.js is the specific way
// this could silently break, so that is checked too.
const ROOT = require("path").resolve(__dirname, "..");
const fs = require("fs");
const path = require("path");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const shared = require(`${ROOT}/netlify/functions/lib/_mls-shared.js`);
check("Coming Soon is in the replicated set this site's proxy reads",
  shared.REPLICATED_STATUSES.includes("Coming Soon"),
  shared.REPLICATED_STATUSES.join("|"));
check("sold/closed listings are still never replicated",
  !shared.REPLICATED_STATUSES.some((s) => /closed|sold|expired|withdrawn/i.test(s)),
  shared.REPLICATED_STATUSES.join("|"));

// --- what a visitor actually sees, read off the built pages ----------------
const PAGES = ["site/current-listings.html", "site/search-homes.html"];
for (const rel of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const name = path.basename(rel);
  check(`${name}: the badge says Coming Soon in plain language`,
    /label: 'Coming Soon', cls: 'status-coming-soon'/.test(html));
  check(`${name}: a Coming Soon home never offers Request A Tour`,
    /label: 'Coming Soon', cls: 'status-coming-soon', tourable: false/.test(html));
  check(`${name}: Coming Soon is matched BEFORE the contract/pending branch`,
    html.indexOf("coming soon") < html.indexOf("s.indexOf('contract')"),
    "order swapped — 'Coming Soon' would be mislabelled Under Contract");
  check(`${name}: it gets its own ribbon, not the under-contract one`,
    /ribbon-coming-soon">Coming Soon</.test(html));
}

const css = fs.readFileSync(path.join(ROOT, "build/assets/css/style.css"), "utf8");
const colour = (re) => (css.match(re) || [])[1];
check("its badge colour is not the under-contract colour",
  colour(/\.listing-status-badge\.status-coming-soon \{ background: (#[0-9a-f]{6}); \}/) !==
  colour(/\.listing-status-badge\.status-pending \{ background: (#[0-9a-f]{6}); \}/),
  "sharing a colour with Under Contract is how a glance reads the wrong status");

// --- 945 Maplebrook Dr, removed from the listing-card video match ----------
// Christine, 2026-09-01: "remove maplebrook in windsor... just the current
// listings - remove it there". Scoped deliberately: the town-page videos stay.
const build = fs.readFileSync(path.join(ROOT, "build/build.py"), "utf8");
const listingVideoBlock = build.slice(
  build.indexOf("_LISTING_VIDEO_ENTRIES = ["),
  build.indexOf("LISTING_VIDEOS = {addr:"));
check("945 Maplebrook is gone from the listing-card video match",
  !/maplebrook/i.test(listingVideoBlock.replace(/^\s*#.*$/gm, "")),
  "a listing card for that address would show the old tour instead of MLS photos");
for (const rel of PAGES) {
  check(`${path.basename(rel)}: no longer ships a Maplebrook video mapping`,
    !/maplebrook/i.test(fs.readFileSync(path.join(ROOT, rel), "utf8")));
}
// The other half of the same instruction: her Windsor marketing stays put.
// Removing it would quietly delete real work she asked to keep.
const windsor = path.join(ROOT, "site/communities/weld/windsor.html");
if (fs.existsSync(windsor)) {
  check("her Windsor town-page video is untouched",
    /SAZceZQJrAs/.test(fs.readFileSync(windsor, "utf8")),
    "scoped to the listing cards — the town page keeps her tours");
}

// --- the two sites must agree on the status contract -----------------------
const sibling = path.resolve(ROOT, "..", "signature-property-collection",
  "netlify", "functions", "lib", "_mls-shared.js");
if (fs.existsSync(sibling)) {
  check("this site's copy of _mls-shared.js matches the backend's",
    fs.readFileSync(sibling, "utf8") ===
    fs.readFileSync(path.join(ROOT, "netlify/functions/lib/_mls-shared.js"), "utf8"));
} else {
  console.log("  --   backend checkout not present; skipping drift check");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
