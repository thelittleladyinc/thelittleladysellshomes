// Closing-cost help is for veterans only, and it is $500 (2026-09-29).
//
// Christine, 2026-09-29: "Closing cost is just for veterans and it's $500 that
// goes towards helping them with closing costs." Migrated iHouseWeb copy was
// still promising closing-cost money to everyone else: $500 to first-time
// buyers, to anyone buying or listing in Greeley or Pierce, to anyone who
// "works with me" (buying-a-home), a teacher "10% of her commission", and an
// expired 2023 client-appreciation "$1000 off at closing". This pins the fix:
//   - every "$500 ... closing cost" mention on the built site is the veterans
//     offer: the sentence itself names veterans (veteran/veterans/VA/served),
//     or the page is the veterans page (its title or H1 is about veterans/VA);
//   - the teacher-commission and 2023 client-appreciation offers are gone;
//   - the veterans offer itself is still there.
//
// Later the same day, Christine: "lets change all 1000 to 500 instead". The
// only $1,000 offer left was her teacher incentive ("$1000 incentive to Teacher
// Clients to help with closing costs or down payments", on the teacher-grants
// and special-buyer-programs pages). It stays, at $500. So a "$500 ... closing
// cost" sentence may also be that teacher incentive (the sentence names
// teachers), and no page may offer $1,000 any more. The $1,000 figures that are
// facts, not offers (title insurance, a boundary survey, one loan point, a
// year of insurance due at closing), are untouched.
//
// Why the sentence and not the whole page: every page's RealEstateAgent
// JSON-LD lists "VA loans and military relocation" (knowsAbout), so "the page
// mentions VA" is true everywhere and would never catch a non-veteran promise.
// Titles, meta/og/twitter descriptions and JSON-LD are scanned too -- three of
// the old promises lived only in meta descriptions, i.e. in Google's snippet.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");

const htmlFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return htmlFiles(p);
  return e.name.endsWith(".html") ? [p] : [];
});

const ENT = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", raquo: "»", laquo: "«", middot: "·", dollar: "$" };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  .replace(/ /g, " ");
const squash = (s) => s.replace(/\s+/g, " ").trim();
const text = (html) => squash(decode(html.replace(/<[^>]+>/g, " ")));

const walkStrings = (o, fn) => {
  if (typeof o === "string") fn(o);
  else if (Array.isArray(o)) o.forEach((v) => walkStrings(v, fn));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => walkStrings(v, fn));
};

// Block-level tags end a run of copy, so "$500,000.</p><h2>Closing Costs</h2>"
// is two segments, not one sentence about $500 and closing costs.
const BLOCK = /<\/?(?:p|li|ul|ol|div|h[1-6]|td|th|tr|table|tbody|thead|section|article|header|footer|nav|aside|main|form|label|button|select|option|blockquote|figure|figcaption|dl|dt|dd|details|summary|br|hr)\b[^>]*>/gi;

function segments(html) {
  const out = [];
  for (const m of html.matchAll(/<title>([\s\S]*?)<\/title>/g)) out.push(text(m[1]));
  for (const m of html.matchAll(/<meta\s+(?:name|property)="(?:description|og:description|twitter:description|og:title|twitter:title)"\s+content="([^"]*)"/g)) {
    out.push(squash(decode(m[1])));
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { walkStrings(JSON.parse(m[1]), (s) => out.push(text(s))); } catch (e) { /* not JSON; the body scan still sees the page */ }
  }
  const body = (html.split(/<body\b[^>]*>/i)[1] || html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  for (const block of body.split(BLOCK)) {
    const t = text(block);
    if (t) out.push(t);
  }
  return out;
}

// "$500" as an amount: not $500,000 or $5000.
const FIVE_HUNDRED = /\$\s?500(?:\.00)?(?!\d|,\d)/g;
const CLOSING = /closing[\s-]*costs?/i;
const VETERAN_WORD = (s) => /\bveterans?\b|\bserved\b/i.test(s) || /\bVA\b/.test(s);
const TEACHER_WORD = (s) => /\bteachers?\b/i.test(s);
// "$1,000" / "$1000" as an amount: not $1,000,000 or $10,000.
const ONE_THOUSAND = /\$\s?1,?000(?:\.00)?(?!\d|,\d)/g;
// Her offer wording, as it appeared on the old pages ("offers a $1000 incentive",
// "offers $1000 to teacher clients", "$1000 off at closing").
const OFFER = /\bincentive\b|\boffers?\b|\boff at closing\b|\btoward (?:your |their )?closing\b/i;

