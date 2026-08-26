// Every form control on every built page must have an accessible name, and the
// Meta Pixel must stay off the critical path.
//
// 2026-08-26. Both halves of this suite exist because of the same bad morning:
// mobile PageSpeed fell from 92 to 70 and accessibility from 100 to 95, and the
// two causes were unrelated to each other.
//
//  1. The homepage lead form (added Wave 6) had seven controls whose only
//     "label" was a placeholder. For a text input a placeholder does at least
//     produce an accessible name -- badly, since it vanishes the moment someone
//     starts typing -- but a <select> has no placeholder mechanism at all, so
//     "I'm looking to..." was a nameless control. Lighthouse called it out by
//     name ("Select elements do not have associated label elements"). A sweep
//     then found 87 nameless controls across the site, mostly the two search
//     filters that appear on 42 pages each, where the visible text was sitting
//     right there in a <span> that was never wired to anything.
//
//     So this asserts the OUTCOME (every control resolves to a name) rather than
//     any one technique. A <label for>, a wrapping <label>, aria-label and
//     aria-labelledby are all fine; what is forbidden is shipping a control that
//     a screen reader or an agent has to guess at.
//
//  2. fbevents.js is 409KB of uncompressed JavaScript from a third-party CDN. It
//     was being injected during page load, and it cost ~160ms of the main thread
//     on a throttled phone plus most of a "reduce unused JavaScript" flag. Meta's
//     own snippet queues calls until the script lands, so delaying the INJECTION
//     loses no events -- which is what makes the deferral safe, and which is why
//     the queue shim must stay immediate. Both halves are pinned below.
//
// Repo root derived from this file's own location, never hardcoded: these suites
// run both locally and in GitHub Actions.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

// --- 1. accessible names -----------------------------------------------------
// A deliberately small hand-rolled scan rather than a parser dependency: the
// suites run in CI with no node_modules, so anything requiring jsdom would be
// skipped exactly when it matters. This walks tags in source order and tracks
// how deep inside a <label> and inside a display:none subtree we are, which is
// enough to distinguish a real implicit label from a honeypot.
const NAMELESS = [];
for (const file of walk(path.join(ROOT, "site"))) {
  const html = fs.readFileSync(file, "utf8");
  const forTargets = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  let labelDepth = 0, hidden = 0;
  const tagRe = /<(\/?)(label|select|textarea|input|p|div|span)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const closing = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3] || "";
    if (closing) { if (tag === "label" && labelDepth) labelDepth--; if (hidden) hidden--; continue; }
    const styled = /style="[^"]*display\s*:\s*none/i.test(attrs);
    if (styled) hidden++;
    if (tag === "label") { labelDepth++; continue; }
    if (!/^(select|textarea|input)$/.test(tag)) continue;
    const type = (attrs.match(/type="([^"]+)"/i) || [, "text"])[1].toLowerCase();
    if (tag === "input" && ["hidden", "submit", "button", "image", "reset"].includes(type)) continue;
    if (hidden > 0) continue;                       // out of the a11y tree anyway
    const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    const named =
      /aria-label(?:ledby)?="/.test(attrs) ||       // explicit
      labelDepth > 0 ||                             // wrapping <label>
      (id && forTargets.has(id)) ||                 // <label for>
      (tag !== "select" && /placeholder="/.test(attrs)); // weak, but a real name
    if (!named) NAMELESS.push(`${path.relative(ROOT, file)}: <${tag} name=${(attrs.match(/name="([^"]+)"/) || [])[1]}>`);
  }
}
check("every form control on every page has an accessible name",
  NAMELESS.length === 0,
  `${NAMELESS.length} nameless: ${NAMELESS.slice(0, 3).join("; ")}`);

// The homepage select is the one Lighthouse named, so it gets its own check --
// a count that drifts to zero is easy to miss, a named control is not.
const home = fs.readFileSync(path.join(ROOT, "site/index.html"), "utf8");
check("the homepage \"I'm looking to...\" select is named",
  /<select name="looking_to"[^>]*aria-label="[^"]+"/.test(home));

// --- 1b. the honeypot must not be autofillable --------------------------------
// 2026-08-26. Christine had zero leads and two form submissions that never
// reached her. The submissions turned out to be bots the honeypot correctly
// caught -- but the honeypot was a bare <input name="bot-field"> with no
// autocomplete and no tabindex, sitting one line above the real name/email/phone
// fields. Chrome and password managers autofill hidden inputs. If a real buyer's
// browser had filled that box, Netlify would have filed their enquiry as spam and
// nobody would ever have known, because a spam-filed lead is silent in every
// place she looks. A trapdoor under the only lead channel on the site.
const allPages = walk(path.join(ROOT, "site"));
const forms = allPages.filter((f) => /name="bot-field"/.test(fs.readFileSync(f, "utf8")));
const soft = forms.filter((f) => {
  const h = fs.readFileSync(f, "utf8");
  return /<input name="bot-field"(?![^>]*autocomplete="off")/.test(h)
      || /<input name="bot-field"(?![^>]*tabindex="-1")/.test(h);
});
check(`every honeypot is proof against browser autofill (${forms.length} pages)`,
  forms.length > 0 && soft.length === 0,
  `${soft.length} page(s) with a fillable honeypot, e.g. ${soft.slice(0, 2).map((f) => path.relative(ROOT, f)).join(", ")}`);

