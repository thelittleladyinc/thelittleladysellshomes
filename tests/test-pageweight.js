// What every visitor downloads before they see anything.
//
// 2026-08-25, from a PageSpeed mobile score of 74 that turned out to have four
// separate causes, three of which were things the build already knew how to do and
// was doing to the wrong file:
//
//   1. style.css was minified into site/assets/css/ -- a file NO page links, because
//      all 752 inline their CSS. Every phone got the 86.6KB commented source.
//   2. 2,443,589 bytes of HTML code comments shipped across the site, 3,248 per page,
//      three of them on every single page because they live in head() and header().
//   3. The header avatar was a 156x156 PNG, 24,951 bytes, displayed at 46px. The only
//      above-the-fold image on any page, on all 752 of them.
//   4. explore-map.js (90KB) loaded with `defer` on the homepage and communities
//      index, where its own code then refuses to boot until you scroll to it.
//      Lighthouse measured 61% of it unused.
//
// The pattern in all four: the fix existed, and was pointed somewhere that did not
// ship. So these checks read the BUILT PAGES -- what a visitor actually receives --
// and never the source or the intermediate artifact.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const pages = walk(SITE);
const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

// Comments inside <script>/<style> are JS and CSS comments, a different question --
// and inside <pre>/<textarea> the bytes are content. Only markup comments count here.
const outsideLiterals = (html) =>
  html.replace(/<(script|style|textarea|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

// ---- 1. No documentation ships ------------------------------------------------
{
  const offenders = [];
  let bytes = 0;
  for (const f of pages) {
    const found = outsideLiterals(fs.readFileSync(f, "utf8")).match(/<!--[\s\S]*?-->/g) || [];
    const real = found.filter((c) => !c.startsWith("<!--["));   // conditional comments are markup
    if (real.length) {
      bytes += real.reduce((a, c) => a + c.length, 0);
      if (offenders.length < 3) offenders.push(path.relative(ROOT, f));
    }
  }
  check(`no built page ships HTML comments (${pages.length} pages)`,
    bytes === 0,
    `${kb(bytes)} across the site — e.g. ${offenders.join(", ")}. Comments belong in build.py, not on a phone`);
}

// The stripper must be surgical. A JS string containing "<!--" is not a comment, and
// whitespace inside <pre> is rendered -- stripping either would be a real bug, quiet
// until someone hits the one page that has one.
{
  const src = fs.readFileSync(path.join(ROOT, "build/build.py"), "utf8");
  check("the comment stripper skips script/style/pre/textarea",
    /_HTML_LITERAL_REGION\s*=\s*re\.compile\(r"<\(script\|style\|textarea\|pre\)/.test(src),
    "a JS string containing '<!--' would be eaten from there to the next '-->'");
  check("and leaves conditional comments alone",
    /_HTML_COMMENT\s*=\s*re\.compile\(r"<!--\(\?!\\\[\)/.test(src),
    "<!--[if ...]> is markup a browser acts on, not a note");
  check("blank-line collapse never joins two tags",
    src.includes('(?:[ \\t]*\\n)+", "\\n"'),
    "collapsing to nothing would delete rendered whitespace between inline elements");
}

// ---- 2. The one above-the-fold image ------------------------------------------
{
  const webp = path.join(SITE, "assets/img/little-lady-mark.webp");
  const png = path.join(SITE, "assets/img/little-lady-mark.png");
  check("the header avatar ships a WebP", fs.existsSync(webp));
  check("...with a PNG fallback for anything that cannot read it", fs.existsSync(png));
  if (fs.existsSync(webp)) {
    const n = fs.statSync(webp).size;
    check(`the WebP is small enough to be free (${kb(n)})`, n < 6000,
      "it was 24,951 bytes as a PNG, on every page, above the fold");
  }
  // Sized for its box: 46px display, so 92px covers a 2x screen and nothing more.
  const pngWidth = (b) => b.readUInt32BE(16);
  const webpWidth = (b) => {                       // RIFF....WEBPVP8X, canvas w-1 at 24
    if (b.slice(12, 16).toString() !== "VP8X") return null;
    return 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
  };
  for (const [label, f, read] of [["WebP", webp, webpWidth], ["PNG fallback", png, pngWidth]]) {
    if (!fs.existsSync(f)) continue;
    const w = read(fs.readFileSync(f));
    check(`the ${label} is 92px, not the 156px original (${w}px)`, w === 92,
      "serving more pixels than the 46px box can show is the waste Lighthouse flagged");
  }
  check("every page serves the avatar through <picture>",
    /<picture class="brand-avatar-slot">[\s\S]{0,240}?little-lady-mark\.webp/.test(home));
  // The <picture>, not the <img>, is the flex item in .brand-wordmark. Without this
  // the header logo picks up a baseline gap and stops honouring flex: 0 0 auto.
  const css = (home.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || "";
  check("the <picture> wrapper is styled as the flex item it became",
    /\.brand-avatar-slot\{[^}]*display:block/.test(css),
    "<picture> is display:inline by default — the header would shift");
}

// ---- 3. The map costs nothing until it is wanted --------------------------------
{
  const withMap = pages.filter((f) => fs.readFileSync(f, "utf8").includes('id="spc-explore"'));
  check(`the explore map appears on the pages that embed it (${withMap.length})`, withMap.length >= 3);
  const eager = withMap.filter((f) => /<script src="[^"]*explore-map[^"]*"/.test(fs.readFileSync(f, "utf8")));
  check("no page loads explore-map.js with a plain script tag",
    eager.length === 0,
    `${eager.map((f) => path.relative(ROOT, f)).join(", ")} — 90KB parsed before DOMContentLoaded for a map below the fold`);
  // Order-agnostic: the loader defines boot() (which names the path) before it
  // installs the observer, and a future rewrite may well swap them. What matters
  // is that ONE script block contains both.
  const lazyLoads = (t) => (t.match(/<script>[\s\S]*?<\/script>/g) || [])
    .some((b) => b.includes("IntersectionObserver") && /explore-map[.\w]*\.js/.test(b));
  const notLazy = withMap.filter((f) => !lazyLoads(fs.readFileSync(f, "utf8")));
  check("the map is loaded on intersection everywhere it appears",
    notLazy.length === 0,
    notLazy.map((f) => path.relative(ROOT, f)).join(", ") + " — the loader is missing or was split apart");
  // The loader names its own path in a string, which fingerprint_assets() rewrites by
  // text replace. If that ever stops matching, the map 404s and nothing else breaks --
  // so nobody would notice until someone scrolled down and found a dead panel.
  check("the path inside the loader is content-hashed",
    /explore-map\.[0-9a-f]{8}\.js/.test(home),
    "an unhashed path here means a year-cached stale map, or a 404 after the next deploy");
}

// ---- 4. A ceiling, so this cannot drift back -----------------------------------
{
  const n = Buffer.byteLength(home);
  check(`the homepage stays under 130KB (${kb(n)})`, n < 130 * 1024,
    "it was 151,472 bytes on 2026-08-25 and this is the number PageSpeed reads first");
  const worst = pages.map((f) => [f, fs.statSync(f).size]).sort((a, b) => b[1] - a[1])[0];
  // The glossary is the outlier by design -- it is one long reference page, and it
  // came down from 275,516 bytes with everything else.
  check(`the heaviest page stays under 250KB (${path.relative(ROOT, worst[0])}, ${kb(worst[1])})`,
    worst[1] < 250 * 1024);
}

console.log(failures === 0 ? "All checks passed" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
