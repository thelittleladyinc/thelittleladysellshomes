// IDX display switched off (2026-09-28): Christine's IRES licence was revoked,
// and the shared Signature backend now answers listings-search with
//   { error: "not_configured", idxUnavailable: true, message, searchUrl, listings: [] }
// while IDX_DISPLAY is not "on" or its data is older than 12 hours. This site's
// pages must turn that into a link to her home-search site, not an error.
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const read = (p) => fs.readFileSync(path.join(ROOT, "site", p), "utf8");
for (const page of ["search-homes.html", "current-listings.html"]) {
  const html = read(page);
  check(`${page} checks idxUnavailable before anything else`, /data\.idxUnavailable/.test(html));
  check(`${page} defines idxOffHtml`, /function idxOffHtml\(data\)/.test(html));
}

const html = read("search-homes.html");
const m = html.match(/function idxOffHtml\(data\) \{[\s\S]*?\n  \}\n/);
check("helper found in the built page", !!m);
if (m) {
  const idxOffHtml = new Function(`${m[0]}; return idxOffHtml;`)();
  const msg = "Search homes on my home-search site";
  const good = idxOffHtml({ searchUrl: "https://homes.example.com/", message: msg });
  check("links to the server's URL with the message", good.includes('href="https://homes.example.com/"') && good.includes(msg));
  const none = idxOffHtml({});
  check("no URL from the server -> the default", none.includes('href="https://www.thelittleladysellshomes.com"') && none.includes(msg));
  const bad = idxOffHtml({ searchUrl: "javascript:alert(1)", message: "<img src=x onerror=alert(1)>" });
  check("a javascript: URL is never linked", !bad.includes("javascript:"));
  check("the message is escaped", !bad.includes("<img"));
}

// The strip on this site is fed by its OWN recent-activity function, so it needs
// the same switch as the backend's.
const RA = require(path.join(ROOT, "netlify", "functions", "recent-activity.js"))._internals;
(async () => {
  let called = 0;
  global.fetch = async () => { called++; return { ok: true, status: 200, json: async () => ({ events: [] }) }; };
  RA.resetCache();
  const res = await RA.handler({}, {}, { env: { LISTING_FEED_KEY: "k" }, now: () => Date.now() });
  check("recent-activity: IDX_DISPLAY unset -> empty, no call", JSON.parse(res.body).items.length === 0 && called === 0);
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures ? 1 : 0);
})();
