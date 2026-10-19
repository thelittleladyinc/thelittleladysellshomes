// RealScout "Home Value Alert" sign-up link on /free-home-valuation.html.
//
// 2026-10-18. RealScout's public Home Value Alert sign-up (a homeowner enters an
// address and gets a monthly home-value email) was linked only from the old
// how-much-is-my-northern-colorado-home-worth page, which now 301s to
// /free-home-valuation.html. build.py's _hva_signup_html() puts a short secondary
// block back, AFTER that page's lead form, behind the build setting
// HVA_SIGNUP_LINK (exactly "on", trimmed, any case). Pinned here:
//
//   1. the switch: anything but "on" gives nothing, so the page is byte for byte
//      what it was;
//   2. the address: REALSCOUT_HVA_SIGNUP_URL (else the default) is linked only
//      when it is https on realscout.com or a subdomain; anything else leaves the
//      block out instead of linking somewhere unexpected;
//   3. the page: switched on, exactly one link, on free-home-valuation.html only,
//      after the form and outside it, new tab with rel="noopener", the form and
//      every other page untouched; its click is the privacy-safe roi_cta_click
//      (CTA id + page path), never a lead/conversion event;
//   4. the built site/ (in tests/run-all.sh, the postprocessed output Netlify
//      publishes) agrees with the switch the build ran with.
//
// The generator is imported (build.py has a __main__ guard, so nothing is
// written) with page() captured, the same way test-metapixel.js imports it.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const DEFAULT_URL = "https://christinegwinnup.realscout.com/homesearch/home-reports?hva_public=true";
const PAGE = "/free-home-valuation.html";

// One fresh import per environment, so the test holds whether build.py reads the
// settings at import time or at call time.
function gen(env) {
  const e = { ...process.env };
  delete e.HVA_SIGNUP_LINK;
  delete e.REALSCOUT_HVA_SIGNUP_URL;
  Object.assign(e, env);
  const code = [
    "import importlib.util, json, sys",
    "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
    "pages = {}",
    "m.page = lambda title, description, path, active, body, *a, **k: pages.__setitem__(path, body)",
    "m.build_nav_pages()",
    "fn = getattr(m, '_hva_signup_html', None)",
    "print(json.dumps({'block': fn() if fn else None, 'pages': pages}))",
  ].join("\n");
  const r = spawnSync("python3", ["-I", "-W", "ignore", "-c", code], { cwd: ROOT, env: e, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-600) };
  try { return JSON.parse(r.stdout.split("\n").filter(Boolean).pop()); } catch (err) { return { error: `unparseable: ${r.stdout.slice(-200)}` }; }
}

// Every <a ...> pointing at realscout.com, with its attributes.
function realscoutLinks(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = (m[1].match(/\bhref="([^"]*)"/i) || [])[1] || "";
    if (/^https?:\/\/([a-z0-9-]+\.)*realscout\.com(\/|$|\?)/i.test(href)) {
      out.push({ at: m.index, tag: m[0], href,
        target: (m[1].match(/\btarget="([^"]*)"/i) || [])[1] || "",
        rel: (m[1].match(/\brel="([^"]*)"/i) || [])[1] || "",
        cta: (m[1].match(/\bdata-roi-cta="([^"]*)"/i) || [])[1] || "" });
    }
  }
  return out;
}
const formSpan = (html) => {
  const open = html.search(/<form\b[^>]*\bname="free-home-valuation"/i);
  const close = open < 0 ? -1 : html.indexOf("</form>", open);
  return { open, close };
};

console.log("1. The switch: exactly \"on\" (trimmed, any case), anything else gives nothing");
const off = gen({});
check("build.py imports and builds the nav pages", !off.error, off.error);
check("_hva_signup_html() exists", off.block !== null && off.block !== undefined, "missing from build/build.py");
check("unset: no block", off.block === "", JSON.stringify(off.block).slice(0, 120));
for (const v of ["", " ", "off", "OFF", "true", "1", "yes", "enabled", "onn", "o n", "on1", "\"on\""]) {
  const r = gen({ HVA_SIGNUP_LINK: v });
  check(`HVA_SIGNUP_LINK=${JSON.stringify(v)}: no block`, r.block === "", r.error || JSON.stringify(r.block).slice(0, 80));
}
for (const v of ["on", "ON", "On", " on ", "\ton\n"]) {
  const r = gen({ HVA_SIGNUP_LINK: v });
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`HVA_SIGNUP_LINK=${JSON.stringify(v)}: one link, to the default sign-up address`,
    links.length === 1 && links[0].href === DEFAULT_URL, r.error || JSON.stringify(links));
}

