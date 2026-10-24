// "Is her listing really on the market?" through the Seller Intelligence hub -- MLS_SOURCE=hub.
//
// 2026-10-24 (MLS reads through the hub, "nothing lost"). This site never had an MLS Grid
// token; its one MLS question is the on-market check a refresh started here runs
// (lib/_mls-onmarket.js, used by refresh-my-listings.js), which answered from the
// Signature site's stored copy and verdicts and otherwise "unknown". With MLS_SOURCE=hub
// it asks the hub's copy for a listing that store does not settle -- exactly the Signature
// site's own hub-mode check, through the same shared lib/_mls-hub.js -- and still never
// MLS Grid.
//
// Pinned here: the switch (only exactly "hub"); the hub question and its answers (on the
// market, off, a withheld stub, no record, the new-listing grace, and the Signature hub
// run's memory of her removed listings); every hub failure is "unknown" and keeps the
// listing; the order (hide list, then the copy, then stored verdicts, then the hub); the
// two-lookup cap; MLSGRID_MARKET_DATA=off asks no one; zero MLS Grid requests even with a
// token present; the refresh end to end; /status naming the hub; and lib/_mls-hub.js
// byte-identical to the Signature site's copy. No network: every host is a fake.
"use strict";
process.env.LISTINGS_SOURCE = "lofty";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FN_DIR = `${ROOT}/netlify/functions`;
const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const HUB_URL = "https://hub.test/functions/v1/hub-api";
const HUB_KEY = "hub_" + "cd".repeat(32);
const HUB_ENV = { MLS_SOURCE: "hub", HUB_API_URL: HUB_URL, HUB_API_KEY: HUB_KEY };
const DAY = 24 * 3600e3;

function makeStore(initial) {
  const data = new Map(Object.entries(initial || {}).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  return {
    data,
    get: async (k) => (data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null),
    setJSON: async (k, v) => { data.set(k, JSON.parse(JSON.stringify(v))); },
    set: async (k, v) => { data.set(k, v); },
    delete: async (k) => { data.delete(k); },
    list: async (opts) => {
      const prefix = (opts && opts.prefix) || "";
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
function reply(status, json) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json),
    json: async () => json, headers: { get: () => "application/json" } };
}
const COPY = () => ({ ready: true, reason: "ok", last_success_at: new Date(Date.now() - 5 * 60e3).toISOString(), age_hours: 0.1, max_age_hours: 48 });
const norm = (v) => String(v || "").toUpperCase().replace(/^IRE/, "");

// The hub answers POST /v1/mls/search {listing_ids} from world.hub (rows in MLS Grid's field names);
// Lofty answers "my" from world.mine; MLS Grid is counted and must never be reached.
function fakeFeeds(world) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(String(url));
    calls.push({ host: u.host, path: u.pathname, init: init || {} });
    if (u.host.includes("mlsgrid")) { world.gridCalls = (world.gridCalls || 0) + 1; return reply(200, { value: [] }); }
    if (u.host === "hub.test") {
      world.hubCalls = (world.hubCalls || 0) + 1;
      world.hubBodies = (world.hubBodies || []).concat(init && init.body ? JSON.parse(init.body) : null);
      if (init.headers["x-hub-key"] !== HUB_KEY) return reply(401, { error: "unknown key" });
      if (init.redirect !== "error") return reply(500, { error: "redirects must be refused" });
      if (world.hubFail === "down") throw new Error("connect ECONNREFUSED");
      if (world.hubFail === "not_ready") return reply(503, { status: "not_ready", copy: { ready: false, reason: "catching_up" } });
      if (world.hubFail === "scope") return reply(403, { error: "this key may not use mls:read" });
      if (world.hubFail === "off") return reply(503, { error: "MLS reads are switched off (flag mls_reads_enabled)" });
      if (world.hubFail === "html") return { status: 200, text: async () => "<html>gateway</html>" };
      if (u.pathname.endsWith("/v1/mls/search") && init.method === "POST") {
        const body = JSON.parse(init.body);
        const rows = (world.hub || []).filter((r) => (body.listing_ids || []).some((id) => norm(id) === norm(r.ListingId)));
        return reply(200, { status: "ok", copy: COPY(), rows, next: null });
      }
      return reply(404, { error: "no such route" });
    }
    if (u.pathname === "/v2.0/listings/search") {
      const body = JSON.parse(init.body);
      const pool = world.mine || [];
      const items = pool.slice((body.pageNum - 1) * body.pageSize, body.pageNum * body.pageSize);
      return reply(200, { listing: items, metadata: { totalCount: pool.length, totalPage: 1, pageNum: body.pageNum, pageSize: body.pageSize } });
    }
    if (u.pathname === "/v1.0/listing") return reply(200, { listIng: [], soldListing: [] });
    if (u.host === "img.chime.me") return { ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new ArrayBuffer(30000) };
    return reply(404, {});
  };
  f.calls = calls;
  return f;
}
function freshModules(store, fetchImpl) {
  require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: { getStore: () => store } };
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
  }
  global.fetch = fetchImpl;
}
const SETTINGS = ["MLS_SOURCE", "HUB_API_URL", "HUB_API_KEY", "MLSGRID_API_TOKEN", "MLSGRID_MARKET_DATA", "MLS_DISABLED", "HIDE_LISTING_IDS"];
function setEnv(vars) {
  for (const k of SETTINGS) delete process.env[k];
  Object.assign(process.env, vars || {});
}
const row = (n, over) => ({ ListingKey: `K${n}`, ListingId: `IRE${1000000 + n}`, StandardStatus: "Active", MlgCanView: true,
  ModificationTimestamp: new Date().toISOString(), ListAgentFullName: "Christine Gwinnup", ...over });

