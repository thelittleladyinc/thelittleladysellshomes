// ---- The Little Lady copy (2026-09-30, Signature move, part 1) --------------
// Copied from the Signature repo (signature-property-collection, including its
// 2026-09-30 audit fixes) under the SAME function name, because this site's pages,
// its map and other apps call it by that name. It answers HERE only once Christine
// switches it on -- lib/_backend-mode.js, docs/SIGNATURE-MOVE.md. Until then every
// request passes through to the same function on the Signature site exactly as
// before (lib/_sig-proxy.js). Below this block is the Signature code; anything
// changed for this site is marked "(Little Lady copy)".
// -----------------------------------------------------------------------------
// Refresh Christine's own listings from Lofty now, instead of waiting for the
// 30-minute schedule (sync-listings.js).
//
// 2026-09-28. Scheduled functions only run on the published site and cannot be
// called by URL, so without this there is no way to see a new listing of hers
// on the site sooner than half an hour -- or to check a deploy preview at all.
//
// POST /.netlify/functions/refresh-my-listings
//   -> { answer, accepted, hers, requests, errors } -- counts and Lofty's own
//      error text only; no key, no listing data.
//
// It is a public URL, so it refuses to run within a minute of the last refresh
// (lib/_lofty-listings.js MIN_MANUAL_GAP_MS): at most two Lofty requests a
// minute, against Lofty's 500-a-minute limit.
"use strict";

const { getStore } = require("@netlify/blobs");
const { getBlobStore, LISTINGS_SOURCE } = require("./lib/_mls-shared");
const { runMineSync } = require("./lib/_lofty-listings");
// 2026-09-30: the same MLS check the scheduled run applies, so a manual refresh
// cannot bring back a listing the MLS says is off the market (see sync-listings.js
// makeOnMarketConfirmer).
// (Little Lady copy) sync-listings.js does not move to this site (the MLS Grid job
// stays on Signature), so the check comes from lib/_mls-onmarket.js: the same
// code, gated the same way, plus HIDE_LISTING_IDS -- and, with no MLS Grid token
// here, it answers from what the Signature sync already stored and never asks
// MLS Grid.
const { makeOnMarketConfirmer, mlsGridMarketDataOn } = require("./lib/_mls-onmarket");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    body: JSON.stringify(body),
  };
}

const localHandler = async (event) => {
  if (!event || event.httpMethod !== "POST") {
    return json(405, { error: "POST to refresh Christine's listings from Lofty now." });
  }
  if (LISTINGS_SOURCE !== "lofty") {
    return json(409, { error: "Listings come from MLS Grid on this site (LISTINGS_SOURCE=mlsgrid)." });
  }
  const apiKey = process.env.LOFTY_API_KEY;
  if (!apiKey) return json(503, { error: "LOFTY_API_KEY is not set in Netlify." });
  try {
    const store = getBlobStore(getStore);
    const confirmOnMarket = mlsGridMarketDataOn()
      ? makeOnMarketConfirmer({ store, token: process.env.MLSGRID_API_TOKEN })
      // (Little Lady copy) Without the gate, still a check -- one that never calls
      // MLS Grid (lookups: false).
      : makeOnMarketConfirmer({ store, token: null, lookups: false });
    const result = await runMineSync({ store, apiKey, manual: true, confirmOnMarket });
    return json(result.skipped ? 429 : 200, result);
  } catch (err) {
    console.error("refresh-my-listings:", err && err.message);
    return json(500, { error: err && err.message });
  }
};

// (Little Lady copy) Answer here only when switched on; otherwise pass through to
// the Signature site exactly as before. See lib/_backend-mode.js.
const { backendSwitch } = require("./lib/_backend-mode");
exports.localHandler = localHandler;
// Passed through, the POST goes to the Signature site's refresh (lib/_sig-proxy.js
// forwardMethod), which refreshes the same stored copy.
exports.handler = backendSwitch("refresh-my-listings", localHandler, { proxyOptions: { forwardMethod: true } });
