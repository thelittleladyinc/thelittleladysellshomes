// The stylesheet's structural invariants.
//
// 2026-08-18: .spot-proof was missing its closing brace. Under native CSS
// nesting that is NOT a syntax error — every rule after it (150+ lines: the
// mobile Call/Text/Email/Schedule bar, the keyboard skip-link, the town
// directory) silently became a nested child of .spot-proof, matching nothing.
// The mobile tap bar rendered as four 17px text links for who knows how long,
// and no build step, test, or console error said a word. Lighthouse's
// touch-target audit disagreeing with what the file plainly said was the only
// symptom. These checks make that class of failure loud.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const src = fs.readFileSync(path.join(ROOT, "build", "assets", "css", "style.css"), "utf8");
const cssDir = path.join(ROOT, "site", "assets", "css");
// Pick the stylesheet by NAME, not by "first .css in the directory". Since
// 2026-08-26 there are two: style.<hash>.css and the deferred-fonts.<hash>.css
// that carries the Playfair @font-face rules (see DEFERRED_FONT_FAMILIES in
// build.py). readdirSync order put the deferred one first and this test started
// comparing the inline CSS against a 0.7KB font file.
const builtName = fs.readdirSync(cssDir).find((f) => /^style\.[0-9a-f]+\.css$/.test(f));
const deferredName = fs.readdirSync(cssDir).find((f) => /^deferred-fonts\.[0-9a-f]+\.css$/.test(f));
const asset = fs.readFileSync(path.join(cssDir, builtName), "utf8");

