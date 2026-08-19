// The shared-backend pass-through layer, and the trap it replaces.
//
// The first wiring of this site to the Signature MLS backend was seven
// netlify.toml rules proxying /.netlify/functions/<endpoint> cross-site.
// They deployed "without errors" and never fired once: Netlify reserves
// paths beginning with /.netlify and silently ignores redirect rules that
// shadow them. Live search, photos, walkability, the sold map and the spots
// map all 404ed on the published site while every static check passed,
// because the checks read the TOML and the TOML looked right.
//
// The wiring is now real functions in netlify/functions/, one per endpoint,
// each a credential-free pass-through to the Signature deployment. This
// suite pins three things:
//   1. every endpoint the front end calls has its pass-through, wired to the
//      shared proxy helper under its own exact name;
//   2. nobody reintroduces a redirect rule on the reserved /.netlify path --
//      it would deploy cleanly and break nothing until someone deletes the
//      "redundant" function next to it;
//   3. the proxy helper itself keeps the properties that make it safe: it
//      targets the Signature backend, carries no MLS credentials, and
//      returns base64 so listing photos survive the trip.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function check(label, ok, why) {
  if (ok) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}${why ? ` — ${why}` : ""}`); }
}

const ENDPOINTS = [
  "listings-search",
  "listing-photo",
  "walkability",
  "nearby-places",
  "local-spots",
  "sold-homes-geocode",
  "site-health",
];

// 1. Every endpoint has its pass-through, under the exact runtime name.
for (const name of ENDPOINTS) {
  const file = path.join(ROOT, "netlify", "functions", `${name}.js`);
  let src = "";
  try { src = fs.readFileSync(file, "utf8"); } catch (e) { /* handled below */ }
  check(
    `${name} exists as a local pass-through function`,
    src.includes("_sig-proxy") && src.includes(`makeProxy("${name}")`),
    "the front end (and photo URLs inside listings-search responses) call this exact path"
  );
}

// The pass-throughs must load and expose a handler — a require() typo would
// otherwise surface as a 502 in production only.
for (const name of ENDPOINTS) {
  let handler;
  try {
    handler = require(path.join(ROOT, "netlify", "functions", `${name}.js`)).handler;
  } catch (e) { /* handled below */ }
  check(`${name} loads and exports a handler`, typeof handler === "function");
}

// 2. The reserved-path trap stays closed.
const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
check(
  "netlify.toml has no redirect rule on the reserved /.netlify path",
  !/from\s*=\s*"\/\.netlify\//.test(toml),
  "Netlify ignores such rules silently — the endpoint they cover will 404 in production"
);

// 3. The helper's safety properties.
const proxy = fs.readFileSync(
  path.join(ROOT, "netlify", "functions", "lib", "_sig-proxy.js"), "utf8");
check(
  "the proxy targets the Signature deployment (one pacer, one photo cache)",
  proxy.includes("https://signaturepropertycollection.com/.netlify/functions/")
);
check(
  "the proxy returns base64 bodies so listing photos survive",
  proxy.includes("isBase64Encoded: true")
);
check(
  "the proxy reads no environment secrets — this site carries no MLS credentials",
  !/process\.env/.test(proxy),
  "an env read here is the first step toward the second uncoordinated pacer that caused suspension #3"
);

// The /listing/:id rewrite is NOT on the reserved path and genuinely works —
// it must stay in netlify.toml, brand param intact.
check(
  "the /listing/:id rewrite still proxies to the shared listing-page with brand=tllsh",
  /from = "\/listing\/:id"[\s\S]*?listing-page\?id=:id&brand=tllsh/.test(toml)
);

console.log(failures === 0 ? "All checks passed" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
