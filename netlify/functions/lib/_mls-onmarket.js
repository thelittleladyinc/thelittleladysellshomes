// "Is this listing of hers really on the market?" -- for the Lofty listing
// refresh (lib/_lofty-listings.js runMineSync, confirmOnMarket hook).
//
// 2026-09-30 (Signature move, part 1, docs/SIGNATURE-MOVE.md). Copied from the
// Signature repo's sync-listings.js (makeOnMarketConfirmer, mlsGridMarketDataOn,
// and the four helpers they use), because the only Lofty refresh that runs on
// this site -- refresh-my-listings.js, by hand, never on a schedule -- writes the
// SAME stored copy the Signature site shows, and must not bring back a listing
// the MLS says is off the market.
//
// NOTHING ELSE of sync-listings.js moves here: no crawl, no photo chores, no
// schedule. The MLS Grid job stays on the Signature site until it moves to the
// shared Seller Intelligence copy. The one MLS Grid request below is gated
// EXACTLY as on Signature -- an MLSGRID_API_TOKEN AND MLSGRID_MARKET_DATA not
// "off" (mlsGridMarketDataOn), then MLS_DISABLED and the quota guard
// (lib/_mls-usage.js checkMlsQuota) -- and this site has no MLSGRID_API_TOKEN.
//
// Two additions for this site, neither of which calls MLS Grid:
//   - HIDE_LISTING_IDS (lib/_hidden-listings.js) answers "off the market" first.
//   - With no token here (lookups: false) the confirmer still reads what the
//     Signature sync already knows -- its MLS Grid copy of her listings and its
//     24-hour verdicts in the shared store -- and answers "unknown" (keep) for
//     anything else. So a refresh started here cannot un-hide a listing the
//     Signature sync hid a few minutes earlier.
//
// The comment below is carried over from sync-listings.js unchanged.
//
// 2026-09-30: "is this listing really on the market?" for runMineSync's
// confirmOnMarket hook (lib/_lofty-listings.js). Lofty's IRES copy carried
// IRE1043314 -- 212 N 54th, Greeley, expired November 2025 -- as Active and
// listed by Christine, so this site showed an expired home as for sale.
//
// The answer comes from the MLS, in the cheapest order:
//   1. the site's own MLS Grid copy of her listings (mine-listings.json, kept
//      by the market-data run below): present there -> on the market, no
//      request spent;
//   2. otherwise one MLS Grid request for that single ListingId, filtered on
//      nothing but the originating system, so an off-market record comes back
//      with its real StandardStatus (or not at all -- MLS Grid drops old ones).
//      That verdict is kept for VERDICT_TTL_MS so a stale Lofty record costs
//      one request a day, not one every half hour;
//   3. a listing Lofty says was listed within NEW_LISTING_GRACE_MS that MLS
//      Grid does not know yet is "unknown", never "off-market": MLS Grid can
//      run minutes behind IRES, and hiding a brand-new listing for a day would
//      be worse than the problem this solves.
// Anything that fails (quota guard, 429, network) is "unknown" -- the listing
// stays up and the reason is logged. Nothing here touches the MLS Grid copy.
//
// Pace and cap, because this is the one place the Lofty path talks to MLS Grid:
// lookups are REQUEST_DELAY_MS apart (the same 1.5 s the market-data crawl
// keeps between calls) and at most MAX_LOOKUPS_PER_RUN a run. If the MLS Grid
// copy were ever empty, ten of her listings would otherwise become ten
// back-to-back requests -- the burst the 2026-08-01 suspension was about. The
// rest are "unknown" this run and get their turn on the next ones (verdicts
// are kept a day, so the copy is rebuilt two a run).
"use strict";

const { BASE_URL, REPLICATED_STATUSES, MLSGRID_KEYS } = require("./_mls-shared");
const { recordMlsCall, checkMlsQuota, bytesFromResponse } = require("./_mls-usage");
const { isHiddenListing } = require("./_hidden-listings");

// The MLS Grid copy's keys, whatever this site shows (same as sync-listings.js).
const { MINE_LISTINGS_KEY } = MLSGRID_KEYS;

// From sync-listings.js, unchanged.
const REQUEST_DELAY_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SUSPENSION_KEY = "mlsgrid-suspension.json";
const SUSPENSION_COOLDOWN_MS = 5 * 60 * 1000; // 5 min, same window Listing-Engine uses
async function markSuspended(store, cooldownMs) {
  await store.setJSON(SUSPENSION_KEY, { suspendedUntil: Date.now() + cooldownMs });
}
const MLS_FETCH_TIMEOUT_MS = 5000;
// MLS Grid v2: "Each request must contain a single OriginatingSystemName specified
// in the filter criteria of the request."
const ORIGINATING_SYSTEM_CLAUSE = "OriginatingSystemName eq 'ires'";
class MlsQuotaError extends Error {}
async function mlsFetch(url, token, store, { full, timeoutMs } = {}) {
  const quota = await checkMlsQuota(store, { full: full === true });
  if (quota.blocked) {
    throw new MlsQuotaError(`quota guard refused the request — ${quota.reason}`);
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs || MLS_FETCH_TIMEOUT_MS),
    });
    await recordMlsCall(store, {
      kind: "api", status: res.status,
      bytes: bytesFromResponse(res),
    });
    return res;
  } catch (err) {
    // A timeout still spent a request. Counting it is the difference between
    // "we were quiet" and "we were failing", which look identical otherwise.
    await recordMlsCall(store, { kind: "api", status: 0, bytes: 0 });
    throw err;
  }
}

