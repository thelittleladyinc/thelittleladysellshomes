#!/usr/bin/env node
//
// Per-town market statistics for the community pages.
//
// WHY THIS EXISTS (2026-08-16, competitive audit). Searching the queries the
// town pages were just re-aimed at -- "moving to Windsor Colorado", "living in
// Loveland Colorado" -- every page that outranks this site leads with numbers:
//
//   "median list price $672,792 ... 47% of active listings reduced ...
//    92 days on market ... median home value $485,976 ... population 76,739"
//
// Those numbers are why they win the snippet, and increasingly why an AI answer
// engine quotes them instead of us. Our town pages had none, on purpose: the
// copy said "deliberately not a number typed into a page -- an average printed
// today is wrong by spring", which is a correct criticism of how THEY do it.
// Every one of those figures is hand-typed into a blog post and rots quietly.
//
// The answer is not to hand-type our own. It is that this site is the only one
// in that search result with a raw MLS Grid feed wired into its own code rather
// than a vendor IDX widget, and sync-listings.js already replicates the live
// IRES dataset into Netlify Blobs every 15 minutes. So we can compute the same
// statistics from real inventory, regenerate them on a schedule, and bake them
// into the HTML where a crawler can actually read them -- which a client-side
// vendor widget structurally cannot do, no matter how good its data is.
//
// This script reads the ALREADY-REPLICATED copy in Blobs rather than querying
// MLS Grid again. That is deliberate: no extra load on the feed, nothing new to
// rate-limit, and it cannot drift from what the site's own search shows.
//
// COMPLIANCE. IDX rules restrict individual listing content -- addresses,
// photos, specific list prices. Aggregate statistics are what the monthly
// market report already publishes under the same feed (see the _README in
// build/data/market_report.json). This script emits ONLY aggregates, and
// deliberately does NOT emit a min or max price: on a small town the highest
// active price IS one identifiable listing's list price wearing a hat. For the
// same reason a town with fewer than MIN_SAMPLE active listings is skipped
// entirely -- a "median" of two listings is not a statistic, it is a price.
//
// USAGE
//   BLOBS_SITE_ID=... BLOBS_TOKEN=... node build/tools/town-market-stats.js
//   node build/tools/town-market-stats.js            (no credentials needed)
//
// TWO SOURCES, ONE DATASET (2026-09-15). The Blobs path above needs a Netlify
// Personal Access Token for the SIGNATURE project, because that is the
// deployment sync-listings.js actually writes to -- this repo has no
// sync-listings.js at all, only the credential-free pass-throughs in
// netlify/functions/lib/_sig-proxy.js. In practice that token is never to hand
// when the numbers go stale, and this file sat 29 days old (2026-08-17) with
// every town price SUPPRESSED on the live site as a direct result: the refresh
// step was gated on a secret nobody had at the moment they needed it.
//
// So when the credentials are absent this reads the SAME replicated copy
// through the site's own public listings-search endpoint, which is itself just
// a reader over that identical blob. Same dataset, same Active-only filter,
// same numbers -- no credential, and still not one extra call to MLS Grid.
// That last point is the whole reason this is safe to run whenever: the thing
// that must never be hammered is the FEED, and neither path touches it.
//
// Writes build/data/town_market.json. build/build.py READS that file and never
// runs this one: the generator stays offline, deterministic and unable to fail
// because a third-party API had a bad afternoon. If the file is missing or has
// gone stale the town pages fall back to their qualitative copy on their own.

const fs = require("fs");
const path = require("path");

const { getBlobStore, BLOB_STORE_NAME, LISTINGS_KEY } = require("../../netlify/functions/lib/_mls-shared.js");

// Below this many active listings in a town we publish nothing. See the
// compliance note above -- this is a privacy/IDX floor, not a cosmetic one.
const MIN_SAMPLE = 5;

const OUT_PATH = path.join(__dirname, "..", "data", "town_market.json");

// The public reader over the same blob. Overridable so this can be pointed at
// a deploy preview, but it defaults to the one deployment that holds the data.
const SEARCH_ORIGIN = process.env.LISTINGS_SEARCH_ORIGIN || "https://signaturepropertycollection.com";
const SEARCH_PATH = "/.netlify/functions/listings-search";

