// Which backend answers this site's data endpoints: the functions in this
// folder, or the same-named functions on the Signature deployment.
//
// 2026-09-30 (Signature move, part 1 -- docs/SIGNATURE-MOVE.md). Christine is
// retiring Signature Property Collection as a separate site. Until now every
// listing, photo, map, walkability, nearby-places, home-search and /status
// request here was passed straight through to signaturepropertycollection.com
// (lib/_sig-proxy.js). Those functions now live in this folder too, under the
// SAME names (the pages, the map and other apps call them by name) -- but
// merging them must change nothing a visitor sees until Christine switches them
// on. So each one keeps passing through to Signature unless BOTH are true:
//
//   1. BACKEND_MODE names it: "local" for every moved function, or a
//      comma-separated list of function names ("listings-search,mapbox-token")
//      to switch some of them. Unset or "proxy" = today's pass-through.
//      It has to be a deliberate switch: this site ALREADY has BLOBS_SITE_ID,
//      BLOBS_TOKEN, LOFTY_API_KEY and GOOGLE_MAPS_API_KEY set for other jobs,
//      so "the settings are there" cannot on its own mean "answer here".
//   2. The function has what it needs here (NEEDS below): the environment
//      variables it reads, listings from Lofty (the only source this site
//      serves -- nothing moved here calls MLS Grid for them), and, for every
//      function that reads the shared "mls-listings" store, a store that really
//      holds her Lofty listing copy (lofty-sync-state.json). That last check is
//      what proves BLOBS_SITE_ID names the Signature project, as the plan needs:
//      pointed at this site's own project, the store would be empty and her
//      listings would vanish, so the function passes through instead.
//
// Anything missing -> the request is passed through exactly as before, and --
// when BACKEND_MODE asked for this function -- the reason is logged once per
// instance (variable NAMES only, never values). Every response says which path
// answered in an X-Backend header: "local" or "proxy".
//
// Netlify reads environment variables at deploy time, so switching (and
// switching back) is: change BACKEND_MODE, then deploy.
"use strict";

const { makeProxy } = require("./_sig-proxy");

const BLOBS = ["BLOBS_SITE_ID", "BLOBS_TOKEN"];
// Written by every Lofty listing refresh (lib/_lofty-listings.js runMineSync),
// which today runs only on the Signature site's schedule.
const SHARED_STATE_KEY = "lofty-sync-state.json";
// A store that proved itself is re-checked every 10 minutes; one that did not,
// every minute, so a corrected BLOBS_SITE_ID takes effect without a long wait.
const STORE_OK_MS = 10 * 60 * 1000;
const STORE_MISS_MS = 60 * 1000;

const LISTING_DATA = { env: [...BLOBS, "IDX_DISPLAY"], lofty: true, sharedStore: true };
const GEOCODERS = ["MAPBOX_PUBLIC_TOKEN", "GOOGLE_MAPS_API_KEY"];

// What each moved function needs before it may answer here. IDX_DISPLAY only has
// to be SET (to whatever Signature has): unset, the copied code would fail closed
// and hide every listing, which is not today's behaviour.
const NEEDS = {
  "listings-search": LISTING_DATA,
  "listing-page": LISTING_DATA,
  "listing-photo": LISTING_DATA,
  "my-listings-geo": { env: [...BLOBS, "IDX_DISPLAY", ...GEOCODERS], lofty: true, sharedStore: true },
  // No secrets: the Lofty search address and counties have the same defaults as
  // on Signature (copy IDX_SEARCH_URL / HOME_SEARCH_COUNTIES if Signature sets them).
  "home-search": {},
  "nearby-places": { env: [...BLOBS, "GOOGLE_MAPS_API_KEY"], sharedStore: true },
  "walkability": { env: [...BLOBS, "GOOGLE_MAPS_API_KEY"], sharedStore: true },
  "local-spots": { env: [...BLOBS, ...GEOCODERS], sharedStore: true },
  "sold-homes-geocode": { env: [...BLOBS, ...GEOCODERS], sharedStore: true },
  "mapbox-token": {
    env: ["MAPBOX_PUBLIC_TOKEN"],
    check: (e) => (/^pk\./.test(String(e.MAPBOX_PUBLIC_TOKEN).trim()) ? null
      : "MAPBOX_PUBLIC_TOKEN is not a public (pk.) token"),
  },
  "site-health": { env: [...BLOBS, "LOFTY_API_KEY"], lofty: true, sharedStore: true },
  "mls-usage": { env: BLOBS, sharedStore: true },
  "refresh-my-listings": { env: [...BLOBS, "LOFTY_API_KEY"], lofty: true, sharedStore: true },
  "area-alerts": { env: BLOBS, lofty: true, sharedStore: true },
};

function isSet(env, name) {
  const v = env[name];
  return v != null && String(v).trim() !== "";
}

