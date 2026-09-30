// ---- The Little Lady copy (2026-09-30, Signature move, part 1) --------------
// Copied from the Signature repo (signature-property-collection, including its
// 2026-09-30 audit fixes) under the SAME function name, because this site's pages,
// its map (explore-map.js cards) and photo URLs already handed out call it by that
// name. It answers HERE only once Christine switches it on -- lib/_backend-mode.js,
// docs/SIGNATURE-MOVE.md. Until then every request passes through to the same
// function on the Signature site exactly as before (lib/_sig-proxy.js).
//
// Only the Lofty half of the Signature function is here. Its MLS Grid half --
// resolving signed MLS Grid media URLs, downloading the bytes, the photo store,
// cooldowns and Cloudinary re-hosting -- stays on Signature: this site answers here
// only while the listings come from Lofty (lib/_backend-mode.js), and nothing moved
// here calls MLS Grid. The code below is the Signature code for that half.
// -----------------------------------------------------------------------------
//
// Serves listing photos from THIS site's domain. On Lofty (2026-09-28) a photo
// link is answered by pointing the browser at Lofty's image server -- a stable
// address that resizes on request -- never with a copy stored from MLS Grid, and
// never by calling MLS Grid. Cards and listing pages already carry the direct
// URL; this path is for old links, shared links and anything else that asks by
// listing id (the map's listing cards, for one).
"use strict";

const { getStore } = require("@netlify/blobs");
const { getBlobStore, MINE_LISTINGS_KEY, LISTINGS_SOURCE } = require("./lib/_mls-shared");
const {
  isLoftyPhoto, sizedPhoto, CARD_PHOTO_WIDTH, LARGE_PHOTO_WIDTH,
} = require("./lib/_lofty-listings");
const { idxGate } = require("./lib/_idx-display");
const { isHiddenListing } = require("./lib/_hidden-listings");
const { backendSwitch, queryOf } = require("./lib/_backend-mode");
const { makeProxy } = require("./lib/_sig-proxy");

const BLOB_STORE_NAME = "mls-listings";

// How long the CDN may serve a FAILURE, by reason. (Signature: the reasons that
// can occur on the Lofty path, with the same values.)
const PLACEHOLDER_TTL = {
  // 2026-09-28: IDX display switched off (lib/_idx-display.js). Short, so photos
  // return within minutes of display being switched back on.
  idx_display_off: 300,
  exception: 300,
  // Not coming back on their own. An hour of not asking.
  no_media: 3600,
  // (Little Lady copy) A listing Christine confirmed is off the market.
  hidden: 3600,
  bad_id: 86400,
  not_configured: 60,
};

function placeholderMaxAge(reason) {
  const ttl = PLACEHOLDER_TTL[reason];
  return typeof ttl === "number" ? ttl : 300;
}

// Matches the onerror fallback the listing cards already use (#eee), so a
// missing photo looks like a deliberate blank rather than a broken image.
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3" width="800" height="600">' +
  '<rect width="4" height="3" fill="#eeeeee"/></svg>';

// The reason travels with the placeholder, and every failure path returns it as
// readable JSON when debug=1 (Signature, 2026-08-17).
function placeholder(reason, debug, extra) {
  if (debug) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        ok: false,
        reason,
        explanation: EXPLANATIONS[reason] || `Unrecognised failure code: ${reason}`,
        ...(extra || {}),
      }, null, 2),
    };
  }
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": `public, max-age=${placeholderMaxAge(reason)}`,
      // Still sent on the image response, for the network tab and for anything
      // that samples these at scale.
      "X-Photo-Fallback": reason,
    },
    body: PLACEHOLDER_SVG,
  };
}

const EXPLANATIONS = {
  idx_display_off: "IDX display is switched off on this site (IDX_DISPLAY is not \"on\"), so no stored " +
    "listing photo is served. See lib/_idx-display.js.",
  bad_id: "The listing id in the URL isn't a valid MLS id.",
  not_configured: "Listings on this site come from Lofty only; LISTINGS_SOURCE is set to something else here.",
  no_media: "This isn't one of Christine's current listings, or Lofty has no photo at that position. " +
    "Every other home's photos are on her Lofty home search.",
  hidden: "Christine confirmed this listing is off the market (HIDE_LISTING_IDS), so its photos aren't served.",
  exception: "The function threw. Check the Netlify function logs for this request.",
};

// On Lofty this site shows Christine's own listings only, and each carries its
// whole gallery -- so a photo link is answered from her small list and nothing
// else. Any other listing's photos are on her Lofty home search.
async function loftyPhotoFor(store, listingId, index) {
  const mine = await store.get(MINE_LISTINGS_KEY, { type: "json" }).catch(() => null);
  const hers = Array.isArray(mine) ? mine.find((x) => x && x.listingId === listingId) : null;
  if (!hers) return null;
  const own = index === 0 ? hers.photo : (Array.isArray(hers.photos) ? hers.photos[index] : null);
  return isLoftyPhoto(own) ? own : null;
}

async function localHandler(event) {
  const params = (event && event.queryStringParameters) || {};
  const debug = params.debug === "1";
  // IDX display kill switch. Photos are images, not listing facts, so only the
  // switch applies here; the 12-hour freshness guard lives on the endpoints that
  // hand out photo URLs (listings-search, listing-page), which stop issuing them.
  const switchGate = idxGate({ skipFreshness: true });
  if (!switchGate.allowed) return placeholder("idx_display_off", debug, {});
  try {
    const listingId = String(params.id || params.listingId || "").trim();
    if (!listingId || !/^[A-Za-z0-9_-]{3,40}$/.test(listingId)) {
      return placeholder("bad_id", debug, { listingId });
    }
    if (isHiddenListing(listingId)) return placeholder("hidden", debug, { listingId });
    if (LISTINGS_SOURCE !== "lofty") return placeholder("not_configured", debug, { listingId });
    const index = Math.max(0, parseInt(params.i, 10) || 0);

    const store = getBlobStore(getStore, BLOB_STORE_NAME);
    const url = await loftyPhotoFor(store, listingId, index);
    const allowed = [300, 600, 800, 1024, 1200];
    const asked = parseInt(params.w, 10);
    const width = allowed.includes(asked) ? asked : (index === 0 ? LARGE_PHOTO_WIDTH : CARD_PHOTO_WIDTH);
    if (debug) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ source: "lofty", listingId, index, width, url: url ? sizedPhoto(url, width) : null }),
      };
    }
    if (!url) return placeholder("no_media", false, { listingId, index, urlCount: 0 });
    return {
      statusCode: 302,
      headers: { Location: sizedPhoto(url, width), "Cache-Control": "public, max-age=86400" },
      body: "",
    };
  } catch (err) {
    console.error("listing-photo error:", err && err.message);
    return placeholder("exception", debug, { error: err && err.message });
  }
}

// Passed through, a listing Christine confirmed is off the market still gets the
// grey placeholder here instead of its photo from Signature.
const passThrough = makeProxy("listing-photo");
async function proxyHandler(event) {
  const q = queryOf(event);
  const id = q.get("id") || q.get("listingId");
  if (isHiddenListing(id)) return placeholder("hidden", q.get("debug") === "1", { listingId: id });
  return passThrough(event);
}

exports.localHandler = localHandler;
exports.proxyHandler = proxyHandler;
exports.handler = backendSwitch("listing-photo", localHandler, { proxy: proxyHandler });
exports.__test = { placeholder, PLACEHOLDER_TTL, EXPLANATIONS };
