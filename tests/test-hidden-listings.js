// "Never show" list: listings Christine has confirmed are off the market.
//
// 2026-09-30 (Signature move, part 1). Lofty's copy of the IRES feed carried
// IRE1043314 -- 212 N 54th, Greeley, expired November 2025 -- as Active and hers,
// so her pages showed an expired home for sale. The Signature sync now asks MLS
// Grid about her listings, but that needs an MLS Grid token, and this site has
// none. HIDE_LISTING_IDS (lib/_hidden-listings.js) works without MLS Grid, and
// must hold everywhere her Lofty listings are shown from this site, whichever
// backend answers (lib/_backend-mode.js):
//   1. the list itself: any case, commas or spaces, unset = nothing hidden;
//   2. answered here: widgets and current listings (hidden BEFORE paging, so the
//      page and its count are right), the gallery, /listing/<id> (a 404 "no
//      longer on the market" page), map pins, photos, a refresh from here, /status;
//   3. passed through to Signature: the same, taken out of Signature's answers;
//   4. unset, nothing changes: the pass-through answer is Signature's, untouched.
"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FN_DIR = path.join(ROOT, "netlify", "functions");
const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const NOW = new Date().toISOString();
const PIC = (id) => `https://img.chime.me/image/fs01/mls-listing/20260827/21/original_${id}-cover.jpeg`;
const listing = (id, over) => ({
  listingId: id, address: `${id.slice(-3)} Main St`, city: "Loveland", state: "CO", zip: "80537",
  price: 600000, beds: 3, baths: 2, sqft: 2000, status: "Active", agentName: "Christine Gwinnup",
  photo: PIC(id), photos: [PIC(id)], latitude: 40.39, longitude: -105.07, ...over,
});
const HIDDEN = listing("IRE1043314", { address: "212 N 54th", city: "Greeley", zip: "80634", price: 625000 });
const KEPT = listing("IRE1000004", { price: 900000 });
const KEPT2 = listing("IRE1000005", { price: 500000 });

function storeWith(extra) {
  const data = {
    "lofty-sync-state.json": { lastRunAt: NOW, lastSuccessAt: NOW, lastRunAnswer: "ok" },
    "lofty-mine-listings.json": [HIDDEN, KEPT, KEPT2],
    "lofty-listings.json": { [HIDDEN.listingId]: HIDDEN, [KEPT.listingId]: KEPT, [KEPT2.listingId]: KEPT2 },
    ...(extra || {}),
  };
  return {
    data,
    get: async (k) => (k in data ? JSON.parse(JSON.stringify(data[k])) : null),
    setJSON: async (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); },
    list: async () => ({ blobs: [] }), delete: async () => {},
  };
}
function fresh(store) {
  require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: { getStore: () => store } };
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
  }
}
const load = (name) => require(path.join(FN_DIR, `${name}.js`));
const ev = (q) => ({ rawQuery: new URLSearchParams(q).toString(), queryStringParameters: q, headers: {}, httpMethod: "GET" });
const json = (res) => JSON.parse(res.isBase64Encoded ? Buffer.from(res.body, "base64").toString("utf8") : res.body);

const LOCAL = {
  BACKEND_MODE: "local", BLOBS_SITE_ID: "signature-project-id", BLOBS_TOKEN: "pat", IDX_DISPLAY: "on",
  LOFTY_API_KEY: "lofty", GOOGLE_MAPS_API_KEY: "g", MAPBOX_PUBLIC_TOKEN: "pk.test",
};
function setEnv(vars) {
  for (const n of [...Object.keys(LOCAL), "HIDE_LISTING_IDS", "LISTINGS_SOURCE", "MLSGRID_API_TOKEN"]) delete process.env[n];
  Object.assign(process.env, vars || {});
}

// Signature's side, for the pass-through: records requests, answers from `answer`.
const calls = [];
let answer = () => ({ status: 200, type: "application/json", body: "{}" });
global.fetch = async (url, init) => {
  calls.push(String(url));
  const u = new URL(String(url));
  if (u.host !== "signaturepropertycollection.com") throw new Error(`unexpected request to ${u.host}`);
  const a = answer(u, init);
  return { status: a.status, headers: { get: (h) => (h.toLowerCase() === "content-type" ? a.type : null) },
    arrayBuffer: async () => Buffer.from(a.body) };
};

