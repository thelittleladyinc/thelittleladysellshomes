// ---- The Little Lady copy (2026-09-30, Signature move, part 1) --------------
// Copied from the Signature repo (signature-property-collection, including its
// 2026-09-30 audit fixes) under the SAME function name, because this site's pages,
// its map and other apps call it by that name. It answers HERE only once Christine
// switches it on -- lib/_backend-mode.js, docs/SIGNATURE-MOVE.md. Until then every
// request passes through to the same function on the Signature site exactly as
// before (lib/_sig-proxy.js). Below this block is the Signature code; anything
// changed for this site is marked "(Little Lady copy)".
// -----------------------------------------------------------------------------
// Saved-area listing alerts: "draw an area on the map, get emailed when
// something new lists inside it."
//
// 2026-08-20, from the portal audit Christine approved in full: this is
// Zillow's stickiest map feature, and the honest version of it works today
// without the full-catalogue geocode. A drawn area (or isochrone, or Ask)
// already resolves to the towns inside it -- the same city scope the whole
// site searches by -- so an alert is {email, cities[], optional price
// bounds}, and matching needs no coordinates at all.
//
// POST {email, cities[], label?, minPrice?, maxPrice?} -> saves the alert.
// GET ?unsub=<id> -> deletes it (the link in every email).
// Sending happens in area-alerts-run.js on a schedule, via the same Resend
// account the lead alerts use. CORS wildcard: the TLLSH map posts here
// directly (its _sig-proxy pass-through doesn't forward POST bodies), and an
// alert signup is public-facing by nature -- rate of abuse is bounded by the
// one-email-per-address dedupe below and Resend's own limits.
//
// 2026-09-28: with Lofty as the listing source this site no longer holds every
// listing -- only Christine's own (lib/_lofty-listings.js) -- so it cannot tell
// anyone when a new home lists in their area. A new sign-up is answered with
// where to set that up instead: her Lofty home search for the same towns, where
// "Save Search" sends Lofty's own alerts (the route this site already chose for
// saved searches on 2026-08-15, see submission-created.js). Nothing is stored,
// so nobody is promised an email that will never come. Alerts saved before the
// switch are kept, untouched, and area-alerts-run.js pauses them.
const { getStore } = require("@netlify/blobs");
const { getBlobStore, LISTINGS_SOURCE } = require("./lib/_mls-shared");
const { homeSearchUrl } = require("./lib/_home-search");

const STORE_NAME = "area-alerts";
const MAX_CITIES = 25;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, payload) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
    body: JSON.stringify(payload),
  };
}

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

const localHandler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (event.httpMethod === "POST" && LISTINGS_SOURCE === "lofty") {
      let body;
      try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }
      const cities = (Array.isArray(body.cities) ? body.cities : [])
        .map((c) => String(c || "").trim()).filter(Boolean).slice(0, MAX_CITIES);
      const query = { cities: cities.join(",") };
      if (Number.isFinite(+body.minPrice) && +body.minPrice > 0) query.minPrice = String(+body.minPrice);
      else query.noFloor = "true";
      if (Number.isFinite(+body.maxPrice) && +body.maxPrice > 0) query.maxPrice = String(+body.maxPrice);
      return json(200, {
        ok: false,
        error: "moved",
        message: "New-home alerts are on my home search now: open it, then tap Save Search.",
        searchUrl: homeSearchUrl(query),
      });
    }
    const store = getBlobStore(getStore, STORE_NAME);

    if (event.httpMethod === "GET") {
      const id = (event.queryStringParameters || {}).unsub;
      if (!id) return json(400, { error: "missing unsub id" });
      await store.delete(id).catch(() => {});
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
        body: "<p style=\"font-family:sans-serif;padding:40px;text-align:center\">" +
          "You're unsubscribed from this area alert. — Christine</p>",
      };
    }

    if (event.httpMethod !== "POST") return json(405, { error: "method not allowed" });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad json" }); }
    const email = normEmail(body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "invalid email" });
    const cities = (Array.isArray(body.cities) ? body.cities : [])
      .map((c) => String(c || "").trim()).filter(Boolean).slice(0, MAX_CITIES);
    if (!cities.length) return json(400, { error: "no towns in the area" });

    // One alert per email address: a re-submit replaces the old area rather
    // than stacking a second subscription nobody remembers making.
    const id = "a-" + Buffer.from(email).toString("base64url");
    const record = {
      id, email, cities,
      label: String(body.label || "your area").slice(0, 120),
      minPrice: Number.isFinite(+body.minPrice) && +body.minPrice > 0 ? +body.minPrice : null,
      maxPrice: Number.isFinite(+body.maxPrice) && +body.maxPrice > 0 ? +body.maxPrice : null,
      createdAt: Date.now(),
      // Listing ids already matched at save time are seeded by the runner on
      // its first pass, so the first email only ever contains listings that
      // appeared AFTER the alert was created -- never a dump of the backlog.
      knownIds: null,
    };
    await store.setJSON(id, record);
    return json(200, { ok: true, id, cities: cities.length });
  } catch (err) {
    console.error("area-alerts error:", err);
    return json(500, { error: "exception", message: err && err.message });
  }
};

// (Little Lady copy) Answer here only when switched on; otherwise pass through to
// the Signature site exactly as before. See lib/_backend-mode.js.
const { backendSwitch } = require("./lib/_backend-mode");
exports.localHandler = localHandler;
// Passed through, POSTs (and the CORS preflight) go to the Signature site's
// area-alerts as they are, with its CORS answer.
exports.handler = backendSwitch("area-alerts", localHandler, {
  proxyOptions: {
    forwardMethod: true,
    extraHeaders: ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"],
  },
});
