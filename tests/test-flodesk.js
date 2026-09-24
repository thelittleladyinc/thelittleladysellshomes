// Newsletter sign-ups -> Flodesk county segment (netlify/functions/lib/_flodesk.js),
// exercised through submission-created.js with fetch and Blobs stubbed.
//
// The property that matters most is the negative one: Flodesk failing in any way
// must never stop the lead reaching Lofty or the alert email going out.
// Repo root derived from this file's own location, never hardcoded.
const ROOT = require("path").resolve(__dirname, "..");
const path = require("path");
const FN_DIR = `${ROOT}/netlify/functions`;

const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
require.cache[blobsPath] = {
  id: blobsPath, filename: blobsPath, loaded: true, exports: {
    getStore: () => ({ get: async () => null, setJSON: async () => {} }),
  },
};

let calls = [];
function stubFetch(handler) {
  calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || "GET";
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
    calls.push({ url: u, method, body, headers: opts.headers || {} });
    const r = handler({ url: u, method, body });
    if (r === "throw") throw new Error("network down");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body || {}),
      json: async () => r.body,
      headers: { get: () => null },
    };
  };
}
function loadHandler() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(FN_DIR) && k !== blobsPath) delete require.cache[k];
  }
  return require(path.join(FN_DIR, "submission-created.js")).handler;
}
const submission = (data, formName = "newsletter-signup") =>
  ({ body: JSON.stringify({ payload: { form_name: formName, data } }) });

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`); }
}
const of = (m, p) => calls.filter((c) => c.method === m && c.url.includes(p));
const lofty = ({ url, method }) => {
  if (url.includes("api.resend.com")) return { status: 200, body: { id: "email_1" } };
  if (url.includes("/leads") && method === "POST") return { status: 200, body: { data: { leadId: 777 } } };
  if (url.includes("/notes")) return { status: 200, body: { data: { noteId: 1 } } };
  if (url.includes("/leads/777") && method === "GET") return { status: 200, body: { data: { tags: [] } } };
  if (url.includes("/leads/777") && method === "PUT") return { status: 200, body: {} };
  return null;
};

process.env.LOFTY_API_KEY = "lofty-test-key";
process.env.RESEND_API_KEY = "resend-test-key";
const fd = require(path.join(FN_DIR, "lib/_flodesk.js"));

(async () => {
  console.log("\n1. County resolution and the county -> env var map");
  check("the form's own choice wins", fd.resolveCounty({ county: "weld", attribution_first_page: "/communities/larimer/loveland.html" }) === "weld");
  check("falls back to the county page they signed up from",
    fd.resolveCounty({ attribution_form_page: "/communities/boulder/longmont.html" }) === "boulder");
  check("'somewhere else' and no answer resolve to no county",
    fd.resolveCounty({ county: "other" }) === null && fd.resolveCounty({}) === null);
  check("every county maps to an env var name, not an ID",
    Object.values(fd.COUNTY_SEGMENT_ENV).every((v) => /^FLODESK_SEGMENT_[A-Z]+$/.test(v)));
  const env = { FLODESK_SEGMENT_WELD: "seg-weld", FLODESK_SEGMENT_NEWSLETTER: "seg-all" };
  check("county with its own segment uses it", fd.segmentFor("weld", env).segmentId === "seg-weld");
  check("county without its own segment uses the newsletter fallback", fd.segmentFor("larimer", env).segmentId === "seg-all");
  check("no segment configured at all -> none", fd.segmentFor("weld", {}).segmentId === null);

  console.log("\n2. Newsletter sign-up, everything configured");
  process.env.FLODESK_API_KEY = "fd-test-key";
  process.env.FLODESK_SEGMENT_LARIMER = "seg-larimer";
  process.env.FLODESK_SEGMENT_NEWSLETTER = "seg-all";
  stubFetch((r) => {
    if (r.url.includes("api.flodesk.com") && r.url.endsWith("/subscribers")) return { status: 200, body: { id: "sub_1" } };
    if (r.url.includes("api.flodesk.com") && r.url.includes("/segments")) return { status: 200, body: {} };
    return lofty(r) || { status: 404, body: {} };
  });
  let res = await loadHandler()(submission({ name: "Pat Lee", email: "pat@example.com", county: "larimer" }));
  check("returns 200 ok", res.statusCode === 200 && res.body === "ok", res.body);
  check("lead still pushed to Lofty", of("POST", "api.lofty.com/v1.0/leads").length === 1);
  const subs = of("POST", "api.flodesk.com/v1/subscribers").filter((c) => c.url.endsWith("/subscribers"));
  check("one Flodesk subscriber upsert", subs.length === 1, `${subs.length}`);
  if (subs.length) {
    check("upsert carries email + first/last name", subs[0].body.email === "pat@example.com"
      && subs[0].body.first_name === "Pat" && subs[0].body.last_name === "Lee", JSON.stringify(subs[0].body));
    check("Flodesk uses Basic auth with the key as username",
      subs[0].headers.Authorization === `Basic ${Buffer.from("fd-test-key:").toString("base64")}`);
  }
  const segs = of("POST", "/subscribers/sub_1/segments");
  check("added to the Larimer segment by its own call",
    segs.length === 1 && JSON.stringify(segs[0].body.segment_ids) === '["seg-larimer"]', JSON.stringify(segs[0] && segs[0].body));

  console.log("\n3. Other forms never touch Flodesk");
  stubFetch((r) => lofty(r) || { status: 404, body: {} });
  res = await loadHandler()(submission({ name: "Dana", email: "d@example.com", message: "hi" }, "contact"));
  check("contact form: no Flodesk call", of("POST", "api.flodesk.com").length === 0);
  check("contact form: Lofty push unchanged", of("POST", "api.lofty.com/v1.0/leads").length === 1 && res.statusCode === 200);

  console.log("\n4. Fail-soft: Flodesk down");
  stubFetch((r) => (r.url.includes("api.flodesk.com") ? "throw" : lofty(r) || { status: 404, body: {} }));
  res = await loadHandler()(submission({ name: "Sam", email: "sam@example.com", county: "weld" }));
  check("handler still returns 200 ok", res.statusCode === 200 && res.body === "ok", res.body);
  check("lead still pushed to Lofty", of("POST", "api.lofty.com/v1.0/leads").length === 1);
  check("alert email still sent", of("POST", "api.resend.com").length === 1);

  console.log("\n5. Fail-soft: Flodesk rejects the subscriber");
  stubFetch((r) => (r.url.includes("api.flodesk.com") ? { status: 500, body: {} } : lofty(r) || { status: 404, body: {} }));
  res = await loadHandler()(submission({ name: "Sam", email: "sam@example.com", county: "weld" }));
  check("no segment call after a failed upsert", of("POST", "/segments").length === 0);
  check("lead still pushed to Lofty", of("POST", "api.lofty.com/v1.0/leads").length === 1 && res.statusCode === 200);

  console.log("\n6. No FLODESK_API_KEY");
  delete process.env.FLODESK_API_KEY;
  stubFetch((r) => lofty(r) || { status: 404, body: {} });
  res = await loadHandler()(submission({ name: "Sam", email: "sam@example.com" }));
  check("skipped quietly, no Flodesk call", of("POST", "api.flodesk.com").length === 0);
  check("lead still pushed to Lofty", of("POST", "api.lofty.com/v1.0/leads").length === 1 && res.statusCode === 200);

  console.log("\n7. No LOFTY_API_KEY: Flodesk still runs");
  process.env.FLODESK_API_KEY = "fd-test-key";
  delete process.env.LOFTY_API_KEY;
  stubFetch((r) => (r.url.includes("api.flodesk.com") ? { status: 200, body: { id: "sub_2" } } : { status: 404, body: {} }));
  res = await loadHandler()(submission({ name: "Kim", email: "kim@example.com" }));
  check("subscriber still added to Flodesk", of("POST", "api.flodesk.com/v1/subscribers").length >= 1);
  check("unknown county -> newsletter fallback segment",
    JSON.stringify((of("POST", "/segments")[0] || {}).body) === '{"segment_ids":["seg-all"]}');
})()
.then(() => {
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
})
.catch((e) => { console.error("\nharness error:", e); process.exit(1); });
