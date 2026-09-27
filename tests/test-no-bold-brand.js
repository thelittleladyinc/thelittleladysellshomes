// The retired Bold Collective Homes website and brand never reach a visitor.
//
// 2026-09-27 (Christine): boldcollectivehomes.com / theboldcollectivehomes.com
// were retired and she is now a solo agent (The Little Lady Sells Homes,
// Christine Gwinnup, LPT Realty). Legacy articles imported from the old site
// named "The Bold Collective" as her business; they now name her own brand.
//
// What this suite protects:
//   1. A link, canonical or JSON-LD id pointing at either retired Bold domain.
//   2. "The Bold Collective" presented as her business in visible copy, titles
//      or meta tags on any built page or the IDX listing-page shell.
//   3. Links to other retired services (Fello, the old homebuyer-funnel and
//      listing-engine Render apps, Follow Up Boss, Blotato, the old iHouseWeb
//      editor host).
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|xml|txt)$/.test(e.name) || e.name === "_redirects") out.push(p);
  }
  return out;
}

const files = walk(path.join(ROOT, "site"));
files.push(path.join(ROOT, "netlify", "functions", "lib", "_listing-page-shell.html"));

const BOLD_DOMAIN = /(?:the)?boldcollectivehomes\.com/i;
const BOLD_BRAND = /\bbold\s+collective\b/i;
const RETIRED = /hifello\.com|\.edit\.ihouseelite\.com|homebuyer-funnel\.onrender\.com|listing-engine\.onrender\.com|followupboss\.com|blotato\.com/i;

const domain = [], brand = [], retired = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const rel = path.relative(ROOT, f);
  if (BOLD_DOMAIN.test(text)) domain.push(rel);
  if (BOLD_BRAND.test(text)) brand.push(rel);
  if (RETIRED.test(text)) retired.push(rel);
}

check(`no page links a retired Bold domain (${files.length} files)`, domain.length === 0, domain.slice(0, 5).join(", "));
check("no page presents \"The Bold Collective\" as her business", brand.length === 0, brand.slice(0, 5).join(", "));
check("no page links a retired service", retired.length === 0, retired.slice(0, 5).join(", "));

if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll checks passed.");
