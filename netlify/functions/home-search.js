// /search-homes.html -> Christine's Lofty home search, with the same filters.
//
// 2026-09-28 (Christine approved it: "lets do it!!!"). We timed her sites against
// her Lofty site from click to data and Lofty was the faster of the two, so every
// home search now opens there, and her own sites keep her own listings (with
// their video tours) and the town pages.
//
// Every "Search Homes" link and form on this site points at /search-homes.html,
// most with filters in the query string (?cities=Loveland&maxPrice=650000&beds=3
// from the home page's search). build.py routes that page here (a forced rewrite
// in _redirects), and this answers with a 302 to the same search on her Lofty
// site (lib/_home-search.js). 302, not 301: where the search lives is a setting
// (IDX_SEARCH_URL) that can change, and a browser that cached a permanent
// redirect would keep going to the old one.
//
// 2026-09-30 (Signature move, part 1, docs/SIGNATURE-MOVE.md): the redirect used
// to be built only by the Signature site's home-search function, which this one
// passed the query to. That code now lives here too (lib/_home-search.js, copied
// from the Signature repo) and answers here once Christine switches it on
// (lib/_backend-mode.js). Until then it passes through to Signature exactly as
// before. Either way the query is the same:
//
// This site searches every price, so the search is asked for with noFloor=true
// unless the link already says otherwise -- without it the search applies
// Signature's $950K luxury floor.
//
// 2026-09-30 (part 2): except The Little Lady's Signature Property Collection's
// own search, /signature-property-collection/search-homes.html, which _redirects
// sends here with ?tier=signature-collection. That one KEEPS the $950K floor and
// is tagged utm_campaign=signature-collection -- also when the answer comes from
// the Signature site (its Location is re-tagged below). And a search whose link
// asks for something the Lofty search cannot filter (horse property, waterfront,
// a named neighbourhood, land) no longer silently opens the wider search: it gets
// a one-screen page that says what will and won't be applied, with the same
// search one tap away and an offer to have Christine pull the real list
// (lib/_home-search.js homeSearchNote).
"use strict";
const { makeProxy } = require("./lib/_sig-proxy");
const {
  homeSearchUrl, homeSearchNote, COLLECTION_TIER, UTM_CAMPAIGN_COLLECTION,
} = require("./lib/_home-search");
const { backendSwitch, queryOf, withQuery } = require("./lib/_backend-mode");

const proxy = makeProxy("home-search");

// 2026-09-29 (Christine approved: "lets do 1-5"): ?site=thelittleladysellshomes
// makes the Lofty link carry utm_source=thelittleladysellshomes.com -- so a buyer
// who registers on her Lofty site shows up in Lofty with this site as their
// source. A query parameter, not a header: the answers are cached by URL.
const SITE = "thelittleladysellshomes";
const COLLECTION_PATH = /^\/signature-property-collection\//;

// The Collection's search, however the rewrite delivered it: the ?tier= the
// _redirects rule adds (queryStringParameters; rawQuery can hold only the
// visitor's own query) or, failing that, the path the visitor asked for.
function tierOf(event) {
  const e = event || {};
  const qs = e.queryStringParameters || {};
  if (String(qs.tier || "").toLowerCase() === COLLECTION_TIER) return COLLECTION_TIER;
  if (String(queryOf(e).get("tier") || "").toLowerCase() === COLLECTION_TIER) return COLLECTION_TIER;
  let p = String(e.path || "");
  if (!COLLECTION_PATH.test(p) && e.rawUrl) {
    try { p = new URL(e.rawUrl).pathname; } catch (err) { /* keep e.path */ }
  }
  return COLLECTION_PATH.test(p) ? COLLECTION_TIER : null;
}

function thisSitesQuery(event) {
  const params = queryOf(event);
  const tier = tierOf(event);
  if (tier) {
    params.set("tier", tier);
  } else if (!params.has("noFloor")) {
    params.set("noFloor", "true");
  }
  params.set("site", SITE);
  return params;
}

// The Signature repo's home-search handler, unchanged but for the query above.
async function localHandler(event) {
  const params = Object.fromEntries(thisSitesQuery(event));
  const location = homeSearchUrl(params);
  return {
    statusCode: 302,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
    body: "",
  };
}

// The Signature site's function does not know the tier; its answer is re-tagged
// here so a Collection search reads as one in Lofty and GA4 either way.
function retag(res, tier) {
  if (!tier || !res || !res.headers) return res;
  const key = Object.keys(res.headers).find((k) => k.toLowerCase() === "location");
  if (!key) return res;
  try {
    const u = new URL(res.headers[key]);
    if (!u.searchParams.has("utm_campaign")) return res;
    u.searchParams.set("utm_campaign", UTM_CAMPAIGN_COLLECTION);
    return { ...res, headers: { ...res.headers, [key]: u.toString() } };
  } catch (e) {
    return res;
  }
}

async function proxyHandler(event) {
  const res = await proxy(withQuery(event, thisSitesQuery(event)));
  return retag(res, tierOf(event));
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// The page shown instead of a silent redirect when the link asked for filters
// the Lofty search can't apply. Self-contained (no site assets), noindex.
function notePage(note, location, tier) {
  const collection = tier === COLLECTION_TIER;
  const accent = collection ? "#8f5560" : "#B30000";
  const title = collection ? "The Little Lady's Signature Property Collection" : "The Little Lady Sells Homes";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>Home Search | ${esc(title)}</title>` +
    "<style>body{margin:0;background:#F8F6F4;color:#141415;font:17px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}" +
    "main{max-width:34rem;margin:0 auto;padding:56px 20px}h1{font-size:1.5rem;line-height:1.25;margin:0 0 14px}" +
    `a.btn{display:inline-block;background:#141415;color:#fff;text-decoration:none;padding:13px 22px;border-radius:3px;font-weight:600;margin:8px 12px 8px 0}` +
    `a.alt{color:${accent};font-weight:600}p.small{font-size:.9rem;color:#4a4a4c}</style></head><body><main>` +
    "<h1>Before You Search</h1>" +
    `<p>${esc(note)}</p>` +
    `<p><a class="btn" href="${esc(location)}" rel="noopener">Continue To The Search &rarr;</a>` +
    '<a class="alt" href="/contact.html">Ask Christine</a></p>' +
    `<p class="small"><a class="alt" href="${collection ? "/signature-property-collection/index.html" : "/"}">${esc(title)}</a></p>` +
    "</main></body></html>";
}

// The hand-off, local or passed through, then the note page when it's needed.
const switched = backendSwitch("home-search", localHandler, { proxy: proxyHandler });

async function handler(event) {
  const res = await switched(event);
  const params = Object.fromEntries(thisSitesQuery(event));
  const note = homeSearchNote(params);
  if (!note || !res || res.statusCode !== 302 || !res.headers) return res;
  const key = Object.keys(res.headers).find((k) => k.toLowerCase() === "location");
  const location = key && String(res.headers[key]);
  if (!location || !/^https?:\/\//i.test(location)) return res;
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
    body: notePage(note, location, tierOf(event)),
  };
}

exports.localHandler = localHandler;
exports.proxyHandler = proxyHandler;
exports.handler = handler;
exports.tierOf = tierOf;
exports.thisSitesQuery = thisSitesQuery;
exports.SITE = SITE;
