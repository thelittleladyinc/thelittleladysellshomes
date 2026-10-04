// One number: Christine's cell everywhere, texts only through Lofty.
//
// 2026-09-30, Christine: "lets only use my phone number and my lofty phone
// number for everything." Every place a visitor is told to call or text her
// uses her cell, 303-709-4262. Her Lofty number is the sender Lofty uses on its
// own; it never needs to be printed on a page.
//
// Same day, Christine: "get weston out please." The lender Weston Gilmore is no
// longer a preferred lender. His name, NMLS and phones must not appear anywhere
// (the town of Weston, CO is a place, not him, so "Weston" alone is allowed).
//
// What this suite protects:
//   1. Every tel:/sms: link in the public output (the built site/, the
//      functions' email and page templates, and the source data the build reads)
//      dials her cell and nothing else.
//   2. Every written-out phone number in that output is her cell, except on the
//      informational guides allowlisted below by exact path (credit bureaus and
//      the IRS, printed as reference, not as a way to reach her).
//   3. No trace of the removed lender in any tracked file outside archive/.
//
// Runs against whatever site/ is on disk: the committed one standalone, the
// freshly built one under tests/run-all.sh.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const HER_CELL = "3037094262";

// Informational guides that print agency numbers as reference. Exact paths only.
const AGENCY_GUIDES = new Set([
  "site/real-estate-glossary.html",                    // Equifax, TransUnion, Experian
  "site/required-reporting-to-the-irs.html",           // IRS forms line
  "build/data/legacy_content/real-estate-glossary.json",
  "build/data/legacy_content/required-reporting-to-the-irs.json",
]);

const digits = (s) => {
  const d = String(s).replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

// Public output: built pages, the function templates that render pages/emails,
// and the source data the build turns into pages.
const files = [
  ...walk(path.join(ROOT, "site"), [".html", ".xml", ".txt"]),
  ...walk(path.join(ROOT, "netlify", "functions"), [".js", ".html"]),
  ...walk(path.join(ROOT, "build", "data"), [".json"]),
];

// A written-out number needs separators, so ids, z-indexes and timestamps
// (bare digit runs) are not mistaken for phone numbers.
const WRITTEN = /(?<![\w.$/#=-])(?:\+?1[\s.-])?\(?[2-9]\d{2}\)?[\s.-]{1,2}[2-9]\d{2}[\s.-]\d{4}(?![\w-])/g;
// Placeholder hints in form fields are not contact lines.
const stripPlaceholders = (s) => s.replace(/placeholder=(["'])[^"']*\1/gi, "");

const badLinks = [];
const badWritten = [];
for (const f of files) {
  const r = rel(f);
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/(tel|sms):(\+?[\d().\s-]{7,20})/gi)) {
    if (digits(m[2]) !== HER_CELL) badLinks.push(`${r}: ${m[1]}:${m[2].trim()}`);
  }
  if (AGENCY_GUIDES.has(r)) continue;
  for (const m of stripPlaceholders(text).matchAll(WRITTEN)) {
    if (digits(m[0]) !== HER_CELL) badWritten.push(`${r}: ${m[0].trim()}`);
  }
}
check(`every tel:/sms: link dials her cell (${files.length} files)`, badLinks.length === 0,
  badLinks.slice(0, 5).join("; "));
check("every written-out phone number is her cell (agency guides allowlisted by path)", badWritten.length === 0,
  badWritten.slice(0, 5).join("; "));
check("the agency-guide allowlist names real files",
  [...AGENCY_GUIDES].every((p) => fs.existsSync(path.join(ROOT, p))),
  [...AGENCY_GUIDES].filter((p) => !fs.existsSync(path.join(ROOT, p))).join(", "));

// --- the removed lender -------------------------------------------------------
const WESTON = /gilmore|2053641|mortgageswithweston|720[-. )]*605[-. ]?4757|606[-. )]*344[-. ]?0100/i;
let tracked = [];
try { tracked = execSync("git ls-files", { cwd: ROOT }).toString().trim().split("\n"); }
catch { tracked = [...files.map(rel)]; }
const westonHits = [];
for (const f of tracked) {
  if (f.startsWith("archive/") || f.startsWith("node_modules/") || f === "tests/test-one-number.js") continue;
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) continue;
  const buf = fs.readFileSync(p);
  if (buf.includes(0)) continue;
  if (WESTON.test(buf.toString("utf8"))) westonHits.push(f);
}
for (const f of files.map(rel)) {
  if (!tracked.includes(f) && WESTON.test(fs.readFileSync(path.join(ROOT, f), "utf8"))) westonHits.push(f);
}
check("no removed-lender name, NMLS, site or phone outside archive/", westonHits.length === 0,
  westonHits.slice(0, 5).join(", "));

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");