(async () => {
  console.log("\n1. One copy of lib/_mls-hub.js, and the switch");
  const sib = path.join(ROOT, "..", "signature-property-collection", "netlify", "functions", "lib", "_mls-hub.js");
  if (fs.existsSync(sib)) {
    check("lib/_mls-hub.js is byte-identical to signature-property-collection's copy",
      fs.readFileSync(sib, "utf8") === fs.readFileSync(`${FN_DIR}/lib/_mls-hub.js`, "utf8"));
  } else {
    console.log("  --   signature-property-collection checkout not present; skipping the _mls-hub.js drift check");
  }
  setEnv({});
  freshModules(makeStore({}), fakeFeeds({}));
  const M = require(`${FN_DIR}/lib/_mls-onmarket.js`);
  check("no token, no hub: the gate is off (as before)", M.mlsGridMarketDataOn({}) === false);
  check("MLS_SOURCE=hub: on without a token", M.mlsGridMarketDataOn({ MLS_SOURCE: "hub" }) === true &&
    M.mlsGridMarketDataOn({ MLS_SOURCE: " hub " }) === true);
  check("MLS_SOURCE=hub with MLSGRID_MARKET_DATA=off: off", M.mlsGridMarketDataOn({ MLS_SOURCE: "hub", MLSGRID_MARKET_DATA: "off" }) === false);
  check("\"Hub\" or \"on\" is not hub", M.mlsGridMarketDataOn({ MLS_SOURCE: "Hub" }) === false && M.mlsGridMarketDataOn({ MLS_SOURCE: "on" }) === false);
  check("a token still opens the MLS Grid gate as before", M.mlsGridMarketDataOn({ MLSGRID_API_TOKEN: "x" }) === true);

  console.log("\n2. The hub's answers, the same verdicts the Signature site's hub-mode check gives");
  const newDay = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
  const world = {
    hub: [
      row(1), row(2, { StandardStatus: "Pending" }), row(3, { StandardStatus: "Closed" }), row(4, { StandardStatus: "Coming Soon" }),
      { ListingKey: "K5", ListingId: "IRE1000005", ModificationTimestamp: new Date().toISOString(), MlgCanView: false, _hub: { withheld: true } },
      row(6, { StandardStatus: "Active Under Contract" }),
    ],
  };
  const cases = [
    ["IRE1000001", "2025-01-01", true, "Active"],
    ["IRE1000002", "2025-01-01", true, "Pending"],
    ["IRE1000006", "2025-01-01", true, "Active Under Contract"],
    ["IRE1000004", "2025-01-01", true, "Coming Soon"],
    ["IRE1000003", "2025-01-01", false, "Closed"],
    ["IRE1000005", "2025-01-01", false, "a withheld stub (not viewable)"],
    ["IRE1000098", "2025-01-01", false, "no record, listed long ago"],
    ["IRE1000097", newDay, null, "no record, listed two days ago (the grace rule)"],
  ];
  for (const [id, listDate, want, label] of cases) {
    setEnv({ ...HUB_ENV, MLSGRID_API_TOKEN: "grid-test-token" });
    const store = makeStore({});
    world.gridCalls = 0;
    freshModules(store, fakeFeeds(world));
    const c = require(`${FN_DIR}/lib/_mls-onmarket.js`).makeOnMarketConfirmer({ store, token: process.env.MLSGRID_API_TOKEN, log: () => {}, sleepImpl: async () => {} });
    const v = await c({ listingId: id, listDate });
    check(`${label}: ${want}`, v.onMarket === want, JSON.stringify(v));
    check(`${label}: asked the hub, never MLS Grid (a token is set and ignored)`, world.gridCalls === 0 &&
      JSON.stringify(world.hubBodies[world.hubBodies.length - 1]) === JSON.stringify({ listing_ids: [id], limit: 1 }));
    if (want !== null) {
      const saved = store.data.get("lofty-mls-verdicts.json") || {};
      check(`${label}: the verdict is kept a day, as before`, saved[id] && saved[id].onMarket === want, JSON.stringify(saved));
    }
  }
  {
    // The Signature site's hub run remembered this listing of hers when the hub removed it.
    setEnv(HUB_ENV);
    const store = makeStore({ "hub-removed-mine.json": { IRE1000097: { at: new Date(Date.now() - DAY).toISOString(), status: "removed from the MLS feed (mlg_can_view_false)" } } });
    freshModules(store, fakeFeeds(world));
    const c = require(`${FN_DIR}/lib/_mls-onmarket.js`).makeOnMarketConfirmer({ store, log: () => {}, sleepImpl: async () => {} });
    const v = await c({ listingId: "IRE1000097", listDate: newDay });
    check("no record, listed two days ago, but the hub removed it: off the market (MLS Grid's answer)", v.onMarket === false &&
      /the hub removed it/.test(v.why), JSON.stringify(v));
  }

  console.log("\n3. Every hub failure is 'unknown': the listing is kept and nothing is saved");
  for (const [label, env, fail] of [["not configured", { MLS_SOURCE: "hub" }, null], ["unreachable", HUB_ENV, "down"],
    ["not ready", HUB_ENV, "not_ready"], ["the key has no mls:read scope (403)", HUB_ENV, "scope"], ["reads switched off", HUB_ENV, "off"],
    ["not JSON", HUB_ENV, "html"]]) {
    setEnv(env);
    const store = makeStore({});
    world.hubFail = fail;
    const logs = [];
    freshModules(store, fakeFeeds(world));
    const c = require(`${FN_DIR}/lib/_mls-onmarket.js`).makeOnMarketConfirmer({ store, log: (m) => logs.push(m), sleepImpl: async () => {} });
    const v = await c({ listingId: "IRE1000003", listDate: "2025-01-01" });
    world.hubFail = null;
    check(`${label}: unknown, kept, nothing saved, said why`, v.onMarket === null && !store.data.has("lofty-mls-verdicts.json") &&
      logs.some((m) => /could not confirm IRE1000003/.test(m)) && !logs.join(" ").includes(HUB_KEY), JSON.stringify(v));
  }

  console.log("\n4. The order and the limits are unchanged");
  {
    setEnv({ ...HUB_ENV, HIDE_LISTING_IDS: "IRE1000001" });
    const store = makeStore({
      "mine-listings.json": [{ listingId: "IRE1000002" }],
      "lofty-mls-verdicts.json": { IRE1000003: { onMarket: false, status: "Closed", why: "the MLS has it as Closed", checkedAt: new Date().toISOString() } },
    });
    world.hubCalls = 0;
    freshModules(store, fakeFeeds(world));
    const c = require(`${FN_DIR}/lib/_mls-onmarket.js`).makeOnMarketConfirmer({ store, log: () => {}, sleepImpl: async () => {} });
    const a = await c({ listingId: "IRE1000001" });
    const b = await c({ listingId: "IRE1000002" });
    const d = await c({ listingId: "IRE1000003" });
    check("HIDE_LISTING_IDS, then the copy, then a stored verdict: no hub request for any of them",
      a.onMarket === false && /HIDE_LISTING_IDS/.test(a.why) && b.onMarket === true && d.onMarket === false && world.hubCalls === 0);
    const e1 = await c({ listingId: "IRE1000004", listDate: "2025-01-01" });
    const e2 = await c({ listingId: "IRE1000006", listDate: "2025-01-01" });
    const e3 = await c({ listingId: "IRE1000098", listDate: "2025-01-01" });
    check("at most two hub lookups a run; the third is 'unknown' for now", e1.onMarket === true && e2.onMarket === true &&
      e3.onMarket === null && /2 hub lookups are spent/.test(e3.why) && world.hubCalls === 2, JSON.stringify(e3));
  }
  {
    setEnv({ ...HUB_ENV, MLSGRID_MARKET_DATA: "off" });
    const store = makeStore({});
    world.hubCalls = 0;
    freshModules(store, fakeFeeds(world));
    const M2 = require(`${FN_DIR}/lib/_mls-onmarket.js`);
    const c = M2.mlsGridMarketDataOn() ? null : M2.makeOnMarketConfirmer({ store, token: null, lookups: false, log: () => {} });
    const v = c ? await c({ listingId: "IRE1000003", listDate: "2025-01-01" }) : null;
    check("MLSGRID_MARKET_DATA=off: the refresh's fallback check asks no one (not the hub either)", !!v && v.onMarket === null &&
      /switched off here/.test(v.why) && world.hubCalls === 0, JSON.stringify(v));
  }

  console.log("\n5. A refresh started here, end to end: hidden per the hub, no MLS Grid request");
  {
    setEnv({ ...HUB_ENV, LOFTY_API_KEY: "test-key" });
    process.env.LOFTY_API_KEY = "test-key";
    const w = {
      mine: [
        { mlsListingId: "IRE1000001", mlsOrgId: 1054, id: 1, listingStatus: "Active", price: 500000, bedrooms: 3, bathrooms: 2, sqft: 2000,
          streetAddress: "1 Main St", city: "Loveland", state: "CO", zipCode: "80537", propertyType: "Single Family Home",
          agentName: "Christine Gwinnup", previewPicture: "https://img.chime.me/image/fs01/mls-listing/x/original_IRE1000001-cover.jpeg",
          lastPrimaryChangeTime: "2026-09-28 10:00:00", mlsListDateLSort: 1787356800 },
        { mlsListingId: "IRE1000003", mlsOrgId: 1054, id: 3, listingStatus: "Active", price: 625000, bedrooms: 3, bathrooms: 2, sqft: 2000,
          streetAddress: "3 Main St", city: "Greeley", state: "CO", zipCode: "80634", propertyType: "Single Family Home",
          agentName: "Christine Gwinnup", previewPicture: "https://img.chime.me/image/fs01/mls-listing/x/original_IRE1000003-cover.jpeg",
          lastPrimaryChangeTime: "2026-09-28 10:00:00", mlsListDateLSort: 1757356800 },
      ],
      hub: world.hub,
    };
    const store = makeStore({ "lofty-listings.json": {} });
    const f = fakeFeeds(w);
    freshModules(store, f);
    const rr = await require(`${FN_DIR}/refresh-my-listings.js`).localHandler({ httpMethod: "POST" });
    const cat = store.data.get("lofty-listings.json") || {};
    check("the refresh runs", rr.statusCode === 200, rr.body);
    check("the listing the hub has as Closed is left out; the Active one is kept", !cat.IRE1000003 && !!cat.IRE1000001, Object.keys(cat).join(","));
    check("the hub was asked with the key in x-hub-key only, and MLS Grid not at all", (w.hubCalls || 0) >= 1 && !(w.gridCalls || 0) &&
      f.calls.filter((c) => c.host === "hub.test").every((c) => !c.path.includes(HUB_KEY)));
    delete process.env.LOFTY_API_KEY;
  }

  console.log("\n6. /status says where the market data comes from");
  {
    setEnv({});
    const now = new Date().toISOString();
    const store = makeStore({ "sync-state.json": { lastRunAt: now, lastSuccessAt: now, lastRunVia: "hub", totalListingsStored: 21000 },
      "lofty-sync-state.json": { lastRunAt: now, lastSuccessAt: now, mlsCheck: "checked" }, "lofty-listings.json": {}, "lofty-mine-listings.json": [] });
    freshModules(store, fakeFeeds({}));
    const health = JSON.parse((await require(`${FN_DIR}/site-health.js`).localHandler({ queryStringParameters: { format: "json" } })).body);
    const r = health.checks.find((c) => /Market data from/.test(c.name)) || {};
    check("the Signature copy read through the hub: the row names the hub, and says no MLS Grid request is made",
      r.name === "Market data from the hub refreshing (optional)" && /read through the Seller Intelligence hub/.test(r.detail) && r.optional === true, JSON.stringify(r));
    store.data.set("sync-state.json", { lastRunAt: now, lastSuccessAt: now, totalListingsStored: 21000 });
    freshModules(store, fakeFeeds({}));
    const h2 = JSON.parse((await require(`${FN_DIR}/site-health.js`).localHandler({ queryStringParameters: { format: "json" } })).body);
    const r2 = h2.checks.find((c) => /Market data from/.test(c.name)) || {};
    check("the MLS Grid copy: the row is exactly what it was", r2.name === "Market data from MLS Grid refreshing (optional)" &&
      /Runs on the Signature site \(no MLS Grid token here, on purpose\)/.test(r2.detail), JSON.stringify(r2));
  }

  setEnv({});
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
