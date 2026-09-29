// A deploy doesn't make every page look edited (2026-09-29).
//
// The page date is decided by comparing each built page with its committed copy
// (postprocess_audit_fixes._meaningful_date). Production builds carry the
// analytics tags -- GA, the Meta Pixel, Search Console verification -- because
// those IDs are Netlify environment variables, and the committed site/ is built
// without them. So on Netlify every page differed from its committed copy on
// every deploy: the live sitemap on 2026-09-29 dated 719 of 735 pages "today",
// blog posts from October 2024 included. CLAUDE.md, Freshness rule 2: an
// analytics change must not make pages look newly edited.
//
// This builds the production-only tags exactly as build.py emits them with the
// variables set, adds them to real built pages, and checks the comparison can't
// see them -- while a real edit still counts.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const env = { ...process.env, GA_MEASUREMENT_ID: "G-TEST12345", META_PIXEL_ID: "785995940287531", GSC_VERIFICATION: "test-verification-token" };
const tags = JSON.parse(execFileSync("python3", ["-c", [
  "import importlib.util, json, sys",
  "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  "sys.stdout.write(json.dumps({'gsc': m._gsc_verification_tag(), 'ga': m._analytics_tag(), 'pixel': m._meta_pixel_tag()}))",
].join("\n")], { cwd: ROOT, env, encoding: "utf8" }));
const hints = '<link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>\n' +
  '<link rel="dns-prefetch" href="https://connect.facebook.net">\n';

const normalize = (html) => execFileSync("python3", ["-c", [
  "import sys",
  "sys.path.insert(0, 'build')",
  "import postprocess_audit_fixes as p",
  "sys.stdout.write(p._normalize_for_change_detection(sys.stdin.read()))",
].join("\n")], { cwd: ROOT, input: html, encoding: "utf8" });

console.log("\n1. The production-only tags are real (built with the variables set)");
check("GA tag built", /googletagmanager\.com\/gtag\/js\?id=G-TEST12345/.test(tags.ga));
check("Meta Pixel built", /fbq\('init','785995940287531'\)/.test(tags.pixel) && /<noscript>/.test(tags.pixel));
check("Search Console verification built", /google-site-verification/.test(tags.gsc));

console.log("\n2. They don't make a page look edited");
const blogDir = path.join(SITE, "blog");
const samples = ["index.html", "about.html", "rent-to-own.html",
  path.join("blog", fs.readdirSync(blogDir).find((f) => f.endsWith(".html") && f !== "index.html"))];
for (const rel of samples) {
  const page = fs.readFileSync(path.join(SITE, rel), "utf8");
  const production = page.replace("</head>", `${hints}${tags.gsc}\n${tags.ga}\n${tags.pixel}\n</head>`);
  check(`${rel}: same page with the production analytics tags compares equal`, normalize(page) === normalize(production));
}

console.log("\n3. A real edit still counts");
const about = fs.readFileSync(path.join(SITE, "about.html"), "utf8");
const edited = about.replace(/<h1([^>]*)>/, "<h1$1>Edited ");
check("changed copy is still a change", edited !== about && normalize(about) !== normalize(edited));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures ? 1 : 0);