// --- 1c. the highest-intent page must offer a way in --------------------------
// /search-homes is where visitors actually spend time (58s average against 6s on
// the homepage), and it had no VISIBLE lead form at all -- both were inside
// modals reachable only by clicking into a specific listing. Someone scanning
// results had no way to raise their hand. Asserted as "not inside .lb-overlay"
// rather than by pixel position, because position is layout and this is about
// reachability.
const sh = fs.readFileSync(path.join(ROOT, "site/search-homes.html"), "utf8");
check("search-homes offers a lead form outside a modal",
  /class="section-dark center"[\s\S]{0,4000}class="lead-form"/.test(sh),
  "the only forms are modal-gated again — a scanner has no way to reach her");

// --- 1d. the phone number rides on every page ---------------------------------
// 2026-08-26 (Christine: "maybe large phone number at the top", "we just need to
// make them want to work with me"). A phone number is the lowest-friction ask on
// the site -- no form, no consent box, no waiting -- and there was not one above
// the fold anywhere. Site-wide rather than homepage-only because the engaged
// visitor is usually NOT on the homepage: 58s on /search-homes against 6s on the
// front door.
//
// The href and the visible text must carry the same digits. A voice-control user
// saying "303 709 4262" has to hit the thing they can see (WCAG 2.5.3), and it is
// the kind of detail a later edit to either half breaks silently.
const stripPages = allPages.filter((f) => /class="call-strip"/.test(fs.readFileSync(f, "utf8")));
check(`the call strip is on every page (${stripPages.length})`,
  stripPages.length === allPages.length,
  `${allPages.length - stripPages.length} page(s) without it`);
const mismatched = stripPages.filter((f) => {
  const h = fs.readFileSync(f, "utf8");
  const m = h.match(/<a href="tel:\+1(\d+)">([^<]+)<\/a>/);
  return !m || m[1] !== m[2].replace(/\D/g, "");
});
check("the dialled number matches the number shown",
  mismatched.length === 0,
  `${mismatched.length} page(s) where href and text disagree`);

// --- 1e. the homepage ask is actually reachable -------------------------------
// It used to sit second from last, 12.3 screens down an 18-screen page, on a page
// that holds people for six seconds. Now directly under the proof section. The
// threshold is deliberately loose (before the halfway point) -- this guards
// against it drifting back to the bottom, not against ordinary layout drift.
const main = home.slice(home.indexOf('<main id="main">'), home.indexOf("</main>"));
const askAt = main.indexOf("Tell Me What You&#39;re Trying To Do") >= 0
  ? main.indexOf("Tell Me What You&#39;re Trying To Do") : main.indexOf("Trying To Do");
check("the homepage ask sits in the first half of the page",
  askAt > 0 && askAt < main.length * 0.5,
  `ask is ${Math.round((askAt / main.length) * 100)}% of the way down the body`);
check("the homepage still has exactly one lead form",
  (main.match(/class="lead-form"/g) || []).length === 1,
  "one clear ask beats three competing ones — see build_home");

// --- 2. the pixel stays off the critical path --------------------------------
const buildPy = fs.readFileSync(path.join(ROOT, "build/build.py"), "utf8");
const pixel = (buildPy.match(/def _meta_pixel_tag\(\)[\s\S]*?\n\ndef /) || [""])[0];
check("the pixel script is injected only after a real interaction",
  /addEventListener\(x,G,\{once:!0,passive:!0\}\)/.test(pixel)
  && /pointerdown/.test(pixel) && /scroll/.test(pixel),
  "fbevents.js back on the critical path — this is the 92->70 regression");
check("a bounced visit still gets counted, via visibilitychange",
  /visibilityState==='hidden'\)G\(\)/.test(pixel));
// The queue shim is what makes the deferral lossless. If someone ever "simplifies"
// the snippet by dropping n.queue, every event before the first tap is silently
// discarded -- and nothing on the page would look broken.
check("the fbq queue shim still runs immediately, so no event is lost",
  /n\.queue=\[\]/.test(pixel) && /n\.queue\.push\(arguments\)/.test(pixel));
check("the pixel is still gated on META_PIXEL_ID",
  /if not META_PIXEL_ID:\s*\n\s*return ""/.test(buildPy));

console.log(failures ? `\n${failures} check(s) FAILED.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