(async () => {
  console.log("\n1. The list");
  const H = require(path.join(FN_DIR, "lib", "_hidden-listings.js"));
  check("unset: nothing hidden", H.hiddenListingIds({}).size === 0 && !H.isHiddenListing("IRE1043314", {}));
  const env = { HIDE_LISTING_IDS: " ire1043314,IRE2  IRE3;IRE4 " };
  check("any case, commas, spaces or semicolons", ["IRE1043314", "ire2", "IRE3", "IRE4"].every((id) => H.isHiddenListing(id, env)),
    JSON.stringify([...H.hiddenListingIds(env)]));
  check("nothing else", !H.isHiddenListing("IRE10433", env) && !H.isHiddenListing("", env) && !H.isHiddenListing(null, env));
  check("an array of listings loses the hidden ones", H.withoutHidden([HIDDEN, KEPT], env).map((l) => l.listingId).join() === "IRE1000004");
  const byId = H.withoutHidden({ IRE1043314: HIDDEN, IRE1000004: KEPT }, env);
  check("so does a catalogue keyed by id", Object.keys(byId).join() === "IRE1000004");
  check("unset, the same object comes back untouched", H.withoutHidden(byId, {}) === byId);

  console.log("\n2. Answered on this site (BACKEND_MODE=local)");
  setEnv({ ...LOCAL, HIDE_LISTING_IDS: "IRE1043314" });
  let store = storeWith();
  fresh(store);
  let res = await load("listings-search").handler(ev({ mine: "true", top: "12" }));
  let body = json(res);
  check("answered here", res.headers["X-Backend"] === "local" && calls.length === 0);
  check("her listings, without the hidden one", body.listings.map((l) => l.listingId).sort().join() === "IRE1000004,IRE1000005" &&
    body.totalCount === 2, JSON.stringify(body).slice(0, 200));
  // Price-descending, the hidden $625K listing would have been second; the home
  // page spotlight asks for top=1 and must still get one listing.
  res = await load("listings-search").handler(ev({ mine: "true", top: "1", skip: "1" }));
  body = json(res);
  check("hidden before paging: the second page of one is the next real listing", body.listings.length === 1 &&
    body.listings[0].listingId === "IRE1000005" && body.totalCount === 2, JSON.stringify(body.listings.map((l) => l.listingId)));
  body = json(await load("listings-search").handler(ev({ listingId: "IRE1043314" })));
  check("its gallery is not served", body.error === "not_found", JSON.stringify(body));
  body = json(await load("listings-search").handler(ev({ listingId: "IRE1000004" })));
  check("a kept listing's gallery still is", Array.isArray(body.photos) && body.photos.length === 1);

  res = await load("listing-page").handler(ev({ id: "IRE1043314" }));
  check("/listing/IRE1043314 is a 404, not a page for sale", res.statusCode === 404 && /noindex/.test(res.headers["X-Robots-Tag"]), String(res.statusCode));
  check("...saying it is no longer on the market, in this site's shell", /no longer on the market/.test(res.body) &&
    /The Little Lady Sells Homes/.test(res.body) && !/212 N 54th/.test(res.body));
  res = await load("listing-page").handler(ev({ id: "ire1043314" }));
  check("...whatever the case of the link", res.statusCode === 404);
  res = await load("listing-page").handler(ev({ id: "IRE1000004" }));
  check("a kept listing's page still renders", res.statusCode === 200 && /Main St/.test(res.body), String(res.statusCode));

  body = json(await load("my-listings-geo").handler(ev({})));
  check("no map pin for it", body.pins.map((p) => p.listingId).sort().join() === "IRE1000004,IRE1000005" && body.totalCount === 2,
    JSON.stringify(body).slice(0, 200));

  res = await load("listing-photo").handler(ev({ id: "IRE1043314", i: "0" }));
  check("its photo link gets the grey placeholder, not Lofty's photo",
    res.statusCode === 200 && res.headers["X-Photo-Fallback"] === "hidden" && !res.headers.Location, JSON.stringify(res.headers));
  res = await load("listing-photo").handler(ev({ id: "IRE1000004", i: "0" }));
  check("a kept listing's photo still redirects to Lofty", res.statusCode === 302 && /img\.chime\.me/.test(res.headers.Location));

  res = await load("site-health").handler(ev({ format: "json" }));
  body = json(res);
  const row = body.checks.find((c) => /Listings you have hidden/.test(c.name)) || {};
  check("/status names it", /IRE1043314/.test(String(row.detail)) && row.optional === true, row.detail);

  // A refresh started here leaves it out of the stored copy the pages read.
  const loftyCalls = [];
  global.fetch = async (url, init) => {
    const u = new URL(String(url));
    loftyCalls.push(u.host);
    const reply = (j) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => j, text: async () => JSON.stringify(j) });
    if (u.pathname === "/v2.0/listings/search") {
      const rec = (id, street) => ({ mlsListingId: id, mlsOrgId: 1054, listingStatus: "Active", price: 600000, streetAddress: street,
        city: "Loveland", state: "CO", zipCode: "80537", agentName: "Christine Gwinnup", previewPicture: PIC(id) });
      return reply({ listing: [rec("IRE1043314", "212 N 54th"), rec("IRE1000004", "4 Main St")], metadata: { totalCount: 2, totalPage: 1 } });
    }
    if (u.pathname === "/v1.0/listing") return reply({ listIng: [], soldListing: [] });
    throw new Error(`unexpected request to ${u.host}${u.pathname}`);
  };
  store = storeWith({ "lofty-sync-state.json": { lastRunAt: "2026-01-01T00:00:00Z" } });
  fresh(store);
  res = await load("refresh-my-listings").handler({ httpMethod: "POST", rawQuery: "", headers: {} });
  check("a refresh from here runs", res.statusCode === 200 && res.headers["X-Backend"] === "local", res.body);
  check("...and leaves the hidden listing out of the stored copy",
    !store.data["lofty-listings.json"].IRE1043314 && !!store.data["lofty-listings.json"].IRE1000004 &&
    !store.data["lofty-mine-listings.json"].some((l) => l.listingId === "IRE1043314"));
  check("...naming why, for /status", (store.data["lofty-sync-state.json"].hiddenOffMarket || [])
    .some((h) => h.listingId === "IRE1043314" && /HIDE_LISTING_IDS/.test(h.why)));
  check("...without a single MLS Grid request", !loftyCalls.some((h) => /mlsgrid/.test(h)), loftyCalls.join(","));
  global.fetch = async (url, init) => {
    calls.push(String(url));
    const u = new URL(String(url));
    if (u.host !== "signaturepropertycollection.com") throw new Error(`unexpected request to ${u.host}`);
    const a = answer(u, init);
    return { status: a.status, headers: { get: (h) => (h.toLowerCase() === "content-type" ? a.type : null) },
      arrayBuffer: async () => Buffer.from(a.body) };
  };

  console.log("\n3. Passed through to Signature (not switched on)");
  setEnv({ HIDE_LISTING_IDS: "IRE1043314" });
  fresh(storeWith());
  const signatureListings = [HIDDEN, KEPT, KEPT2].sort((a, b) => b.price - a.price)
    .map(({ listingId, price }) => ({ listingId, price }));
  answer = (u) => {
    const p = u.pathname.split("/").pop();
    if (p === "listings-search") {
      const top = parseInt(u.searchParams.get("top"), 10) || 12;
      const skip = parseInt(u.searchParams.get("skip"), 10) || 0;
      return { status: 200, type: "application/json",
        body: JSON.stringify({ listings: signatureListings.slice(skip, skip + top), totalCount: 3, fetchedAt: NOW }) };
    }
    if (p === "my-listings-geo") {
      return { status: 200, type: "application/json",
        body: JSON.stringify({ pins: signatureListings.map((l) => ({ ...l, lat: 40, lng: -105 })), totalCount: 3, pending: false }) };
    }
    return { status: 200, type: "text/html", body: "<html>Signature's page</html>" };
  };
  calls.length = 0;
  res = await load("listings-search").handler(ev({ mine: "true", top: "1", skip: "1" }));
  body = json(res);
  const asked = new URL(calls[0]);
  check("passed through", res.headers["X-Backend"] === "proxy" && calls.length === 1);
  check("asking Signature for her whole set, so the paging can be done here",
    asked.searchParams.get("top") === "24" && asked.searchParams.get("skip") === "0" &&
    asked.searchParams.get("site") === "thelittleladysellshomes" && asked.searchParams.get("mine") === "true", asked.search);
  check("the hidden listing is taken out, then the page is cut: page 2 of 1 is the next real listing",
    body.listings.length === 1 && body.listings[0].listingId === "IRE1000005" && body.totalCount === 2, JSON.stringify(body));
  calls.length = 0;
  body = json(await load("listings-search").handler(ev({ listingId: "IRE1043314" })));
  check("its gallery is not asked for at all", body.error === "not_found" && calls.length === 0);

  calls.length = 0;
  body = json(await load("my-listings-geo").handler(ev({})));
  check("its pin is taken out of Signature's map answer", body.pins.length === 2 &&
    !body.pins.some((p) => p.listingId === "IRE1043314") && body.totalCount === 2, JSON.stringify(body).slice(0, 200));

  calls.length = 0;
  res = await load("listing-page").handler(ev({ id: "IRE1043314" }));
  check("/listing/IRE1043314 is this site's own 404, and Signature is not asked",
    res.statusCode === 404 && /no longer on the market/.test(res.body) && calls.length === 0, `${res.statusCode} / ${calls.length}`);
  res = await load("listing-page").handler(ev({ id: "IRE1000004" }));
  check("a kept listing's page is still Signature's", res.statusCode === 200 &&
    /Signature's page/.test(Buffer.from(res.body, "base64").toString("utf8")));

  calls.length = 0;
  res = await load("listing-photo").handler(ev({ id: "IRE1043314", i: "0" }));
  check("its photo is the grey placeholder, and Signature is not asked", res.headers["X-Photo-Fallback"] === "hidden" && calls.length === 0);

  console.log("\n4. Unset, nothing changes");
  setEnv({});
  fresh(storeWith());
  calls.length = 0;
  res = await load("listings-search").handler(ev({ mine: "true", top: "1" }));
  check("the request is exactly today's", new URL(calls[0]).search === "?mine=true&top=1&site=thelittleladysellshomes", calls[0]);
  check("and Signature's answer comes back untouched (base64, as the pass-through sends it)",
    res.isBase64Encoded === true && json(res).listings[0].listingId === "IRE1000004");
  calls.length = 0;
  res = await load("listing-page").handler(ev({ id: "IRE1043314" }));
  check("/listing/<id> is Signature's answer", calls.length === 1 && res.statusCode === 200);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