// 2026-08-25. Everything below used to read `asset` -- site/assets/css/style.*.css.
// No page links that file. All 752 inline their CSS instead, and the inline path
// skipped the minifier, so this suite spent a week confirming that a stylesheet
// nobody downloads was 46KB while every phone was served the 86.6KB source. The
// checks were right; they were pointed at the wrong copy. `built` is now the CSS
// as a visitor receives it.
const homepage = fs.readFileSync(path.join(ROOT, "site", "index.html"), "utf8");
const inlined = (homepage.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || "";
const built = inlined;

check("source braces balance exactly",
  src.split("{").length === src.split("}").length,
  `diff=${src.split("{").length - src.split("}").length} — an unclosed block nests everything after it into oblivion`);

check("no accidental nesting survives into the built css",
  !/&\s/.test(built.replace(/"[^"]*"/g, "")),
  "a '&' selector means some block swallowed its neighbours");

check("the mobile tap bar's rules are reachable (display:none at top level…)",
  built.includes(".contact-bar{display:none}"));
check("…and display:flex inside the mobile media query",
  /@media \(max-width:760px\)\{\.contact-bar\{display:flex/.test(built),
  "this exact rule was dead for days inside .spot-proof");

// WCAG contrast, asserted as MATH on the actual token values rather than as
// hex strings someone has to re-derive. If a future rebrand shifts a color,
// this recomputes and speaks up only when the ratio actually breaks.
function lum(hex) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const token = (name) => ((src.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})`)) || [])[1] || "").toLowerCase();
const rose = token("rose"), deep = token("deep-mauve"), charcoal = token("charcoal");

check("tokens resolve to literal hex (rose, deep-mauve, charcoal)",
  !!(rose && deep && charcoal), `rose=${rose} deep=${deep} charcoal=${charcoal}`);
check("deep-mauve under WHITE text clears WCAG AA (buttons, tap-bar primary)",
  deep && ratio(deep, "ffffff") >= 4.5,
  deep ? `ratio=${ratio(deep, "ffffff").toFixed(2)}, needs 4.5 — this was 2.92 when deep-mauve aliased the LIGHT mauve` : "");
check("deep-mauve as TEXT on white clears WCAG AA (labels, media links, prices)",
  deep && ratio(deep, "ffffff") >= 4.5);
check("rose as TEXT on charcoal clears WCAG AA (hero eyebrow)",
  rose && charcoal && ratio(rose, charcoal) >= 4.5,
  rose && charcoal ? `ratio=${ratio(rose, charcoal).toFixed(2)}` : "");
check("charcoal as TEXT on rose clears WCAG AA (header tagline)",
  rose && charcoal && ratio(charcoal, rose) >= 4.5);
check("the primary button uses the deep token, not raw rose",
  /\.btn-primary\s*\{\s*background:\s*var\(--deep-mauve\)/.test(src),
  "white on raw rose is 3.75 — the exact fail PageSpeed flagged");

// Order-insensitive comparison: the deferred faces are appended, not left in place.
const sortedRules = (t) =>
  (t.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [])
    .map((r) => r.trim()).sort().join("");

// The minifier's contract: smaller, and byte-for-byte the same parse.
check("the css a visitor receives is inline, not a linked file",
  built.length > 1000,
  "no <style> block on the homepage — check how _inline_css() is wired");
check("shipped css is at least 30% smaller than source",
  built.length < src.length * 0.7,
  `${Math.round(built.length / 1024)}KB vs ${Math.round(src.length / 1024)}KB`);
check("minification strips every comment",
  !built.includes("/*"),
  `${(built.match(/\/\*/g) || []).length} comment blocks still shipping to every page`);

// The copies must not drift. They are minified by one function for exactly this
// reason, and the bug above is what having two of them looked like.
//
// 2026-08-26: the inline copy is now deliberately SHORTER than the asset -- the
// Playfair @font-face rules are held out and served from deferred-fonts.css
// after the load event, because they were on the critical path styling nothing
// above the fold. So the invariant is no longer "identical", it is "the split
// loses nothing": inline + deferred must reconstitute the asset exactly. That
// still catches the original bug (two minifiers drifting) AND catches a split
// that drops a rule on the floor.
check("the deferred stylesheet exists",
  !!deferredName, "build.py's write_deferred_font_css() did not run");
const deferred = deferredName
  ? fs.readFileSync(path.join(cssDir, deferredName), "utf8") : "";
check("inline + deferred reconstitute the full stylesheet exactly",
  (built.trim() + deferred.trim()).length === asset.trim().length
  && sortedRules(built + deferred) === sortedRules(asset),
  "the inline path and the asset path have diverged again");
check("the deferred stylesheet carries ONLY @font-face rules",
  deferred.trim().length > 0 && /^(@font-face\{[^}]*\})+$/.test(deferred.trim()),
  "something other than a font face is being withheld from first paint");
check("no deferred family is still declared inline",
  !/@font-face\{font-family:'Playfair Display'/.test(built),
  "Playfair is back on the critical path");

// Smaller is the point, but only if it still parses the same. Rule count is the
// cheapest proxy that catches a minifier that ate a block.
const rules = (t) => (t.replace(/\/\*[\s\S]*?\*\//g, "").match(/\{/g) || []).length;
check(`minification preserves every rule block (${rules(src)})`,
  rules(built) + rules(deferred) === rules(src),
  `source ${rules(src)} vs shipped ${rules(built)} inline + ${rules(deferred)} deferred`);

// The whole point, checked on more than the one page. _inline_css() is memoised,
// so a page built down a different path would silently keep the old copy.
// Only the <style> block counts: inline JS keeps its comments on purpose.
const SAMPLE = ["about.html", "search-homes.html", "communities/index.html", "404.html"];
const commented = SAMPLE.filter((rel) => {
  const f = path.join(ROOT, "site", rel);
  if (!fs.existsSync(f)) return false;
  const css = (fs.readFileSync(f, "utf8").match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || "";
  return css.includes("/*");
});
check(`every sampled page ships the minified copy (${SAMPLE.length} pages)`,
  commented.length === 0,
  `${commented.join(", ")} still inline commented CSS — _inline_css() is not reaching them`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
