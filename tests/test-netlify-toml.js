// netlify.toml must be valid TOML -- no table or key declared twice.
//
// 2026-09-30. PR #56 was squash-merged into main, and a later branch still
// carrying #56's original commits merged cleanly as far as git was concerned --
// but git added the [functions."lofty-queue-drain"] schedule a SECOND time.
// TOML forbids declaring a table (or a key) twice, so Netlify's build would have
// refused the file, while every other suite here passed: they read netlify.toml
// with regular expressions, which do not care. This parses it the way a strict
// TOML parser does (Python's tomllib, the same standard Netlify's parser follows)
// and fails on any duplicate.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");

let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };

// Parse a TOML file with tomllib; returns { ok, error, data }.
function parse(file) {
  const r = spawnSync("python3", ["-c", [
    "import json, sys, tomllib",
    "try:",
    "    d = tomllib.load(open(sys.argv[1], 'rb'))",
    "except tomllib.TOMLDecodeError as e:",
    "    print(json.dumps({'ok': False, 'error': str(e)})); sys.exit(0)",
    "print(json.dumps({'ok': True, 'data': d}, default=str))",
  ].join("\n"), file], { encoding: "utf8" });
  if (r.status !== 0) return { ok: false, error: `python3 failed: ${r.stderr || r.error}` };
  return JSON.parse(r.stdout);
}

const tomlPath = path.join(ROOT, "netlify.toml");
const toml = fs.readFileSync(tomlPath, "utf8");

console.log("\n1. The checker catches what it is for");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tll-toml-"));
const dupTable = path.join(tmp, "dup-table.toml");
fs.writeFileSync(dupTable, '[functions."lofty-queue-drain"]\n  schedule = "15,45 * * * *"\n\n[functions."lofty-queue-drain"]\n  schedule = "15,45 * * * *"\n');
check("a table declared twice is rejected", parse(dupTable).ok === false);
const dupKey = path.join(tmp, "dup-key.toml");
fs.writeFileSync(dupKey, '[build]\n  publish = "site"\n  publish = "site"\n');
check("a key declared twice is rejected", parse(dupKey).ok === false);
fs.rmSync(tmp, { recursive: true, force: true });

console.log("\n2. netlify.toml");
const res = parse(tomlPath);
check("parses as strict TOML (no table or key declared twice)", res.ok === true, res.error);
if (res.ok) {
  const d = res.data;
  check("[build] publishes site/ through the production build script",
    d.build && d.build.publish === "site" && d.build.command === "bash scripts/netlify-build.sh");
  check("functions live in netlify/functions", d.functions && d.functions.directory === "netlify/functions");
  check("the lead-queue drain is scheduled, once",
    d.functions["lofty-queue-drain"] && d.functions["lofty-queue-drain"].schedule === "15,45 * * * *" &&
    (toml.match(/^\[functions\."lofty-queue-drain"\]/gm) || []).length === 1);
  const scheduled = Object.entries(d.functions).filter(([, v]) => v && typeof v === "object" && v.schedule).map(([k]) => k);
  check("and it is the only scheduled function (no MLS Grid job here)", scheduled.join(",") === "lofty-queue-drain", scheduled.join(","));
  check("the listing shell is bundled with the functions",
    Array.isArray(d.functions.included_files) && d.functions.included_files.includes("netlify/functions/lib/_listing-page-shell.html"));
  check("/listing/:id is one rule, to this site's listing-page function",
    (d.redirects || []).filter((r) => r.from === "/listing/:id").length === 1 &&
    (d.redirects || []).find((r) => r.from === "/listing/:id").to === "/.netlify/functions/listing-page?id=:id");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED\n`);
process.exit(failures ? 1 : 0);
