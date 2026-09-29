// Credential-free pass-through to the shared Signature backend -- see
// lib/_sig-proxy.js for why this exists (reserved-path proxy rules never fire).
"use strict";
//
// 2026-09-29: a public search here is answered by the backend with a link to the
// same search on Christine's Lofty site. ?site=thelittleladysellshomes makes that
// link say it came from this site (utm_source=thelittleladysellshomes.com), so a
// buyer who registers there shows up in Lofty with this site as their source.
// A query parameter rather than a header, because those answers are cached by URL.
const proxy = require("./lib/_sig-proxy").makeProxy("listings-search");

exports.handler = async (event) => {
  const params = new URLSearchParams((event && event.rawQuery) || "");
  params.set("site", "thelittleladysellshomes");
  return proxy({ ...(event || {}), rawQuery: params.toString() });
};
