// The shared-backend pass-through layer, the trap it replaced -- and, since the
// Signature move (2026-09-30, docs/SIGNATURE-MOVE.md), the switch between it and
// the same functions answering on this site.
//
// History: the first wiring of this site to the Signature backend was seven
// netlify.toml rules proxying /.netlify/functions/<endpoint> cross-site. They
// deployed "without errors" and never fired once: Netlify reserves paths
// beginning with /.netlify and silently ignores redirect rules that shadow
// them. The wiring became real functions here, each a credential-free
// pass-through to the Signature deployment (lib/_sig-proxy.js).
//
// Now each of those functions also carries the real Signature code, and
// lib/_backend-mode.js decides which one answers. This suite pins:
//   1. every moved endpoint exists under its exact runtime name, loads, and has
//      both halves (handler + localHandler);
//   2. MERGING IS A NO-OP: with no BACKEND_MODE, every one passes through to the
//      same Signature endpoint with the same query as before, and never even
//      opens a Blobs store;
//   3. it answers here only when BACKEND_MODE asks AND its settings are present
//      AND the store BLOBS_SITE_ID names holds her Lofty listing copy -- each
//      missing piece falls back to the pass-through;
//   4. the reserved-path trap stays closed, and the pass-through helper keeps
//      the properties that make it safe;
//   5. no MLS Grid job or schedule moved with it.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FN_DIR = path.join(ROOT, "netlify", "functions");
const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
let failures = 0;
function check(label, ok, why) {
  if (ok) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}${why ? ` — ${why}` : ""}`); }
}

const MOVED = [
  "listings-search", "home-search", "listing-page", "listing-photo",
  "nearby-places", "walkability", "local-spots", "sold-homes-geocode",
  "my-listings-geo", "mapbox-token", "site-health", "mls-usage",
  "refresh-my-listings", "area-alerts",
];
const ENV_NAMES = [
  "BACKEND_MODE", "BLOBS_SITE_ID", "BLOBS_TOKEN", "IDX_DISPLAY", "LOFTY_API_KEY",
  "GOOGLE_MAPS_API_KEY", "MAPBOX_PUBLIC_TOKEN", "LISTINGS_SOURCE", "HIDE_LISTING_IDS",
  "MLSGRID_API_TOKEN",
];
const FULL_ENV = {
  BACKEND_MODE: "local", BLOBS_SITE_ID: "signature-project-id", BLOBS_TOKEN: "pat",
  IDX_DISPLAY: "on", LOFTY_API_KEY: "lofty", GOOGLE_MAPS_API_KEY: "g", MAPBOX_PUBLIC_TOKEN: "pk.test",
};

function setEnv(vars) {
  for (const n of ENV_NAMES) delete process.env[n];
  Object.assign(process.env, vars || {});
}

// A fake Blobs: counts every store opened, holds what `data` says.
let storesOpened = 0;
function fresh(data) {
  const d = { ...(data || {}) };
  const store = {
    get: async (k) => (k in d ? d[k] : null), setJSON: async (k, v) => { d[k] = v; },
    list: async () => ({ blobs: [] }), delete: async () => {},
  };
  require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true,
    exports: { getStore: () => { storesOpened += 1; return store; } } };
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
  }
}
const load = (name) => require(path.join(FN_DIR, `${name}.js`));

// Signature, as seen through fetch: records every call, answers 200 JSON.
const calls = [];
function signatureAnswers(status, headers, body) {
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return {
      status,
      headers: { get: (h) => headers[h.toLowerCase()] || null },
      arrayBuffer: async () => Buffer.from(body),
    };
  };
}
signatureAnswers(200, { "content-type": "application/json" }, JSON.stringify({ from: "signature" }));
const ev = (rawQuery, extra) => ({ rawQuery, queryStringParameters: Object.fromEntries(new URLSearchParams(rawQuery)),
  headers: {}, httpMethod: "GET", ...(extra || {}) });

// What a healthy shared store holds: the Lofty refresh's state, fresh.
const SHARED = {
  "lofty-sync-state.json": { lastRunAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString() },
  "lofty-mine-listings.json": [], "lofty-listings.json": {},
};

(async () => {
  console.log("\n1. Every moved endpoint, under its exact runtime name");
  fresh(SHARED);
  for (const name of MOVED) {
    let mod = {};
    try { mod = load(name); } catch (e) { /* handled below */ }
    check(`${name} loads, with the switch and the copied code`,
      typeof mod.handler === "function" && typeof mod.localHandler === "function");
  }
  const { NEEDS } = require(path.join(FN_DIR, "lib", "_backend-mode.js"));
  check("the switch knows every moved function, and nothing else",
    Object.keys(NEEDS).sort().join(",") === [...MOVED].sort().join(","), Object.keys(NEEDS).join(","));

  console.log("\n2. Merged but not switched on: every request passes through, exactly as before");
  // The settings this site ALREADY has for other jobs must not switch anything on.
  setEnv({ BLOBS_SITE_ID: "x", BLOBS_TOKEN: "y", LOFTY_API_KEY: "k", GOOGLE_MAPS_API_KEY: "g", IDX_DISPLAY: "on" });
  const expectQuery = {
    "listings-search": "mine=true&site=thelittleladysellshomes",
    "home-search": "mine=true&noFloor=true&site=thelittleladysellshomes",
    // Signature's listing-page reads only id and brand; the old CDN rule sent those.
    "listing-page": "brand=tllsh",
  };
  for (const name of MOVED) {
    fresh(SHARED);
    storesOpened = 0;
    calls.length = 0;
    const res = await load(name).handler(ev("mine=true"));
    const u = calls[0] ? new URL(calls[0].url) : null;
    check(`${name}: passed through to Signature's ${name}`,
      !!u && u.origin === "https://signaturepropertycollection.com" && u.pathname === `/.netlify/functions/${name}`,
      calls[0] && calls[0].url);
    check(`${name}: same query as before`, !!u && u.search.slice(1) === (expectQuery[name] || "mine=true"), u && u.search);
    check(`${name}: said so (X-Backend: proxy), and opened no Blobs store`,
      res.headers["X-Backend"] === "proxy" && storesOpened === 0, `${res.headers["X-Backend"]} / ${storesOpened} store(s)`);
  }
  // /listing/<id> reaches the function through the rewrite's ?id=:id, which Netlify
  // puts in queryStringParameters; rawQuery can be only the visitor's own query
  // (a shared link's ?fbclid=, ?utm_...). The id must reach Signature regardless.
  for (const [label, event] of [
    ["a shared link's ?fbclid (rawQuery holds only the visitor's query)",
      { rawQuery: "fbclid=x", queryStringParameters: { id: "IRE1", fbclid: "x" }, headers: {}, httpMethod: "GET" }],
    ["a ?utm_ link (rawQuery holds both)",
      { rawQuery: "id=IRE1&utm_source=fb", queryStringParameters: { id: "IRE1", utm_source: "fb" }, headers: {}, httpMethod: "GET" }],
    ["only the path (/listing/IRE1)",
      { rawQuery: "", queryStringParameters: {}, path: "/listing/IRE1", headers: {}, httpMethod: "GET" }],
  ]) {
    fresh(SHARED);
    calls.length = 0;
    await load("listing-page").handler(event);
    const sent = calls[0] ? new URL(calls[0].url).search : "";
    check(`listing-page, ${label}: Signature is asked for id=IRE1&brand=tllsh`, sent === "?id=IRE1&brand=tllsh", sent);
  }
  // The listing page used to be proxied by the CDN rule, which carried every header.
  fresh(SHARED);
  signatureAnswers(503, { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex",
    "retry-after": "3600", "cache-control": "no-store" }, "<html></html>");
  calls.length = 0;
  const lp = await load("listing-page").handler(ev("id=IRE123"));
  check("listing-page: Signature's status and noindex/Retry-After come back as they did through the CDN rule",
    lp.statusCode === 503 && lp.headers["x-robots-tag"] === "noindex" && lp.headers["retry-after"] === "3600", JSON.stringify(lp.headers));
  signatureAnswers(200, { "content-type": "application/json" }, JSON.stringify({ from: "signature" }));
  // POSTs used to have nowhere to go; now they go to Signature as they are.
  calls.length = 0;
  await load("area-alerts").handler({ rawQuery: "", headers: { "content-type": "application/json" }, httpMethod: "POST",
    body: JSON.stringify({ email: "a@b.co", cities: ["Loveland"] }) });
  check("area-alerts: a POST is passed through as a POST, body intact",
    !!calls[0] && calls[0].init.method === "POST" && JSON.parse(calls[0].init.body).cities[0] === "Loveland");
  calls.length = 0;
  await load("refresh-my-listings").handler({ rawQuery: "", headers: {}, httpMethod: "POST" });
  check("refresh-my-listings: a POST is passed through as a POST", !!calls[0] && calls[0].init.method === "POST");
  calls.length = 0;
  await load("listings-search").handler({ rawQuery: "mine=true", headers: {}, httpMethod: "POST", body: "x" });
  check("the original pass-throughs still only ever GET", !!calls[0] && !calls[0].init.method);

  console.log("\n3. Switched on: it answers here only when everything it needs is here");
  const answersHere = async (name, env, data, query) => {
    setEnv(env);
    fresh(data);
    calls.length = 0;
    // The copied code logs its own misses (a geocode against this fake fetch, a
    // pass-through reason); only the decision matters here.
    const quiet = [console.log, console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    let res;
    try { res = await load(name).handler(ev(query || "mine=true")); } finally { [console.log, console.warn, console.error] = quiet; }
    const signatureCalls = calls.filter((c) => c.url.includes("signaturepropertycollection.com")).length;
    return res.headers["X-Backend"] === "local" && signatureCalls === 0;
  };
  for (const name of MOVED) {
    check(`${name}: BACKEND_MODE=local with its settings -> answers here`, await answersHere(name, FULL_ENV, SHARED));
  }
  check("listings-search: no BACKEND_MODE -> passes through",
    !(await answersHere("listings-search", { ...FULL_ENV, BACKEND_MODE: "" }, SHARED)));
  check("listings-search: BACKEND_MODE=proxy -> passes through",
    !(await answersHere("listings-search", { ...FULL_ENV, BACKEND_MODE: "proxy" }, SHARED)));
  check("a list names the functions to switch: listed -> here",
    await answersHere("mapbox-token", { ...FULL_ENV, BACKEND_MODE: "mapbox-token, listings-search" }, SHARED));
  check("...not listed -> passes through",
    !(await answersHere("nearby-places", { ...FULL_ENV, BACKEND_MODE: "mapbox-token,listings-search" }, SHARED)));
  for (const [name, missing] of [
    ["listings-search", "BLOBS_TOKEN"], ["listing-page", "BLOBS_SITE_ID"], ["listing-page", "IDX_DISPLAY"],
    ["listing-photo", "IDX_DISPLAY"], ["nearby-places", "GOOGLE_MAPS_API_KEY"], ["walkability", "GOOGLE_MAPS_API_KEY"],
    ["local-spots", "MAPBOX_PUBLIC_TOKEN"], ["sold-homes-geocode", "GOOGLE_MAPS_API_KEY"],
    ["my-listings-geo", "MAPBOX_PUBLIC_TOKEN"], ["mapbox-token", "MAPBOX_PUBLIC_TOKEN"],
    ["site-health", "LOFTY_API_KEY"], ["mls-usage", "BLOBS_TOKEN"], ["refresh-my-listings", "LOFTY_API_KEY"],
    ["area-alerts", "BLOBS_SITE_ID"],
  ]) {
    const env = { ...FULL_ENV };
    delete env[missing];
    check(`${name}: without ${missing} -> passes through`, !(await answersHere(name, env, SHARED)));
  }
  check("mapbox-token: a token that is not a public pk. token -> passes through",
    !(await answersHere("mapbox-token", { ...FULL_ENV, MAPBOX_PUBLIC_TOKEN: "sk.secret" }, SHARED)));
  check("listings-search: LISTINGS_SOURCE=mlsgrid -> passes through (this site serves Lofty only)",
    !(await answersHere("listings-search", { ...FULL_ENV, LISTINGS_SOURCE: "mlsgrid" }, SHARED)));
  for (const name of ["listings-search", "listing-page", "my-listings-geo", "site-health", "refresh-my-listings"]) {
    check(`${name}: a store with no Lofty listing copy (BLOBS_SITE_ID = this site's own project) -> passes through`,
      !(await answersHere(name, FULL_ENV, {})));
  }
  check("home-search needs nothing but the switch",
    await answersHere("home-search", { BACKEND_MODE: "local" }, {}));
  {
    // A store that cannot be read at all is a "no", and the request still works.
    setEnv(FULL_ENV);
    require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true,
      exports: { getStore: () => ({ get: async () => { throw new Error("401 Unauthorized"); } }) } };
    for (const k of Object.keys(require.cache)) {
      if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
    }
    calls.length = 0;
    const quiet = console.log;
    console.log = () => {};
    const res = await load("listings-search").handler(ev("mine=true"));
    console.log = quiet;
    check("an unreadable store (bad BLOBS_TOKEN) -> passes through, never a 500",
      res.headers["X-Backend"] === "proxy" && res.statusCode === 200 && calls.length === 1, JSON.stringify(res.headers));
  }
  {
    const bm = require(path.join(FN_DIR, "lib", "_backend-mode.js"));
    const rows = bm.describeBackends({ BACKEND_MODE: "local", MAPBOX_PUBLIC_TOKEN: "pk.x" });
    const row = (n) => rows.find((r) => r.name === n) || {};
    check("/status can say which answer here, naming missing settings (names only)",
      row("mapbox-token").local === true && row("listings-search").local === false &&
      /BLOBS_SITE_ID, BLOBS_TOKEN, IDX_DISPLAY/.test(row("listings-search").why) && !/pk\.x/.test(JSON.stringify(rows)),
      JSON.stringify(rows.slice(0, 3)));
  }
  setEnv({});

  console.log("\n4. The reserved-path trap and the pass-through helper");
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  check("netlify.toml has no redirect rule on the reserved /.netlify path",
    !/from\s*=\s*"\/\.netlify\//.test(toml),
    "Netlify ignores such rules silently — the endpoint they cover will 404 in production");
  const proxy = fs.readFileSync(path.join(FN_DIR, "lib", "_sig-proxy.js"), "utf8");
  check("the pass-through targets the Signature deployment",
    proxy.includes("https://signaturepropertycollection.com/.netlify/functions/"));
  check("it returns base64 bodies so listing photos survive", proxy.includes("isBase64Encoded: true"));
  check("it reads no environment variables at all", !/process\.env/.test(proxy),
    "the pass-through must stay credential-free");
  check("/listing/:id goes to this site's own listing-page function (which passes through until switched on)",
    /from = "\/listing\/:id"\s*\n\s*to = "\/\.netlify\/functions\/listing-page\?id=:id"/.test(toml));
  check("...and no rule still sends it to the Signature domain",
    !/to = "https:\/\/signaturepropertycollection\.com/.test(toml));

  console.log("\n5. No MLS Grid job moved with the functions");
  for (const f of ["sync-listings.js", "photo-backfill-background.js", "area-alerts-run.js"]) {
    check(`no ${f} on this site`, !fs.existsSync(path.join(FN_DIR, f)));
  }
  check("no schedule for sync-listings or area-alerts-run", !/\[functions\."(sync-listings|area-alerts-run)"\]/.test(toml));
  const files = fs.readdirSync(FN_DIR).filter((f) => f.endsWith(".js")).map((f) => path.join(FN_DIR, f))
    .concat(fs.readdirSync(path.join(FN_DIR, "lib")).filter((f) => f.endsWith(".js")).map((f) => path.join(FN_DIR, "lib", f)));
  const callers = files.filter((f) => {
    const code = fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
    return /mlsFetch\(|`\$\{BASE_URL\}|media\.mlsgrid\.com/.test(code);
  }).map((f) => path.relative(FN_DIR, f));
  check("the only code that can request MLS Grid is the gated off-market check",
    callers.join(",") === "lib/_mls-onmarket.js", callers.join(", "));
  check("no lib/_media.js (the MLS Grid photo resolver stays on Signature)",
    !fs.existsSync(path.join(FN_DIR, "lib", "_media.js")));

  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