// listings-search.js clamps `top` server-side; asking for 1000 returns 24.
// Hard-coding the real ceiling keeps the page count honest instead of
// silently harvesting a fraction of the dataset and calling it the market.
const PAGE = 24;
const CONCURRENCY = 6;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// THE SHAPE OF THE LISTINGS BLOB IS AN OBJECT KEYED BY listingId, NOT AN ARRAY.
//
// 2026-08-17: the first real run of this script reported "the replicated
// listings blob is empty" and exited 1, while /status simultaneously said
// 26,445 listings stored and the Loveland town page showed 510 active. Both
// were true. This script was the thing that was wrong: it tested
// Array.isArray(raw), then raw.listings, and LISTINGS_KEY is neither.
// sync-listings.js writes `store.setJSON(LISTINGS_KEY, listingsById)` (see
// saveListingsCheckpoint) — an object of { [listingId]: listing }. Both
// branches missed, it computed over an empty array, and then blamed the feed.
//
// listings-search.js has always read this key correctly as a listingsById
// object, and sync-listings.js itself does Object.values() over it. This
// reader was the only consumer that disagreed with the writer.
//
// Pulled out of main() so tests/test-townmarket.js can exercise it against
// every shape without needing Blobs credentials — including the exact object
// form that used to yield zero. A comment is not a mechanism; a test is.
function listingsFromBlob(raw) {
  if (Array.isArray(raw)) return raw;               // tolerated, not the real shape
  if (raw && typeof raw === "object") return Object.values(raw);  // the real shape
  return [];
}

// ---- SOURCE 2: the public reader over that same blob ---------------------
//
// listings-search.js returns {listings, totalCount, fetchedAt} and pages with
// top/skip in a stable descending-price order. noFloor=true is REQUIRED: without
// it matchesQuery() in _mls-shared.js applies LUXURY_PRICE_FLOOR and you would
// compute a "median list price" over only the luxury tail -- a wrong number
// that looks perfectly reasonable, which is the worst kind.
//
// fetchedAt is the blob's own checkpoint timestamp. Every page must carry the
// same one: if the 15-minute sync lands mid-harvest the ordering shifts under
// us and pages silently duplicate or skip listings. Rather than paper over
// that, the harvest restarts. Stale numbers are worse than none, and quietly
// wrong ones are worse than either.
async function fetchPage(city, skip) {
  const qs = new URLSearchParams({ top: String(PAGE), skip: String(skip), noFloor: "true" });
  if (city) qs.set("city", city);
  const url = SEARCH_ORIGIN + SEARCH_PATH + "?" + qs.toString();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.json();
      if (body && body.error) throw new Error(String(body.error));
      return body;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("listings-search failed for skip=" + skip + ": " + (lastErr && lastErr.message));
}

async function fetchAllActiveFromSearch() {
  const head = await fetchPage(null, 0);
  const total = Number(head.totalCount) || 0;
  const checkpoint = head.fetchedAt || null;
  if (!total) return { listings: [], checkpoint };

  const pages = Math.ceil(total / PAGE);
  const rows = new Array(pages);
  rows[0] = head.listings || [];

  console.log(
    "reading " + total + " active listings from " + SEARCH_ORIGIN +
    " (" + pages + " pages, blob checkpoint " + checkpoint + ")"
  );

  let next = 1;
  let drifted = false;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= pages || drifted) return;
      const body = await fetchPage(null, i * PAGE);
      if (body.fetchedAt && checkpoint && body.fetchedAt !== checkpoint) {
        drifted = true;
        return;
      }
      rows[i] = body.listings || [];
      if (i % 100 === 0) console.log("  ... page " + i + "/" + pages);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (drifted) {
    throw new Error(
      "the replicated blob was refreshed mid-harvest (checkpoint moved from " +
      checkpoint + ") — re-run; nothing written"
    );
  }

  const listings = rows.flat().filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const l of listings) {
    const id = l && l.listingId;
    if (!id || seen.has(id)) continue;   // belt and braces against paging drift
    seen.add(id);
    unique.push(l);
  }
  if (unique.length < total * 0.98) {
    throw new Error(
      "harvest returned " + unique.length + " unique listings but the feed says " +
      total + " — too big a gap to compute a median from; nothing written"
    );
  }
  return { listings: unique, checkpoint };
}

