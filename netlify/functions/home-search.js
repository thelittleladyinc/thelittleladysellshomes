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
// in _redirects) and this passes the query to the shared Signature backend's
// home-search function, which answers with a 302 to the same search on her Lofty
// site. The address of her Lofty site is set once, on the Signature deployment
// (IDX_SEARCH_URL), so moving it to its new domain touches neither site's code.
//
// This site searches every price, so the search is asked for with noFloor=true
// unless the link already says otherwise -- without it the shared backend
// applies Signature's $950K luxury floor.
"use strict";
const { makeProxy } = require("./lib/_sig-proxy");

const proxy = makeProxy("home-search");

// 2026-09-29 (Christine approved: "lets do 1-5"): ?site=thelittleladysellshomes
// tells the shared backend which site the search came from, so the Lofty link it
// answers with carries utm_source=thelittleladysellshomes.com -- and a buyer who
// registers on her Lofty site shows up in Lofty with this site as their source.
// A query parameter, not a header: the backend's answers are cached by URL.
const SITE = "thelittleladysellshomes";

exports.handler = async (event) => {
  const params = new URLSearchParams((event && event.rawQuery) || "");
  if (!params.has("noFloor")) params.set("noFloor", "true");
  params.set("site", SITE);
  return proxy({ ...(event || {}), rawQuery: params.toString() });
};
exports.SITE = SITE;