function sentenceAt(seg, from, to) {
  const before = seg.slice(0, from).match(/^[\s\S]*[.!?]["”’)]*\s/);
  const after = seg.slice(to).match(/[.!?](?=["”’)]*(?:\s|$))/);
  return seg.slice(before ? before[0].length : 0, after ? to + after.index + 1 : seg.length);
}

// Every "$500 ... closing cost" mention on one page, with whether it is the veterans offer.
function closingCostMentions(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  const veteransPage = /\bveterans?\b/i.test(text(title + " " + h1)) || /\bVA\b/.test(text(title + " " + h1));
  const found = [];
  for (const seg of segments(html)) {
    for (const m of seg.matchAll(FIVE_HUNDRED)) {
      const a = m.index, b = a + m[0].length;
      if (!CLOSING.test(seg.slice(Math.max(0, a - 120), b + 120))) continue;
      const sentence = sentenceAt(seg, a, b);
      found.push({ sentence, veterans: veteransPage || VETERAN_WORD(sentence), teachers: TEACHER_WORD(sentence) });
    }
  }
  return found;
}

// Every sentence on one page that offers $1,000.
function thousandOffers(html) {
  const found = [];
  for (const seg of segments(html)) {
    for (const m of seg.matchAll(ONE_THOUSAND)) {
      const sentence = sentenceAt(seg, m.index, m.index + m[0].length);
      if (OFFER.test(sentence)) found.push(sentence);
    }
  }
  return found;
}

console.log("\n0. The scanner reads amounts and sentences the way a person would");
const probe = (s) => [...s.matchAll(FIVE_HUNDRED)].length;
check("\"$500,000\" is not $500", probe("the exemption increases to $500,000.") === 0);
check("\"$500\" and \"$500.\" are", probe("offers $500 toward closing costs") === 1 && probe("closing costs of $500.") === 1);
check("a non-veteran promise is flagged",
  closingCostMentions("<p>Work with me and get <strong>$500 toward closing costs</strong> on your next home.</p>").some((x) => !x.veterans));
check("a veterans promise is not",
  closingCostMentions("<p>Veterans: I put <strong>$500 toward your closing costs</strong> when you buy with me.</p>").every((x) => x.veterans));
check("\"VA\" elsewhere on the page doesn't excuse the sentence",
  closingCostMentions("<p>VA loans and military relocation.</p><p>Get $500 toward closing costs when you buy or list.</p>").some((x) => !x.veterans));
check("the teacher incentive is recognised as the teacher offer",
  closingCostMentions("<p>She offers a $500 incentive to Teacher Clients to help with closing costs or down payments.</p>").every((x) => x.teachers));
check("\"$1000 incentive\" and \"offers $1,000\" are $1,000 offers",
  thousandOffers("<p>That's why she offers a $1000 incentive to Teacher Clients.</p>").length === 1 &&
  thousandOffers('<meta name="description" content="The Little Lady Sells Homes offers $1,000 to teacher clients.">').length === 1);
check("a $1,000 cost fact is not an offer",
  thousandOffers("<p>This can be an extra $1,000 to $2,000 or even more due at closing.</p>").length === 0 &&
  thousandOffers("<p>Boundary Survey: $1,000–$2,500+ depending on acreage and terrain.</p>").length === 0);
check("\"$1,000,000\" and \"$10,000\" are not $1,000", [..."offers $1,000,000 and $10,000".matchAll(ONE_THOUSAND)].length === 0);

console.log("\n1. Every $500 closing-cost mention on the site is the veterans offer or the teacher incentive");
const files = htmlFiles(SITE);
check(`there are built pages to scan (${files.length})`, files.length > 500);
const offenders = [];
let veteranMentions = 0, teacherMentions = 0;
for (const f of files) {
  for (const x of closingCostMentions(fs.readFileSync(f, "utf8"))) {
    if (x.veterans) veteranMentions++;
    else if (x.teachers) teacherMentions++;
    else offenders.push(`${path.relative(SITE, f)}: "${x.sentence.slice(0, 140)}"`);
  }
}
check("no page promises $500 toward closing costs to anyone but veterans and teachers", offenders.length === 0,
  `\n        ${offenders.join("\n        ")}`);
check(`the scan did find the veterans offer (${veteranMentions} mentions)`, veteranMentions > 0);
check(`the scan did find the teacher incentive (${teacherMentions} mentions)`, teacherMentions > 0);

console.log("\n2. The other closing-cost offers are gone");
const withPhrase = (re) => files.filter((f) => {
  const html = fs.readFileSync(f, "utf8");
  return re.test(html) || re.test(text(html));
}).map((f) => path.relative(SITE, f));
const teacher = withPhrase(/10% of (?:her|my) commission to help teachers/i);
check("no page offers teachers 10% of her commission", teacher.length === 0, teacher.join(", "));
const appreciation = withPhrase(/off at closing in 2023/i);
check("no page offers the 2023 client-appreciation money off at closing", appreciation.length === 0, appreciation.join(", "));
const ca = text(read("client-appreciation-offer.html"));
check("the client-appreciation page says the 2023 offer has ended", ca.includes("This 2023 client-appreciation offer has ended."));
check("it no longer asks people to mention \"Client Appreciation\"", !/mention "Client Appreciation"/.test(ca));

console.log("\n3. The veterans offer is still there");
const vet = read("veteran-home-purchase.html");
check("the veterans page still offers $500", vet.includes("$500"));
check("…toward closing costs", closingCostMentions(vet).some((x) => x.veterans));
const sbp = text(read("special-buyer-programs.html"));
check("special-buyer-programs keeps its veterans offer",
  sbp.includes("Special Offer for Veterans") && sbp.includes("Christine offers $500 to assist with closing costs"));

console.log("\n4. The teacher incentive is $500, and no page offers $1,000");
const thousand = [];
for (const f of files) {
  for (const s of thousandOffers(fs.readFileSync(f, "utf8"))) thousand.push(`${path.relative(SITE, f)}: "${s.slice(0, 140)}"`);
}
check("no page offers $1,000 (title, meta, JSON-LD or body)", thousand.length === 0, `\n        ${thousand.join("\n        ")}`);
const tg = text(read("teacher-home-buying-grants.html"));
check("teacher-home-buying-grants offers teachers $500",
  tg.includes("That's why she offers a $500 incentive to Teacher Clients to help with closing costs or down payments."));
check("special-buyer-programs offers teachers $500",
  sbp.includes("To help, Christine offers a $500 incentive to teacher clients to assist with closing costs or down payments."));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
