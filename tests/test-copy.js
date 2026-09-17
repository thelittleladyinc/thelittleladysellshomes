// Doubled words in the rendered copy.
//
// 2026-08-16. Christine looked at the new county block and said "look!!!" about
// something else entirely, but the screenshot showed "Larimer County County, In
// Numbers". COUNTIES[]["name"] is already "Larimer County", and three f-strings I had
// just written appended " County" to it. 36 pages shipped with it.
//
// Grepping for the general pattern then found two MORE, both pre-existing and both
// live:
//   "The Barr Lake Lake Loop / Perimeter Trail"  (Fort Lupton, and inside FAQ schema
//                                                 that Google reads, not just body copy)
//   "make sure sure to have your pre-approved loan"  (buyer guide)
//
// So this is worth a permanent check. Nothing about a doubled word breaks a page, no
// test failed, and the only reason it was caught is that a human happened to read one
// of 36 pages. That is not a process.
//
// Scoped to the SAME LINE deliberately. Allowing a newline between the two words
// produced 40+ false positives on this site -- a heading immediately followed by a link
// with the same text ("Loveland" / "Loveland") reads as a repeat to a regex and as
// perfectly normal to a person.
//
// Repo root derived from this file's own location, never hardcoded: these suites
// run both locally and in GitHub Actions, where the checkout is at
// /home/runner/work/<repo>/<repo>. An absolute path would pass here and fail there.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

// Real English, not a mistake. Kept as an explicit list so a new entry is a decision
// someone made rather than a threshold quietly loosened.
const ALLOWED = new Set(["win win", "had had", "that that"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const found = new Map();   // phrase -> [pages]
for (const f of walk(SITE)) {
  let h = fs.readFileSync(f, "utf8");
  h = h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const text = h.replace(/<[^>]+>/g, " ");
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(/\b([A-Za-z]{3,})[ \t]+\1\b/g)) {
      const phrase = m[0].replace(/\s+/g, " ");
      if (ALLOWED.has(phrase.toLowerCase())) continue;
      if (!found.has(phrase)) found.set(phrase, []);
      const list = found.get(phrase);
      const rel = path.relative(ROOT, f);
      if (!list.includes(rel)) list.push(rel);
    }
  }
}

const report = [...found].map(([p, pages]) =>
  `"${p}" on ${pages.length} page(s) e.g. ${pages[0]}`).join(" | ");
check(`no doubled words in the rendered copy (${walk(SITE).length} pages scanned)`,
  found.size === 0, report);

// The three that motivated this, pinned by name so a regression is unmistakable rather
// than just "some doubled word somewhere".
const all = walk(SITE).map((f) => fs.readFileSync(f, "utf8")).join("\n");
for (const phrase of ["County County", "Barr Lake Lake", "sure sure"]) {
  check(`"${phrase}" does not reappear`, !all.includes(phrase));
}

// Machine-sounding freshness phrasing.
//
// 2026-09-16. The market-report FAQ and its FAQPage schema rendered the snapshot age
// arithmetically: on the day of a refresh, 16 town pages read "These are live IRES MLS
// figures, refreshed 0 days ago." The prose "as of" line directly above them said
// "refreshed today", because that path had its own today/yesterday wording and the FAQ
// path did not. Accurate either way; one of them reads like a template that broke.
//
// It matters more in the schema than in the body: Google quotes FAQ answers verbatim in
// rich results, so "0 days ago" is a sentence Christine never wrote appearing under her
// name in search. Both paths now share _freshness_phrase() in build.py.
//
// Checked against the RAW html rather than the stripped text so JSON-LD is covered --
// that is the copy with the wider audience. "1 days ago" is here too: same helper, and
// the same class of mistake if someone reintroduces naive pluralisation.
for (const phrase of ["0 days ago", "1 days ago"]) {
  const pages = walk(SITE)
    .filter((f) => fs.readFileSync(f, "utf8").includes(phrase))
    .map((f) => path.relative(ROOT, f));
  check(`"${phrase}" never reaches the rendered copy or its schema`,
    pages.length === 0,
    pages.length ? `${pages.length} page(s) e.g. ${pages[0]}` : "");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
