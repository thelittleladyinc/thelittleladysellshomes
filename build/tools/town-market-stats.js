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
//   node build/tools/town-market-stats.js            (no credentials needed;
//                                                     .github/workflows/town-market.yml)
//   BLOBS_SITE_ID=... BLOBS_TOKEN=... node build/tools/town-market-stats.js
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
// 2026-09-30 (API audit): BOTH of those paths stopped working with the switch
// to Lofty (2026-09-28), and nothing here noticed.
//   - listings-search on the Signature site no longer reads the MLS Grid copy:
//     it hands searches to her Lofty site and holds only her own listings, so
//     the harvest found nothing to count.
//   - LISTINGS_KEY now names the LOFTY copy (her handful of listings), so the
//     Blobs path would have computed "the market" from her own listings and
//     stamped it with today's date. The whole-market MLS Grid copy lives under
//     MLSGRID_KEYS, which is what the Signature copy of this script reads.
// And no workflow ran this at all, so the figures from 2026-09-15 would have
// switched themselves off at the 21-day limit (~2026-10-06).
//
// The Signature repo already regenerates the same file from the same copy every
// Monday and Thursday (its .github/workflows/town-market.yml), and that repo is
// public. So the credential-free path now takes THAT file -- the same numbers
// from the same dataset, computed by the up-to-date script -- checks it, and
// writes it here with its own generated_at, so the "as of" date on the pages is
// the date the figures were computed, never the date they were copied.
// .github/workflows/town-market.yml here runs it after Signature's run. The
// Blobs path reads the MLS Grid keys, with the same 48-hour freshness guard as
// the Signature script.
//
// Writes build/data/town_market.json. build/build.py READS that file and never
// runs this one: the generator stays offline, deterministic and unable to fail
// because a third-party API had a bad afternoon. If the file is missing or has
// gone stale the town pages fall back to their qualitative copy on their own.

const fs = require("fs");
const path = require("path");

const { getBlobStore, BLOB_STORE_NAME, MLSGRID_KEYS } = require("../../netlify/functions/lib/_mls-shared.js");
// The whole-market MLS Grid copy, not the Lofty keys LISTINGS_KEY now points at.
const { LISTINGS_KEY, SYNC_STATE_KEY } = MLSGRID_KEYS;
// Same guard as the Signature script: the copy replicates every 30 minutes, so
// two days without a successful run means something is broken.
const MAX_COPY_AGE_MS = 48 * 60 * 60 * 1000;

// Below this many active listings in a town we publish nothing. See the
// compliance note above -- this is a privacy/IDX floor, not a cosmetic one.
const MIN_SAMPLE = 5;

const OUT_PATH = path.join(__dirname, "..", "data", "town_market.json");

// The Signature repo's published copy of this file (public repo, master is what
// Netlify deploys there). Overridable for testing.
const PUBLISHED_URL = process.env.TOWN_MARKET_URL ||
  "https://raw.githubusercontent.com/thelittleladyinc/signature-property-collection/master/build/data/town_market.json";
// build.py's TOWN_MARKET_STALE_DAYS: older figures would be suppressed anyway,
// so copying them only to have them hidden is pointless.
const STALE_DAYS = 21;

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

// ---- SOURCE 2: the Signature repo's published file -------------------------
//
// Checked before anything is written: it must parse, carry towns with real
// numbers, and have a generated_at that is a real date, not in the future, not
// past STALE_DAYS, and not older than the file already here (never go backwards).
function validatePublished(pub, current, now) {
  const today = new Date(now || Date.now()).toISOString().slice(0, 10);
  if (!pub || typeof pub !== "object") return "not a JSON object";
  const towns = pub.towns;
  if (!towns || typeof towns !== "object" || !Object.keys(towns).length) return "no towns in it";
  for (const [city, t] of Object.entries(towns)) {
    if (!t || typeof t.active !== "number" || typeof t.median_list !== "number") return `town "${city}" has no figures`;
  }
  const gen = String(pub.generated_at || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gen) || Number.isNaN(Date.parse(gen))) return `generated_at "${gen}" is not a date`;
  if (gen > today) return `generated_at ${gen} is in the future`;
  const ageDays = Math.round((Date.parse(today) - Date.parse(gen)) / 86400000);
  if (ageDays > STALE_DAYS) return `generated_at ${gen} is ${ageDays} days old (limit ${STALE_DAYS})`;
  const mine = current && String(current.generated_at || "");
  if (mine && /^\d{4}-\d{2}-\d{2}$/.test(mine) && gen < mine) return `generated_at ${gen} is older than this repo's ${mine}`;
  return null;
}

async function fetchPublished() {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(PUBLISHED_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("could not read " + PUBLISHED_URL + ": " + (lastErr && lastErr.message));
}

async function main() {
  let listings;
  let via;

  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    via = "netlify-blobs";
    const { getStore } = require("@netlify/blobs");
    const store = getBlobStore(getStore, BLOB_STORE_NAME);
    const syncState = await store.get(SYNC_STATE_KEY, { type: "json" }).catch(() => null);
    const lastOk = syncState && syncState.lastSuccessAt ? Date.parse(syncState.lastSuccessAt) : NaN;
    if (!Number.isFinite(lastOk) || Date.now() - lastOk > MAX_COPY_AGE_MS) {
      console.error("!! The MLS Grid copy has no successful refresh in the last 48 hours " +
        `(last: ${syncState && syncState.lastSuccessAt ? syncState.lastSuccessAt : "never"}). ` +
        "Not writing a file — stale numbers are worse than none.");
      process.exit(1);
    }
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
    console.log("BLOBS_SITE_ID / BLOBS_TOKEN not set — taking the figures the Signature repo");
    console.log("computed from the same MLS Grid copy: " + PUBLISHED_URL);
    const pub = await fetchPublished();
    let current = null;
    try { current = JSON.parse(fs.readFileSync(OUT_PATH, "utf8")); } catch (e) { current = null; }
    const problem = validatePublished(pub, current);
    if (problem) {
      console.error("!! The published file was not used: " + problem + ".");
      console.error("!! Not writing a file — the pages keep their current figures until they expire.");
      process.exit(1);
    }
    const out = { ...pub, via: "signature-published", copied_from: PUBLISHED_URL };
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), OUT_PATH)}: ${Object.keys(pub.towns).length} towns, ` +
      `generated ${pub.generated_at} by the Signature repo`);
    return;
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
    // Which path produced this -- "netlify-blobs" (direct, needs a token) or
    // "signature-published" (the Signature repo's file from the identical copy).
    // Not a data difference; a provenance note, so the next person can tell how
    // it was refreshed without guessing.
    via,
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

module.exports = { listingsFromBlob, median, validatePublished, MIN_SAMPLE, STALE_DAYS };
