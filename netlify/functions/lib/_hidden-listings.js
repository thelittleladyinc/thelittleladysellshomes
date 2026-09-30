// Listings Christine has confirmed are off the market: never shown on this site.
//
// 2026-09-30 (Signature move, part 1). Lofty's copy of the IRES feed carried
// IRE1043314 -- 212 N 54th, Greeley, expired November 2025 -- as Active and
// listed by her, and every Lofty-powered page showed it as for sale. The
// Signature sync now asks MLS Grid about her listings and hides what the MLS says
// is off the market, but that check needs an MLS Grid token, and this site has
// none (the MLS Grid job stays on Signature until it moves to the shared Seller
// Intelligence copy). This list works without MLS Grid at all:
//
//   HIDE_LISTING_IDS = "IRE1043314"     (MLS numbers, comma- or space-separated,
//                                        any case; unset = nothing hidden)
//   HIDE_LISTING_IDS = "1043314"        (the bare number, as IRES prints it, means
//                                        the same listing: IRE is added)
//
// It is applied wherever her Lofty listings are shown from this site, in both
// backend modes (lib/_backend-mode.js): the listing widgets and current-listings
// page (listings-search), /listing/<id> (listing-page, a 404 "no longer on the
// market" page), the map's listing pins (my-listings-geo) and listing photos
// (listing-photo). A refresh run from this site (refresh-my-listings) also
// leaves them out of the stored copy. Unset, every one of those behaves exactly
// as before.
"use strict";

// Every listing on this site is an IRES listing, whose id is "IRE" + the MLS
// number, so an all-digits entry is that number.
function normalizeId(s) {
  const id = String(s).trim().toUpperCase();
  return /^\d+$/.test(id) ? `IRE${id}` : id;
}

function hiddenListingIds(env) {
  const raw = String(((env || process.env).HIDE_LISTING_IDS) || "");
  return new Set(raw.split(/[\s,;]+/).map(normalizeId).filter(Boolean));
}

function isHiddenListing(id, env) {
  if (id == null || id === "") return false;
  return hiddenListingIds(env).has(String(id).trim().toUpperCase());
}

// Her listings without the hidden ones, in the shape they came in: an array of
// listings, or an object keyed by listing id (the stored catalogue).
function withoutHidden(listings, env) {
  const hidden = hiddenListingIds(env);
  if (!hidden.size || !listings) return listings;
  const keep = (l) => !(l && l.listingId && hidden.has(String(l.listingId).toUpperCase()));
  if (Array.isArray(listings)) return listings.filter(keep);
  if (typeof listings === "object") {
    const out = {};
    for (const [id, l] of Object.entries(listings)) {
      if (hidden.has(String(id).toUpperCase())) continue;
      if (!keep(l)) continue;
      out[id] = l;
    }
    return out;
  }
  return listings;
}

// For a passed-through JSON answer (lib/_sig-proxy.js returns base64 bodies):
// parse it, let `edit` change it, return it as plain JSON. Anything that is not
// JSON goes back untouched.
function editJsonResponse(res, edit) {
  if (!res || res.statusCode !== 200 || res.body == null) return res;
  let data;
  try {
    const text = res.isBase64Encoded ? Buffer.from(res.body, "base64").toString("utf8") : String(res.body);
    data = JSON.parse(text);
  } catch (err) {
    return res;
  }
  const edited = edit(data);
  return { ...res, body: JSON.stringify(edited === undefined ? data : edited), isBase64Encoded: false };
}

module.exports = { hiddenListingIds, isHiddenListing, withoutHidden, editJsonResponse };
