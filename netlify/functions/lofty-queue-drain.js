// Retries website leads Lofty refused, on this site's own schedule.
//
// 2026-09-30 (API audit). submission-created.js queues every lead Lofty refuses
// (lofty-failed-pushes.json in the "mls-listings" Blobs store, with the full lead)
// so it can be replayed -- but the only code that ever drained that queue is the
// Signature site's 30-minute sync. This site has no sync of its own, so unless its
// BLOBS_SITE_ID / BLOBS_TOKEN happen to point at the Signature store, a lead that
// failed during a Lofty hiccup was never retried: it lived only in the alert email
// and the Netlify Forms inbox.
//
// This runs the same drain the Signature sync uses (lib/_lofty.js
// drainFailedPushes: re-POST /v1.0/leads with tagsAdd, at most 3 per run, the lead
// dropped from the queue only once Lofty accepts it) on this site's own schedule
// (netlify.toml), offset from Signature's :00/:30 runs. If both sites do read the
// same store, the drain's lease makes one of them stand aside, so a lead is never
// replayed twice at once.
"use strict";
const { getStore } = require("@netlify/blobs");
const { getBlobStore } = require("./lib/_mls-shared");
const { drainFailedPushes } = require("./lib/_lofty");

const DIAG_STORE = "mls-listings";  // where submission-created.js queues them
// Netlify stops a scheduled function at 30 seconds. No replay starts, or runs,
// past this, so the queue is always written back.
const DRAIN_BUDGET_MS = 20000;

exports.handler = async () => {
  const apiKey = process.env.LOFTY_API_KEY;
  if (!apiKey) {
    console.log("lofty-queue-drain: LOFTY_API_KEY not set — nothing to retry with.");
    return { statusCode: 200, body: "no Lofty key configured" };
  }
  try {
    const store = getBlobStore(getStore, DIAG_STORE);
    const result = await drainFailedPushes(store, apiKey, { deadline: Date.now() + DRAIN_BUDGET_MS });
    if (result.attempted || result.locked) {
      console.log(`lofty-queue-drain: ${JSON.stringify(result)}`);
    }
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    // Nothing is lost: the queue stays as it was for the next run.
    console.error("lofty-queue-drain failed (queue kept for the next run):", err && err.message);
    return { statusCode: 200, body: "error logged" };
  }
};