const VERDICT_KEY = "lofty-mls-verdicts.json";
const VERDICT_TTL_MS = 24 * 60 * 60 * 1000;
const NEW_LISTING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOOKUPS_PER_RUN = 2;

// `lookups: false` (no token on this site): never asks MLS Grid; answers from the
// hide list, the MLS Grid copy and stored verdicts only. `env` is for tests.
function makeOnMarketConfirmer({ store, token, now, log, sleepImpl, lookups, env }) {
  const say = log || console.log;
  const clock = now || Date.now;
  const pause = sleepImpl || sleep;
  const mayAsk = lookups !== false && !!token;
  let gridMine = null;
  let verdicts = null;
  let asked = 0;
  async function load() {
    if (gridMine === null) {
      const mine = await store.get(MINE_LISTINGS_KEY, { type: "json" }).catch(() => null);
      gridMine = new Set((Array.isArray(mine) ? mine : []).map((l) => l && l.listingId).filter(Boolean));
    }
    if (verdicts === null) {
      const v = await store.get(VERDICT_KEY, { type: "json" }).catch(() => null);
      verdicts = v && typeof v === "object" ? v : {};
    }
  }
  async function askMlsGrid(id) {
    const qs = new URLSearchParams({
      "$filter": `${ORIGINATING_SYSTEM_CLAUSE} and ListingId eq '${id}'`,
      "$select": "ListingId,StandardStatus,MlgCanView",
      "$top": "1",
    });
    const res = await mlsFetch(`${BASE_URL}?${qs.toString()}`, token, store);
    if (res.status === 429) {
      await markSuspended(store, SUSPENSION_COOLDOWN_MS);
      return { onMarket: null, why: "MLS Grid answered 429" };
    }
    if (!res.ok) return { onMarket: null, why: `MLS Grid answered HTTP ${res.status}` };
    const json = await res.json();
    const rec = (json.value || [])[0];
    if (!rec) return { onMarket: false, why: "MLS Grid has no record of it (IRES no longer carries it)", status: "not in the feed" };
    if (rec.ListingId !== id) return { onMarket: null, why: "MLS Grid returned a different listing" };
    const status = rec.StandardStatus || "";
    const onMarket = rec.MlgCanView !== false && REPLICATED_STATUSES.includes(status);
    return { onMarket, status, why: onMarket ? "" : `the MLS has it as ${status || "not viewable"}` };
  }
  return async function confirmOnMarket(listing) {
    const id = listing && listing.listingId;
    if (!id) return { onMarket: null, why: "no listing id" };
    if (isHiddenListing(id, env)) {
      return { onMarket: false, why: "Christine confirmed it is off the market (HIDE_LISTING_IDS)" };
    }
    await load();
    if (gridMine.has(id)) return { onMarket: true, why: "in the site's MLS Grid copy" };
    const cached = verdicts[id];
    if (cached && cached.checkedAt && clock() - Date.parse(cached.checkedAt) < VERDICT_TTL_MS) {
      return { onMarket: cached.onMarket, why: `${cached.why} (checked ${cached.checkedAt})` };
    }
    if (!mayAsk) {
      return { onMarket: null, why: "no MLS Grid token on this site; the Signature site's sync checks it" };
    }
    if (asked >= MAX_LOOKUPS_PER_RUN) {
      const why = `this run's ${MAX_LOOKUPS_PER_RUN} MLS Grid lookups are spent; it is checked on a later run`;
      say(`refresh-my-listings: could not confirm ${id} with the MLS (${why}); keeping it.`);
      return { onMarket: null, why };
    }
    if (asked > 0) await pause(REQUEST_DELAY_MS);
    asked += 1;
    let verdict;
    try {
      verdict = await askMlsGrid(id);
    } catch (err) {
      verdict = { onMarket: null, why: `MLS Grid check failed: ${err && err.message}` };
    }
    if (verdict.onMarket === false && verdict.status === "not in the feed") {
      const listed = listing.listDate ? Date.parse(listing.listDate) : NaN;
      if (Number.isFinite(listed) && clock() - listed < NEW_LISTING_GRACE_MS) {
        verdict = { onMarket: null, why: "MLS Grid does not have it yet and Lofty says it is new" };
      }
    }
    if (verdict.onMarket === null) {
      say(`refresh-my-listings: could not confirm ${id} with the MLS (${verdict.why}); keeping it.`);
      return verdict;
    }
    verdicts[id] = { onMarket: verdict.onMarket, status: verdict.status || "", why: verdict.why, checkedAt: new Date(clock()).toISOString() };
    for (const k of Object.keys(verdicts)) {
      if (clock() - Date.parse(verdicts[k].checkedAt || 0) > 7 * VERDICT_TTL_MS) delete verdicts[k];
    }
    await store.setJSON(VERDICT_KEY, verdicts).catch(() => {});
    return verdict;
  };
}

// The gate, unchanged from sync-listings.js: on whenever there is an MLS Grid
// token, unless MLSGRID_MARKET_DATA=off. MLS_DISABLED still stops the request
// itself (checkMlsQuota above).
function mlsGridMarketDataOn(env) {
  const e = env || process.env;
  return !!e.MLSGRID_API_TOKEN &&
    String(e.MLSGRID_MARKET_DATA == null ? "" : e.MLSGRID_MARKET_DATA).trim().toLowerCase() !== "off";
}

module.exports = {
  makeOnMarketConfirmer, mlsGridMarketDataOn,
  VERDICT_KEY, VERDICT_TTL_MS, NEW_LISTING_GRACE_MS, MAX_LOOKUPS_PER_RUN,
};
