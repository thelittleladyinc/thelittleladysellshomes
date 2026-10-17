#!/usr/bin/env node
//
// Town by town: the hub's figures against Signature's current file.
//
// 2026-10-13 (Town Figures Parity, draft A1). Before the town pages switch to the
// hub (docs/HUB-TOWN-STATS.md, switch-on step 1), and weekly while both copies
// run, the two must agree town by town: the same towns, and for each one the
// homes for sale, the median asking price and the price per square foot within
// 5 percent. Until now that was a snippet to paste by hand, and it compared only
// the counts. This is the same check as a script, for every figure the pages
// print.
//
// READ-ONLY. It writes nothing (build/data/town_market.json is never touched),
// prints only figures and town names, and never prints HUB_APP_KEY or
// HUB_API_URL. No figure here is published anywhere.
//
// USAGE
//   HUB_API_URL=... HUB_APP_KEY=... node build/tools/town-market-compare.js
//       the hub's GET /v1/market/towns (the call `town-market-stats.js --source
//       hub` makes, without its write) against Signature's published file (the
//       URL the default refresh copies from; TOWN_MARKET_URL overrides it)
//   node build/tools/town-market-compare.js --hub-file hub.json --sig-file town_market.json
//       either side from a saved file instead (no key needed for a saved hub answer)
//
// Exit 0: clean (no town on one side only, every figure within tolerance).
// Exit 1: differences, listed. Exit 2: could not compare (named, never a value).
//
// Town names are compared exactly as each side spells them. Where a town is on
// one side only and a folded spelling ("La Salle" / "LaSalle", case, "Ft" for
// "Fort") is on the other, the pair is listed as a likely spelling difference --
// the hub's alias table (draft A2) is the fix for those, and this script is the
// before-and-after check for it.
"use strict";

const fs = require("fs");

const TOLERANCE = 0.05;
const FIELDS = [
  ["active", "homes for sale"],
  ["median_list", "median asking price"],
  ["median_price_per_sqft", "price per sq ft"],
];

function fold(name) {
  return String(name || "").toLowerCase()
    .replace(/\bft\.?(?=\s)/g, "fort")
    .replace(/\bmt\.?(?=\s)/g, "mount")
    .replace(/[^a-z0-9]/g, "");
}

function townsOf(doc, label) {
  if (!doc || typeof doc !== "object" || !doc.towns || typeof doc.towns !== "object" || Array.isArray(doc.towns)) {
    throw new Error(`${label} has no towns object`);
  }
  return doc.towns;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The comparison itself: plain data in, plain data out (tests drive this).
function compareTowns(sigDoc, hubDoc, opts) {
  const tol = opts && typeof opts.tolerance === "number" ? opts.tolerance : TOLERANCE;
  const sig = townsOf(sigDoc, "Signature's file");
  const hub = townsOf(hubDoc, "the hub's answer");
  const sigNames = Object.keys(sig);
  const hubNames = Object.keys(hub);
  const onlySig = sigNames.filter((t) => !(t in hub)).sort();
  const onlyHub = hubNames.filter((t) => !(t in sig)).sort();
  const hubByFold = new Map(onlyHub.map((t) => [fold(t), t]));
  const spelling = onlySig.filter((t) => hubByFold.has(fold(t))).map((t) => ({ signature: t, hub: hubByFold.get(fold(t)) }));
  const off = [];
  const both = sigNames.filter((t) => t in hub).sort();
  for (const town of both) {
    for (const [field, label] of FIELDS) {
      const a = num(sig[town] && sig[town][field]);
      const b = num(hub[town] && hub[town][field]);
      if (a === null && b === null) continue;
      if (a === null || b === null) {
        off.push({ town, field, label, signature: a, hub: b, pct: null });
        continue;
      }
      const pct = a === 0 ? (b === 0 ? 0 : Infinity) : (b - a) / a;
      if (Math.abs(pct) > tol) off.push({ town, field, label, signature: a, hub: b, pct });
    }
  }
  return {
    tolerance: tol,
    generated: { signature: sigDoc.generated_at || null, hub: hubDoc.generated_at || null },
    counts: { signature: sigNames.length, hub: hubNames.length, both: both.length },
    onlySig, onlyHub, spelling, off,
    clean: onlySig.length === 0 && onlyHub.length === 0 && off.length === 0,
  };
}

function money(field, v) {
  if (v === null) return "none";
  return field === "active" ? String(v) : "$" + Math.round(v).toLocaleString("en-US");
}

function report(r) {
  const pct = Math.round(r.tolerance * 100);
  const lines = [
    `Signature's file: ${r.counts.signature} towns, generated ${r.generated.signature || "(no date)"}`,
    `The hub:          ${r.counts.hub} towns, generated ${r.generated.hub || "(no date)"}`,
    `On both sides:    ${r.counts.both} towns`,
    "",
    `Only in Signature's file (${r.onlySig.length}): ${r.onlySig.join(", ") || "none"}`,
    `Only in the hub (${r.onlyHub.length}): ${r.onlyHub.join(", ") || "none"}`,
  ];
  for (const s of r.spelling) lines.push(`  likely the same town spelled differently: "${s.signature}" (Signature) / "${s.hub}" (hub)`);
  lines.push("", `Figures more than ${pct}% apart, or on one side only (${r.off.length}):`);
  if (!r.off.length) lines.push("  none");
  for (const o of r.off) {
    const diff = o.pct === null ? "on one side only" : `${o.pct > 0 ? "+" : ""}${(o.pct * 100).toFixed(1)}%`;
    lines.push(`  ${o.town}, ${o.label}: Signature ${money(o.field, o.signature)}, hub ${money(o.field, o.hub)} (${diff})`);
  }
  lines.push("", r.clean
    ? `CLEAN: the same towns, every figure within ${pct}%.`
    : "NOT CLEAN: explain or fix every line above before the town pages switch to the hub.");
  return lines;
}

function argValue(argv, name) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name) return i + 1 < argv.length ? argv[i + 1] : "";
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return undefined;
}

async function main(argv, env) {
  const tool = require("./town-market-stats.js");
  const secrets = [env.HUB_APP_KEY, env.HUB_API_URL].map((v) => String(v || "").trim()).filter((v) => v.length >= 6);
  const scrub = (m) => secrets.reduce((acc, v) => acc.split(v).join("[hidden]"), String(m));
  const fail = (m) => { console.error(scrub("!! Could not compare: " + m + ".")); return 2; };
  const readJson = (p, label) => {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { throw new Error(`${label} could not be read as JSON`); }
  };

  let hubDoc;
  let sigDoc;
  try {
    const hubFile = argValue(argv, "--hub-file");
    if (hubFile !== undefined) {
      hubDoc = readJson(hubFile, "--hub-file");
    } else {
      hubDoc = await tool.fetchHub({ env, fetchImpl: fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    }
    const sigFile = argValue(argv, "--sig-file");
    sigDoc = sigFile !== undefined ? readJson(sigFile, "--sig-file") : await tool.fetchPublished();
  } catch (err) {
    return fail((err && err.message) || "unexpected error");
  }
  let result;
  try {
    result = compareTowns(sigDoc, hubDoc);
  } catch (err) {
    return fail(err.message);
  }
  for (const line of report(result)) console.log(scrub(line));
  return result.clean ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => process.exit(code), (err) => {
    console.error("!! Could not compare: unexpected " + ((err && err.name) || "error") + ".");
    process.exit(2);
  });
}

module.exports = { compareTowns, report, fold, TOLERANCE, main };