async function main() {
  let listings;
  let via;
  let checkpoint = null;

  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    via = "netlify-blobs";
    const { getStore } = require("@netlify/blobs");
    const store = getBlobStore(getStore, BLOB_STORE_NAME);
    const raw = await store.get(LISTINGS_KEY, { type: "json" });

    listings = listingsFromBlob(raw);  // see the note on that function

    if (!listings.length) {
      // Distinguishing these two matters: the first is "the sync has not run",
      // the second is "the sync ran and this reader cannot understand it" —
      // which is the exact failure above, and it must never again be reported
      // as an empty feed.
      if (!raw) {
        console.error("!! No listings blob at " + LISTINGS_KEY + " at all. Has sync-listings.js run?");
      } else {
        console.error("!! The listings blob exists but yielded no records — its shape is not");
        console.error("!! what this script expects (an object keyed by listingId, or an array).");
        console.error("!! Compare against saveListingsCheckpoint() in sync-listings.js.");
      }
      console.error("!! Not writing a file — stale numbers are worse than none.");
      process.exit(1);
    }
  } else {
    via = "listings-search";
    console.log("BLOBS_SITE_ID / BLOBS_TOKEN not set — reading the same replicated listings");
    console.log("through the public listings-search endpoint. No MLS Grid calls either way.");
    const harvested = await fetchAllActiveFromSearch();
    listings = harvested.listings;
    checkpoint = harvested.checkpoint;

    if (!listings.length) {
      console.error("!! listings-search returned no active listings at all. Either the sync");
      console.error("!! has not run or " + SEARCH_ORIGIN + " is not serving the blob.");
      console.error("!! Not writing a file — stale numbers are worse than none.");
      process.exit(1);
    }
  }

  // Active only. "Pending" and "Active Under Contract" are replicated too (see
  // REPLICATED_STATUSES) but a pending home is not what someone asking "what do
  // homes cost in Severance" is shopping from, and mixing them would quietly
  // drag the median toward whatever sold fastest.
  const byCity = new Map();
  for (const l of listings) {
    if (!l || l.status !== "Active") continue;
    const city = (l.city || "").trim();
    if (!city || typeof l.price !== "number" || l.price <= 0) continue;
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(l);
  }

  const towns = {};
  let skipped = 0;
  for (const [city, rows] of byCity) {
    if (rows.length < MIN_SAMPLE) {
      skipped += 1;
      continue;
    }
    const prices = rows.map((r) => r.price);
    const ppsf = rows
      .filter((r) => typeof r.sqft === "number" && r.sqft > 200)
      .map((r) => r.price / r.sqft);
    towns[city] = {
      active: rows.length,
      median_list: median(prices),
      median_price_per_sqft: ppsf.length >= MIN_SAMPLE ? Math.round(median(ppsf)) : null,
    };
  }

  const out = {
    _README: [
      "Per-town ACTIVE-inventory statistics, generated by",
      "build/tools/town-market-stats.js from the IRES MLS data that",
      "sync-listings.js already replicates into Netlify Blobs.",
      "",
      "DO NOT HAND-EDIT. Re-run the script instead — the whole point of this",
      "file is that nobody types a market number into this repo by hand.",
      "",
      "build/build.py reads this file and renders the numbers into the town",
      "pages. If it is missing, or older than the staleness window build.py",
      "enforces, the pages silently fall back to qualitative copy rather than",
      "publishing figures that have gone off. That fallback is the safe state:",
      "no number on the page is always better than a wrong one.",
      "",
      "Aggregates only, and towns under " + MIN_SAMPLE + " active listings are omitted —",
      "see the compliance note at the top of the generating script.",
    ],
    generated_at: new Date().toISOString().slice(0, 10),
    source: "IRES MLS",
    // Which reader over the replicated copy produced this — "netlify-blobs"
    // (direct, needs a token) or "listings-search" (the public reader over the
    // identical blob). Not a data difference; a provenance note, so the next
    // person can tell how it was refreshed without guessing.
    via,
    blob_checkpoint: checkpoint,
    min_sample: MIN_SAMPLE,
    towns,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `wrote ${path.relative(process.cwd(), OUT_PATH)}: ` +
      `${Object.keys(towns).length} towns (${skipped} skipped under ${MIN_SAMPLE} active)`
  );
}

// Only run when invoked as a script. `require`-ing this file (which
// tests/test-townmarket.js does, to check listingsFromBlob against every blob
// shape) must not try to reach Netlify Blobs or write build/data.
if (require.main === module) {
  main().catch((err) => {
    console.error("!! town-market-stats failed:", err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { listingsFromBlob, median, MIN_SAMPLE };