// Does BACKEND_MODE ask for this function to answer here?
function modeAsks(name, env) {
  const raw = String(env.BACKEND_MODE == null ? "" : env.BACKEND_MODE).trim().toLowerCase();
  if (!raw || raw === "proxy") return false;
  if (raw === "local") return true;
  return raw.split(",").map((s) => s.trim()).filter(Boolean).includes(name);
}

// Same reading as LISTINGS_SOURCE in lib/_mls-shared.js: anything but "mlsgrid" is Lofty.
function loftySource(env) {
  return String(env.LISTINGS_SOURCE || "lofty").trim().toLowerCase() !== "mlsgrid";
}

// The part of the decision that needs no network: a reason to pass through, or null.
function settingsReason(name, env) {
  const e = env || process.env;
  const spec = NEEDS[name];
  if (!spec) return "not a moved function";
  if (!modeAsks(name, e)) return "BACKEND_MODE does not switch it on";
  const missing = (spec.env || []).filter((n) => !isSet(e, n));
  if (missing.length) return `not set on this site: ${missing.join(", ")}`;
  if (spec.lofty && !loftySource(e)) return "LISTINGS_SOURCE is mlsgrid; this site serves Lofty listings only";
  if (spec.check) {
    const why = spec.check(e);
    if (why) return why;
  }
  return null;
}

let _storeVerdict = null; // { ok, at }

// Does the store BLOBS_SITE_ID / BLOBS_TOKEN open hold her Lofty listing copy?
// One small read, remembered (see STORE_OK_MS). Any failure is a "no".
async function sharedStoreReady(deps) {
  const now = Date.now();
  if (_storeVerdict && now - _storeVerdict.at < (_storeVerdict.ok ? STORE_OK_MS : STORE_MISS_MS)) {
    return _storeVerdict.ok;
  }
  let ok = false;
  try {
    const { getStore } = (deps && deps.blobs) || require("@netlify/blobs");
    const { getBlobStore } = require("./_mls-shared");
    const state = await getBlobStore(getStore).get(SHARED_STATE_KEY, { type: "json" });
    ok = !!(state && typeof state === "object" && state.lastRunAt);
  } catch (err) {
    ok = false;
  }
  _storeVerdict = { ok, at: now };
  return ok;
}

// The whole decision: null = answer here, otherwise why not.
async function passThroughReason(name, env, deps) {
  const why = settingsReason(name, env);
  if (why) return why;
  if (NEEDS[name].sharedStore && !(await sharedStoreReady(deps))) {
    return `the Blobs store BLOBS_SITE_ID names has no ${SHARED_STATE_KEY} (it should be the Signature project's)`;
  }
  return null;
}

const _logged = new Set();
function logOnce(name, why) {
  const key = `${name}|${why}`;
  if (_logged.has(key)) return;
  _logged.add(key);
  console.log(`backend: ${name} passes through to Signature (${why})`);
}

function tagged(res, value) {
  if (!res || typeof res !== "object") return res;
  return { ...res, headers: { ...(res.headers || {}), "X-Backend": value } };
}

// Wraps a moved function. `local` is the copied Signature handler; `opts.proxy`
// replaces the plain pass-through (for endpoints that add parameters or apply the
// hide list); `opts.proxyOptions` go to makeProxy (lib/_sig-proxy.js).
function backendSwitch(name, local, opts) {
  if (!NEEDS[name]) throw new Error(`backendSwitch: ${name} is not in NEEDS`);
  const o = opts || {};
  const proxy = o.proxy || makeProxy(name, o.proxyOptions);
  return async (event, context) => {
    const env = process.env;
    const why = await passThroughReason(name, env);
    if (why) {
      if (modeAsks(name, env)) logOnce(name, why);
      return tagged(await proxy(event, context), "proxy");
    }
    return tagged(await local(event, context), "local");
  };
}

// The request's query as URLSearchParams: Netlify's rawQuery when present (what
// lib/_sig-proxy.js forwards), else the parsed queryStringParameters.
function queryOf(event) {
  if (event && typeof event.rawQuery === "string" && event.rawQuery) return new URLSearchParams(event.rawQuery);
  const q = (event && event.queryStringParameters) || {};
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v != null) params.set(k, String(v));
  return params;
}

// The same event with a different query, in both of the shapes handlers read.
function withQuery(event, params) {
  return { ...(event || {}), rawQuery: params.toString(), queryStringParameters: Object.fromEntries(params) };
}

// For /status: which moved functions would answer here, from settings alone
// (the store check is reported once, separately).
function describeBackends(env) {
  const e = env || process.env;
  return Object.keys(NEEDS).map((name) => {
    const why = settingsReason(name, e);
    return { name, local: !why, why: why || "" };
  });
}

module.exports = {
  NEEDS, BLOBS, SHARED_STATE_KEY,
  modeAsks, loftySource, settingsReason, sharedStoreReady, passThroughReason,
  backendSwitch, describeBackends, queryOf, withQuery,
  _reset: () => { _storeVerdict = null; _logged.clear(); },
};
