// Shared-backend pass-through (2026-08-19, go-live verification fix).
//
// The netlify.toml proxy rules for /.netlify/functions/* NEVER FIRED on the
// published deploy: Netlify reserves paths beginning with /.netlify and
// ignores redirect rules that try to shadow them. Every data call the pages
// make -- live search, listing photos, walkability, local spots, the sold map
// -- 404ed on the live site while passing every static check, because the
// rules are valid TOML that the platform silently declines to apply.
//
// So the endpoints exist here as real functions with the exact names the
// front end (and the photo URLs embedded in listings-search responses) always
// used -- each one a credential-free pass-through to the same endpoint on the
// Signature deployment. This preserves the one-pacer rule exactly as the
// proxy rules intended: NO MLS credentials live on this site, every MLS-
// touching request still funnels through the single pacer and photo cache on
// signaturepropertycollection.com. If MLS Grid ever grants this brand its own
// key, replace these with real local functions -- never by adding creds to
// this site's env alongside these, which would create the second
// uncoordinated pacer that caused suspension #3.
//
// Responses are returned base64-encoded (photos are binary; JSON survives the
// round trip untouched), and the backend's Cache-Control is forwarded so
// Netlify's edge caches photos on this domain too instead of re-invoking.
"use strict";

const BACKEND = "https://signaturepropertycollection.com/.netlify/functions/";

// Response headers worth forwarding; everything else (hop-by-hop headers,
// content-encoding already undone by fetch) is dropped.
const FORWARD = ["content-type", "cache-control", "etag", "last-modified", "location"];

function makeProxy(name) {
  return async (event) => {
    const qs = (event && event.rawQuery) || "";
    const url = BACKEND + name + (qs ? "?" + qs : "");
    let res;
    try {
      res = await fetch(url, {
        headers: {
          accept: (event && event.headers && event.headers.accept) || "*/*",
          // The backend's logs should show who the traffic really serves.
          "x-forwarded-host": "thelittleladysellshomes.com",
        },
        redirect: "manual",
      });
    } catch (err) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ error: "shared backend unreachable", endpoint: name }),
      };
    }
    const headers = {};
    for (const h of FORWARD) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      headers,
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  };
}

module.exports = { makeProxy, BACKEND };
