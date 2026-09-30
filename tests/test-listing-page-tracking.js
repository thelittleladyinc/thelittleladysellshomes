// /listing/<id> pages are this site's pages: its template, its tracking, its
// canonical -- and no other agent's name.
//
// 2026-09-30 (Signature move, part 1, docs/SIGNATURE-MOVE.md). Listing pages used
// to be rendered by the Signature site into a hand-copied snapshot of this site's
// shell (lib/_listing-page-shell-tllsh.html there, from 2026-08-19) with NO Google
// Analytics and NO Meta Pixel, and a canonical on signaturepropertycollection.com.
// Once switched on, listing-page.js renders here, into the shell build.py
// regenerates on every deploy (write_listing_page_shell) from the same head() as
// every other page -- which carries GA4 and the Pixel whenever GA_MEASUREMENT_ID /
// META_PIXEL_ID are set, as they are in production. This suite builds that shell
// the way Netlify does (with both IDs), renders a listing into it, and pins:
//   - gtag.js and the Meta Pixel are on the page;
//   - canonical and og:url are the listing's URL on www.thelittleladysellshomes.com;
//   - the RealEstateListing schema is there;
//   - no Signature domain, and no co-agent name or phone, anywhere on it.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const FN_DIR = path.join(ROOT, "netlify", "functions");
const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const GA = "G-TEST1234567";
const PIXEL = "785995940287531";

// 1. The shell, generated as Netlify generates it -- into a scratch folder, so the
//    committed shell is not touched.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tll-shell-"));
execFileSync("python3", ["-c", [
  "import importlib.util, os, sys",
  "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  `m.HERE = os.path.join(${JSON.stringify(tmp)}, 'build')`,
  "m.write_listing_page_shell()",
].join("\n")], { cwd: ROOT, env: { ...process.env, GA_MEASUREMENT_ID: GA, META_PIXEL_ID: PIXEL }, stdio: "pipe" });
const shellPath = path.join(tmp, "netlify", "functions", "lib", "_listing-page-shell.html");
const shell = fs.readFileSync(shellPath, "utf8");

console.log("\n1. The shell a production build writes");
check("it loads gtag.js with the site's GA4 ID", shell.includes(`googletagmanager.com/gtag/js?id=${GA}`));
check("it carries the Meta Pixel", shell.includes(`fbq('init','${PIXEL}')`) && shell.includes("connect.facebook.net/en_US/fbevents.js"));
check("canonical and og:url are slots the listing fills",
  /<link rel="canonical" href="\{\{CANONICAL\}\}">/.test(shell) && /<meta property="og:url" content="\{\{CANONICAL\}\}">/.test(shell));
const buildPy = fs.readFileSync(path.join(ROOT, "build", "build.py"), "utf8");
check("and every build regenerates it (the build's __main__ calls write_listing_page_shell)",
  /^\s+write_listing_page_shell\(\)\s*$/m.test(buildPy.slice(buildPy.indexOf('if __name__ == "__main__":'))));

// 2. A listing rendered into it, by the copied listing-page code.
const NOW = new Date().toISOString();
const PIC = "https://img.chime.me/image/fs01/mls-listing/20260827/21/original_IRE1000004-cover.jpeg";
const HERS = { listingId: "IRE1000004", address: "4 Main St", city: "Loveland", state: "CO", zip: "80537",
  price: 900000, beds: 4, baths: 3, sqft: 3100, status: "Active", agentName: "Christine Gwinnup",
  coAgentName: "A Co-Listing Agent", officeName: "LPT Realty", photo: PIC, photos: [PIC], remarks: "Hers." };
const store = {
  get: async (k) => ({ "lofty-listings.json": { IRE1000004: HERS }, "lofty-sync-state.json": { lastRunAt: NOW, lastSuccessAt: NOW } })[k] || null,
  setJSON: async () => {}, list: async () => ({ blobs: [] }),
};
require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: { getStore: () => store } };
for (const k of Object.keys(require.cache)) {
  if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
}
process.env.IDX_DISPLAY = "on";
delete process.env.LISTINGS_SOURCE;
process.env.BLOBS_SITE_ID = "s";
process.env.BLOBS_TOKEN = "t";

(async () => {
  // Serve the production shell to the function in place of the committed one.
  const realRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (String(p).endsWith(path.join("lib", "_listing-page-shell.html"))) return shell;
    return realRead.call(fs, p, ...rest);
  };
  const lp = require(path.join(FN_DIR, "listing-page.js"));
  const res = await lp.localHandler({ queryStringParameters: { id: "IRE1000004" }, path: "/listing/IRE1000004" });
  fs.readFileSync = realRead;
  const page = res.body;

  console.log("\n2. A listing page, rendered here");
  check("it renders", res.statusCode === 200, String(res.statusCode));
  check("with GA4 and the Meta Pixel", page.includes(`gtag/js?id=${GA}`) && page.includes(`fbq('init','${PIXEL}')`));
  check("canonical on this site", page.includes('<link rel="canonical" href="https://www.thelittleladysellshomes.com/listing/IRE1000004">'),
    (page.match(/<link rel="canonical"[^>]*>/) || [])[0]);
  check("og:url too", page.includes('<meta property="og:url" content="https://www.thelittleladysellshomes.com/listing/IRE1000004">'));
  check("titled for this site", /<title>4 Main St, Loveland — \$900,000 \| The Little Lady Sells Homes<\/title>/.test(page),
    (page.match(/<title>[^<]*<\/title>/) || [])[0]);
  check("RealEstateListing schema, with its URL on this site",
    /"@type":"RealEstateListing","url":"https:\/\/www\.thelittleladysellshomes\.com\/listing\/IRE1000004"/.test(page));
  // The sitewide agent schema still lists the Signature homepage among her
// profiles (build.py LEGACY_PROFILES, dropped once that domain 301s -- a later
// phase); nothing on the page itself may point there.
check("nothing on the page points at the Signature domain (no link, canonical, image or search)",
  !/(href|src|content|action)="https?:\/\/(www\.)?signaturepropertycollection/i.test(page) &&
  !/utm_source=signaturepropertycollection/.test(page));
  check("her name and number, and no one else's", /Christine Gwinnup/.test(page) && /303-709-4262/.test(page) &&
    !/kendra|571-0525|5710525/i.test(page));
  check("its search links go through this site's own search page", /href="\/search-homes\.html\?cities=Loveland"/.test(page));

  // 3. The committed shell (a build without the IDs) is still this site's.
  const committed = fs.readFileSync(path.join(FN_DIR, "lib", "_listing-page-shell.html"), "utf8");
  console.log("\n3. The committed shell and the function source");
  check("the committed shell has no other agent's name or number", !/kendra|571-0525|5710525/i.test(committed));
  const src = fs.readFileSync(path.join(FN_DIR, "listing-page.js"), "utf8");
  check("listing-page.js never mentions another agent", !/kendra|571-0525|5710525/i.test(src));
  check("its canonical domain is this site", /const SITE_DOMAIN = "https:\/\/www\.thelittleladysellshomes\.com";/.test(src));
  check("and it reads the one shell this site generates (no brand=tllsh copy)",
    !fs.existsSync(path.join(FN_DIR, "lib", "_listing-page-shell-tllsh.html")) && !/_listing-page-shell-tllsh/.test(src));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
