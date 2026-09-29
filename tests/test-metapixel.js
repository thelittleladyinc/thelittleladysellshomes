// The thank-you page loads the Meta Pixel straight away (2026-09-29).
//
// Everywhere else fbevents.js waits for the visitor's first scroll, tap, key or
// pointer (2026-08-26: injecting it at once cost the mobile score 92 -> 70; see
// test-formlabels.js section 2). But since 2026-09-24 the confirmed conversion
// fires on the thank-you page LOAD, and a visitor who reads "thank you" and
// closes the tab never scrolls -- the conversion sat in the queue until the
// hidden-tab path, which a closing tab doesn't wait for. This runs the snippet
// as Netlify builds it (with a pixel ID) against a fake page and pins:
//   - ordinary pages still load nothing from Facebook during page load;
//   - the first interaction loads it exactly once, with init/PageView queued;
//   - a background tab that turns visible and is then left still loads it
//     (visibilitychange is no longer `once`);
//   - /thank-you(.html|/) loads it immediately; lookalike paths don't.
// Same test as Signature's tests/test-metapixel.js.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const PID = "785995940287531";
// Import build.py (it has a __main__ guard, so nothing is built) with the pixel on.
const tag = execFileSync("python3", ["-c", [
  "import importlib.util, sys",
  "spec = importlib.util.spec_from_file_location('spc_build', 'build/build.py')",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  "sys.stdout.write(m._meta_pixel_tag())",
].join("\n")], { cwd: ROOT, env: { ...process.env, META_PIXEL_ID: PID, GA_MEASUREMENT_ID: "" }, encoding: "utf8" });
const js = (tag.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";

function page(pathname) {
  const listeners = {};
  const inserted = [];
  const document = {
    visibilityState: "visible",
    createElement: (tagName) => ({ tagName }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (el) => inserted.push(el) } }],
    addEventListener: (type, fn, opts) => { (listeners[type] = listeners[type] || []).push({ fn, once: !!(opts && opts.once) }); },
  };
  // The page's global object IS window, as in a browser: the snippet sets
  // window.fbq and then calls the bare global fbq(...).
  const window = vm.createContext({ location: { pathname }, document });
  window.window = window;
  const fire = (type) => {
    const ls = listeners[type] || [];
    listeners[type] = ls.filter((l) => !l.once);
    for (const l of ls) l.fn({ target: null });
  };
  vm.runInContext(js, window);
  return { window, document, inserted, fire };
}

console.log("\n1. The snippet as Netlify builds it");
check("a pixel ID produces a snippet", js.length > 0 && tag.includes(`fbq('init','${PID}')`));
check("the noscript fallback is still there", tag.includes(`tr?id=${PID}&ev=PageView&noscript=1`));

console.log("\n2. An ordinary page loads nothing from Facebook until a person does something");
let p = page("/");
check("no script is inserted during page load", p.inserted.length === 0, `${p.inserted.length} inserted`);
const queued = (p.window.fbq && p.window.fbq.queue) || [];
check("init and PageView are queued, waiting for it", queued.length === 2 &&
  queued[0][0] === "init" && queued[0][1] === PID && queued[1][0] === "track" && queued[1][1] === "PageView",
  JSON.stringify(queued.map((a) => [...a])));
p.fire("scroll");
check("the first scroll loads fbevents.js", p.inserted.length === 1 && /connect\.facebook\.net\/en_US\/fbevents\.js$/.test(p.inserted[0].src));
p.fire("pointerdown"); p.fire("keydown");
check("...exactly once", p.inserted.length === 1, `${p.inserted.length} inserted`);
for (const ev of ["pointerdown", "keydown", "touchstart"]) {
  const q = page("/communities/loveland.html");
  q.fire(ev);
  check(`a ${ev} loads it too`, q.inserted.length === 1);
}

console.log("\n3. Visitors who never interact still count");
p = page("/");
p.document.visibilityState = "hidden"; p.fire("visibilitychange");
check("leaving the tab (hidden) loads it", p.inserted.length === 1);
p = page("/");
p.document.visibilityState = "visible"; p.fire("visibilitychange");
check("a background tab turning visible doesn't load it...", p.inserted.length === 0);
p.document.visibilityState = "hidden"; p.fire("visibilitychange");
check("...and doesn't use up the listener: leaving afterwards still loads it", p.inserted.length === 1);

console.log("\n4. The thank-you page loads it straight away");
for (const tp of ["/thank-you.html", "/thank-you", "/thank-you/"]) {
  check(`${tp}: loaded during page load`, page(tp).inserted.length === 1);
}
check("a page that merely starts with thank-you is an ordinary page", page("/thank-you-notes.html").inserted.length === 0);
check("so is a thank-you page somewhere else", page("/blog/thank-you.html").inserted.length === 0);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
