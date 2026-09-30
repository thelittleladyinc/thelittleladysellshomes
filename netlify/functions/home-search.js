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
"use strict";
const { makeProxy } = require("./lib/_sig-proxy");
const { homeSearchUrl } = require("./lib/_home-search");
const { backendSwitch, queryOf, withQuery } = require("./lib/_backend-mode");

const proxy = makeProxy("home-search");

// 2026-09-29 (Christine approved: "lets do 1-5"): ?site=thelittleladysellshomes
// makes the Lofty link carry utm_source=thelittleladysellshomes.com -- so a buyer
// who registers on her Lofty site shows up in Lofty with this site as their
// source. A query parameter, not a header: the answers are cached by URL.
const SITE = "thelittleladysellshomes";

function thisSitesQuery(event) {
  const params = queryOf(event);
  if (!params.has("noFloor")) params.set("noFloor", "true");
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

async function proxyHandler(event) {
  return proxy(withQuery(event, thisSitesQuery(event)));
}

exports.localHandler = localHandler;
exports.proxyHandler = proxyHandler;
exports.handler = backendSwitch("home-search", localHandler, { proxy: proxyHandler });
exports.SITE = SITE;