console.log("\n2. The address: https on realscout.com (or a subdomain) only");
const refused = [
  "http://christinegwinnup.realscout.com/homesearch/home-reports?hva_public=true",
  "https://example.com/homesearch/home-reports?hva_public=true",
  "https://realscout.com.example.com/x",
  "https://evilrealscout.com/x",
  "https://realscout.co/x",
  "https://realscout.com@example.com/x",
  "https://user@christinegwinnup.realscout.com/x",
  "https://christinegwinnup.realscout.com:8443/x",
  "https://christinegwinnup.realscout.com:443/x",
  "https://christinegwinnup.realscout.com/x\" onclick=\"alert(1)",
  "https://christinegwinnup.realscout.com/x'><script>",
  "https://christinegwinnup.realscout.com/a b",
  "https://christinegwinnup.realscout.com\\@example.com/",
  "https://christinegwinnup.realscout.com/é",
  "//christinegwinnup.realscout.com/x",
  "christinegwinnup.realscout.com/x",
  "javascript:alert(1)//realscout.com",
  "ftp://christinegwinnup.realscout.com/x",
];
for (const u of refused) {
  const r = gen({ HVA_SIGNUP_LINK: "on", REALSCOUT_HVA_SIGNUP_URL: u });
  check(`refused, block left out: ${JSON.stringify(u)}`, r.block === "", r.error || JSON.stringify(r.block).slice(0, 80));
  check("  ...and the page has no RealScout link", r.pages && realscoutLinks(r.pages[PAGE] || "").length === 0);
}
const accepted = [
  ["https://realscout.com/x", "https://realscout.com/x"],
  ["https://CHRISTINEGWINNUP.RealScout.com/homesearch/home-reports?hva_public=true", "https://CHRISTINEGWINNUP.RealScout.com/homesearch/home-reports?hva_public=true"],
  ["  https://christinegwinnup.realscout.com/homesearch/home-reports?hva_public=true&a=1  ", "https://christinegwinnup.realscout.com/homesearch/home-reports?hva_public=true&amp;a=1"],
];
for (const [u, want] of accepted) {
  const r = gen({ HVA_SIGNUP_LINK: "on", REALSCOUT_HVA_SIGNUP_URL: u });
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`accepted: ${JSON.stringify(u)}`, links.length === 1 && links[0].href === want, r.error || JSON.stringify(links));
}
for (const blank of ["", "   "]) {
  const r = gen({ HVA_SIGNUP_LINK: "on", REALSCOUT_HVA_SIGNUP_URL: blank });
  const links = r.block ? realscoutLinks(r.block) : [];
  check(`REALSCOUT_HVA_SIGNUP_URL=${JSON.stringify(blank)} falls back to the default`, links.length === 1 && links[0].href === DEFAULT_URL);
}
const custom = gen({ REALSCOUT_HVA_SIGNUP_URL: "https://realscout.com/x" });
check("an address alone does not switch it on", custom.block === "");

console.log("\n3. The page: after the form, outside it, new tab, nothing else changed");
const on = gen({ HVA_SIGNUP_LINK: "on" });
const offBody = (off.pages || {})[PAGE] || "";
const onBody = (on.pages || {})[PAGE] || "";
check("both builds produced free-home-valuation.html", !!offBody && !!onBody, off.error || on.error);
check("off: no RealScout link and no Home Value Alert copy on the page",
  realscoutLinks(offBody).length === 0 && !/Home Value Alert/i.test(offBody));
const links = realscoutLinks(onBody);
check("on: exactly one RealScout link on the page", links.length === 1, JSON.stringify(links));
const L = links[0] || {};
check("on: it is the https sign-up address", L.href === DEFAULT_URL && L.href.startsWith("https://"));
check("on: opens in a new tab", L.target === "_blank");
check("on: rel carries noopener", /(^|\s)noopener(\s|$)/.test(L.rel), L.rel);
check("on: its button reads \"Get My Home Value Alert\"", /Get My Home Value Alert<\/a>/.test(onBody.slice(L.at || 0, (L.at || 0) + 600)));
const { open, close } = formSpan(onBody);
check("on: the free-home-valuation form is still there", open >= 0 && close > open);
check("on: the link comes after the form, not above or inside it", close > 0 && L.at > close, `form ${open}-${close}, link ${L.at}`);
check("on: the form markup is identical to the off build",
  open >= 0 && onBody.slice(open, close) === offBody.slice(formSpan(offBody).open, formSpan(offBody).close));
check("on: the page is the off page plus the block, appended after the form's section",
  onBody === offBody + on.block && /<\/form>\s*<\/div>\s*<\/section>\s*$/.test(offBody));
check("on: the block is the only addition and holds no form, input or heading",
  !/<(form|input|h[1-6])\b/i.test(on.block || "x"));
