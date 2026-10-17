// The hub-versus-Signature town comparison (build/tools/town-market-compare.js).
//
// 2026-10-13 (Town Figures Parity, draft A1). Before the town pages switch to the
// hub, the two copies must agree town by town. This pins the script that checks it:
//   - identical files are CLEAN (exit 0); a figure more than 5% apart, a figure on
//     one side only, or a town on one side only is NOT CLEAN (exit 1), listed;
//   - a town spelled differently on the two sides is named as a likely pair;
//   - it writes nothing: build/data/town_market.json is byte-identical afterwards;
//   - reading the hub, it never prints the key or the address, and a refusal or a
//     missing setting is exit 2, naming the setting only.
// Nothing here calls a live API: the hub is a loopback server on 127.0.0.1.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOL = path.join(ROOT, "build", "tools", "town-market-compare.js");
const DATA = path.join(ROOT, "build", "data", "town_market.json");
const { compareTowns, report, fold } = require(TOOL);
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

const doc = (towns, generated_at = "2026-10-12") => ({ generated_at, source: "IRES MLS", min_sample: 5, towns });
const BASE = {
  Loveland: { active: 600, median_list: 525000, median_price_per_sqft: 285 },
  Berthoud: { active: 120, median_list: 640000, median_price_per_sqft: 300 },
  "La Salle": { active: 20, median_list: 420000, median_price_per_sqft: null },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TOOL, ...args], { cwd: ROOT, env: { PATH: process.env.PATH, ...env } });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
}

(async () => {
  console.log("\n1. The comparison");
  let r = compareTowns(doc(BASE), doc(clone(BASE)));
  check("identical files are clean", r.clean && r.counts.both === 3 && r.off.length === 0);

  const hub = clone(BASE);
  hub.Loveland.median_list = 525000 * 1.06;          // 6% apart
  hub.Berthoud.median_list = 640000 * 1.049;         // inside 5%
  hub.Berthoud.median_price_per_sqft = null;         // on one side only
  delete hub["La Salle"];
  hub.LaSalle = { active: 21, median_list: 421000, median_price_per_sqft: null };
  hub.Timnath = { active: 40, median_list: 700000, median_price_per_sqft: 310 };
  r = compareTowns(doc(BASE), doc(hub));
  const offKeys = r.off.map((o) => `${o.town}:${o.field}`).sort();
  check("a figure more than 5% apart is listed, one inside 5% is not",
    offKeys.includes("Loveland:median_list") && !offKeys.includes("Berthoud:median_list"), offKeys.join(","));
  check("a figure on one side only is listed", offKeys.includes("Berthoud:median_price_per_sqft"));
  check("towns on one side only are listed, both ways",
    r.onlySig.join() === "La Salle" && r.onlyHub.join() === "LaSalle,Timnath", `${r.onlySig} / ${r.onlyHub}`);
  check("a town spelled differently is named as a likely pair",
    r.spelling.length === 1 && r.spelling[0].signature === "La Salle" && r.spelling[0].hub === "LaSalle");
  check("...folding covers case, spacing and Ft/Fort", fold("Ft Lupton") === fold("Fort Lupton") && fold("LA SALLE") === fold("LaSalle"));
  check("not clean", !r.clean);
  const text = report(r).join("\n");
  check("the report says NOT CLEAN and shows the percentage", /NOT CLEAN/.test(text) && /\+6\.0%/.test(text), text);

  console.log("\n2. The script, from saved files");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tm-compare-"));
  const sigFile = path.join(tmp, "sig.json");
  const hubFile = path.join(tmp, "hub.json");
  fs.writeFileSync(sigFile, JSON.stringify(doc(BASE)));
  fs.writeFileSync(hubFile, JSON.stringify(doc(BASE)));
  const before = fs.readFileSync(DATA);
  let res = await run(["--hub-file", hubFile, "--sig-file", sigFile], {});
  check("clean -> exit 0, says CLEAN", res.code === 0 && /CLEAN: the same towns/.test(res.out), `${res.code} ${res.out}`);
  fs.writeFileSync(hubFile, JSON.stringify(doc(hub)));
  res = await run(["--hub-file", hubFile, "--sig-file", sigFile], {});
  check("differences -> exit 1, listed", res.code === 1 && /Loveland, median asking price/.test(res.out), `${res.code} ${res.out}`);
  res = await run(["--hub-file", path.join(tmp, "missing.json"), "--sig-file", sigFile], {});
  check("an unreadable file -> exit 2", res.code === 2 && /Could not compare/.test(res.out), `${res.code} ${res.out}`);
  check("it wrote nothing: build/data/town_market.json is byte-identical", Buffer.compare(before, fs.readFileSync(DATA)) === 0);

  console.log("\n3. The script, reading the hub (a loopback fake)");
  const KEY = "hubkey-SENTINEL-compare-7d2e";
  let status = 200;
  const seen = [];
  const server = http.createServer((req, resp) => {
    seen.push({ url: req.url, key: req.headers["x-hub-key"] });
    resp.writeHead(status, { "content-type": "application/json" });
    resp.end(status === 200 ? JSON.stringify(doc(BASE)) : JSON.stringify({ error: "nope" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/functions/v1/hub-api`;
  const env = { HUB_API_URL: base, HUB_APP_KEY: KEY };
  res = await run(["--sig-file", sigFile], env);
  check("asks GET /v1/market/towns with the key header, and compares", res.code === 0 &&
    seen.length === 1 && seen[0].url === "/functions/v1/hub-api/v1/market/towns" && seen[0].key === KEY, `${res.code} ${res.out}`);
  check("never prints the key or the address", !res.out.includes(KEY) && !res.out.includes(base) && !res.out.includes("127.0.0.1"));
  status = 401;
  res = await run(["--sig-file", sigFile], env);
  check("a refused key -> exit 2, naming the setting, not its value",
    res.code === 2 && /HUB_APP_KEY/.test(res.out) && !res.out.includes(KEY), `${res.code} ${res.out}`);
  server.close();
  res = await run(["--sig-file", sigFile], {});
  check("no hub settings and no --hub-file -> exit 2, naming both settings",
    res.code === 2 && /HUB_API_URL and HUB_APP_KEY are not set/.test(res.out), `${res.code} ${res.out}`);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
