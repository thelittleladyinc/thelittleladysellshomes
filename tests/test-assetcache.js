// Every CSS/JS reference must be content-hashed, and every hash must resolve.
//
// The production build now has more than one fingerprinting layer: build.py
// fingerprints core assets and post-build gates create their own content-addressed
// assets. The invariant is the same for both: the filename must carry a meaningful
// hex content hash so immutable caching can never pin a stale asset.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js|xml|webmanifest)$/.test(e.name)) out.push(p);
  }
  return out;
}

const REF = /\/assets\/(?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js)/g;
// A fingerprinted name carries at least an 8-hex content-hash segment before
// the extension. Core build assets currently use 8 chars; post-build assets use
// 12. Accepting 8–64 keeps the test about content addressing, not one hash length.
const HASHED = /\/assets\/(?:css|js)\/[A-Za-z0-9_-]+\.[0-9a-f]{8,64}\.(?:css|js)$/;

// EVERYTHING this build generates that can name an asset — not just site/.
const EXTRA_GENERATED = [
  path.join(ROOT, "netlify", "functions", "lib", "_listing-page-shell.html"),
];

const refs = new Map();
for (const f of [...walk(SITE), ...EXTRA_GENERATED.filter(fs.existsSync)]) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.match(REF) || []) {
    if (!refs.has(m)) refs.set(m, path.relative(ROOT, f));
  }
}

// Nothing anywhere else in served Netlify code may name an asset without being
// included in the fingerprinting contract.
{
  const scanned = [];
  const stack = [path.join(ROOT, "netlify")];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(html|js)$/.test(e.name)) scanned.push(p);
    }
  }
  const known = new Set(EXTRA_GENERATED);
  const unlisted = [];
  for (const f of scanned) {
    if (known.has(f)) continue;
    const hits = (fs.readFileSync(f, "utf8").match(REF) || []);
    if (hits.length) unlisted.push(`${path.relative(ROOT, f)} → ${hits[0]}`);
  }
  check(
    "no served file outside site/ names an asset without being fingerprinted",
    unlisted.length === 0,
    unlisted.slice(0, 4).join(" · ") +
      " — add it to EXTRA_GENERATED here and to targets in fingerprint_assets()"
  );
}
check("the site references CSS/JS at all", refs.size > 0, `${refs.size} references`);

const unhashed = [...refs].filter(([r]) => !HASHED.test(r));
check(
  "every CSS/JS reference is content-hashed",
  unhashed.length === 0,
  unhashed.map(([r, f]) => `${r} (in ${f})`).slice(0, 4).join(" · ") +
    " — an unversioned asset is cached for a year under netlify.toml, so a change would never reach a returning visitor"
);

const missing = [...refs].filter(([r]) => !fs.existsSync(path.join(SITE, r)));
check(
  "every referenced asset exists on disk",
  missing.length === 0,
  missing.map(([r, f]) => `${r} (in ${f})`).slice(0, 4).join(" · ") +
    " — the page would load with NO stylesheet, which is worse than a stale one"
);

// Nothing may be left behind under an unhashed name.
for (const sub of ["css", "js"]) {
  const dir = path.join(SITE, "assets", sub);
  if (!fs.existsSync(dir)) continue;
  const stray = fs.readdirSync(dir).filter((n) =>
    /\.(css|js)$/.test(n) && !/\.[0-9a-f]{8,64}\.(css|js)$/.test(n));
  check(`no unhashed files left in assets/${sub}`, stray.length === 0, stray.join(", "));
}

// Immutable caching is safe because the names are content hashed.
const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
for (const sub of ["css", "js"]) {
  const block = new RegExp(`for = "/assets/${sub}/\\*"[\\s\\S]{0,200}?Cache-Control = "([^"]+)"`);
  const m = block.exec(toml);
  check(`assets/${sub} is cached immutably (safe only because names are hashed)`,
    !!m && /immutable/.test(m[1]), m ? m[1] : "no Cache-Control found");
}

console.log(failures === 0 ? "All checks passed" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