const others = Object.keys(off.pages || {}).filter((p) => p !== PAGE);
check("every other nav page is identical with the switch on", others.length > 0 &&
  others.every((p) => (on.pages || {})[p] === off.pages[p]), others.filter((p) => (on.pages || {})[p] !== off.pages[p]).join(", "));
check("no other nav page links to RealScout's Home Value Alert", others.every((p) => !/hva_public|home-reports/.test((on.pages || {})[p])));
// The click is counted by the ROI client's existing [data-roi-cta] listener,
// which sends only the CTA id and the page path. No lead/conversion event.
check("on: the link carries a data-roi-cta id", /^[a-z0-9-]+$/.test(L.cta || ""), L.cta);
const roi = fs.readFileSync(path.join(ROOT, "build", "postprocess_roi_conversion.py"), "utf8");
check("the ROI client's [data-roi-cta] listener sends only cta_id + page_path",
  /closest\('\[data-roi-cta\]'\)[\s\S]{0,200}gtag\('event', 'roi_cta_click', \{cta_id: el\.getAttribute\('data-roi-cta'\) \|\| 'unknown', page_path: location\.pathname \|\| '\/'\}\)/.test(roi));
check("the block fires no lead or conversion event",
  !/generate_lead|fbq|gtag|onclick|<script/i.test(on.block || ""));

console.log("\n4. The built site/ agrees with the switch the build ran with");
const builtFile = path.join(ROOT, "site", "free-home-valuation.html");
if (!fs.existsSync(builtFile)) {
  check("site/free-home-valuation.html exists (run tests/run-all.sh)", false);
} else {
  const built = fs.readFileSync(builtFile, "utf8");
  const switchedOn = (process.env.HVA_SIGNUP_LINK || "").trim().toLowerCase() === "on";
  const bl = realscoutLinks(built);
  const bf = formSpan(built);
  if (!switchedOn) {
    check("switch off: no RealScout link and no Home Value Alert copy on the built page",
      bl.length === 0 && !/Home Value Alert|hva_public/i.test(built), JSON.stringify(bl));
    const hits = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".html") && /hva_public|home-value-alert-signup/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(ROOT, p));
      }
    })(path.join(ROOT, "site"));
    check("switch off: no built page carries the sign-up link", hits.length === 0, hits.slice(0, 5).join(", "));
  } else {
    check("switch on: exactly one RealScout link on the built page", bl.length === 1, JSON.stringify(bl));
    check("switch on: https, new tab, noopener, after the form",
      bl.length === 1 && bl[0].href.startsWith("https://") && bl[0].target === "_blank" &&
      /(^|\s)noopener(\s|$)/.test(bl[0].rel) && bf.close > 0 && bl[0].at > bf.close);
  }
}

// The page date is decided by comparing each built page with its committed copy,
// and the committed site/ is built with the switch off. Switched on in Netlify,
// the block must not date the page "today" on every deploy (CLAUDE.md, Freshness).
console.log("\n5. Switching it on doesn't make the page look edited");
const normalize = (html) => {
  const r = spawnSync("python3", ["-I", "-W", "ignore", "-c", [
    "import sys",
    "sys.path.insert(0, 'build')",
    "import postprocess_audit_fixes as p",
    "sys.stdout.write(p._normalize_for_change_detection(sys.stdin.read()))",
  ].join("\n")], { cwd: ROOT, input: html, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : `ERROR ${r.stderr}`;
};
if (fs.existsSync(builtFile) && on.block) {
  const built = fs.readFileSync(builtFile, "utf8");
  const offPage = built.split(on.block).join("");
  const at = offPage.indexOf("</section>\n", formSpan(offPage).close);
  const onPage = at < 0 ? "" : offPage.slice(0, at + 11) + on.block + offPage.slice(at + 11);
  check("the built page without the block has no sign-up link", realscoutLinks(offPage).length === 0);
  check("the same page with the block compares equal", !!onPage && normalize(onPage) === normalize(offPage));
  check("the form is still there after the comparison's clean-up", /name="free-home-valuation"/.test(normalize(onPage)));
  const edited = onPage.replace(/<h1([^>]*)>/, "<h1$1>Edited ");
  check("a real edit to the page still counts", edited !== onPage && normalize(edited) !== normalize(offPage));
  const otherLede = onPage.replace("Rather keep an eye on it yourself?", "Rather watch it yourself?");
  check("the clean-up is the block only: other copy in its place still counts",
    normalize(otherLede.replace('data-roi-cta="home-value-alert-signup"', 'data-roi-cta="something-else"')) !== normalize(offPage));
} else {
  check("site/free-home-valuation.html and the generated block are available", false);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
