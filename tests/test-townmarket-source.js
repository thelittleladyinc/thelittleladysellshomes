// The town market figures keep refreshing, from the right data.
//
// 2026-09-30 (API audit). build/data/town_market.json was last refreshed by hand
// on 2026-09-15 and build.py hides figures older than 21 days, so every town
// page's numbers would have switched off around 2026-10-06. Worse, this repo's
// copy of the script could no longer read the market after the switch to Lofty:
// its Blobs path read the Lofty keys (her own handful of listings) and its public
// path read a search endpoint that no longer holds the market. It now takes the
// file the Signature repo regenerates from the MLS Grid copy twice a week, and
// .github/workflows/town-market.yml runs it on a schedule.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const tool = require(path.join(ROOT, "build", "tools", "town-market-stats.js"));
const src = fs.readFileSync(path.join(ROOT, "build", "tools", "town-market-stats.js"), "utf8");
const NOW = Date.parse("2026-09-30T12:00:00Z");
const good = { generated_at: "2026-09-28", source: "IRES MLS", towns: { Loveland: { active: 300, median_list: 650000, median_price_per_sqft: 280 } } };

console.log("\n1. What the published file must look like before it is used");
check("a current file is accepted", tool.validatePublished(good, { generated_at: "2026-09-15" }, NOW) === null);
check("the same date as ours is accepted (a no-op)", tool.validatePublished(good, { generated_at: "2026-09-28" }, NOW) === null);
check("an older file than ours is refused", /older than/.test(tool.validatePublished(good, { generated_at: "2026-09-29" }, NOW) || ""));
check("a file past the 21-day limit is refused", /days old/.test(tool.validatePublished({ ...good, generated_at: "2026-09-01" }, null, NOW) || ""));
check("a file exactly 21 calendar days old is still accepted", tool.validatePublished({ ...good, generated_at: "2026-09-09" }, null, NOW) === null);
check("a file 22 calendar days old is refused", /days old/.test(tool.validatePublished({ ...good, generated_at: "2026-09-08" }, null, NOW) || ""));
check("a future date is refused", /future/.test(tool.validatePublished({ ...good, generated_at: "2026-10-09" }, null, NOW) || ""));
check("no towns is refused", /no towns/.test(tool.validatePublished({ ...good, towns: {} }, null, NOW) || ""));
check("a town without figures is refused", /no figures/.test(tool.validatePublished({ ...good, towns: { X: { active: 3 } } }, null, NOW) || ""));
check("a missing date is refused", /not a date/.test(tool.validatePublished({ ...good, generated_at: undefined }, null, NOW) || ""));
check("the limit matches build.py's", tool.STALE_DAYS === 21 &&
  /TOWN_MARKET_STALE_DAYS = 21\b/.test(fs.readFileSync(path.join(ROOT, "build", "build.py"), "utf8")));

console.log("\n2. Where the numbers come from");
check("the Blobs path reads the MLS Grid whole-market copy, not the Lofty keys",
  /const \{ LISTINGS_KEY, SYNC_STATE_KEY \} = MLSGRID_KEYS;/.test(src) && !/LISTINGS_KEY \} = require\(/.test(src));
check("and refuses a copy with no successful refresh in 48 hours", /MAX_COPY_AGE_MS = 48 \* 60 \* 60 \* 1000/.test(src));
check("the credential-free path reads the Signature repo's published file",
  /signature-property-collection\/master\/build\/data\/town_market\.json/.test(src));
check("and no longer harvests the listings-search endpoint", !/listings-search\?|SEARCH_PATH/.test(src));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "build", "data", "town_market.json"), "utf8"));
// "hub" is the opt-in source (TOWN_STATS_SOURCE=hub, docs/HUB-TOWN-STATS.md): once
// it is switched on, the file it commits says so.
check("the committed figures say where they came from", ["signature-published", "netlify-blobs", "hub"].includes(data.via), data.via);

console.log("\n3. Something actually runs it");
const wfPath = path.join(ROOT, ".github", "workflows", "town-market.yml");
const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, "utf8") : "";
check("a scheduled workflow runs the script", /schedule:\s*\n\s*- cron: "[^"]+"/.test(wf) && /node build\/tools\/town-market-stats\.js/.test(wf));
check("it runs the regression suites before committing", /bash tests\/run-all\.sh/.test(wf));
check("it commits only the data file, to main", /git add build\/data\/town_market\.json/.test(wf) && /HEAD:main/.test(wf));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
process.exit(failures ? 1 : 0);
