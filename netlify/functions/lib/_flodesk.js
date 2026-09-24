// Newsletter sign-ups -> Flodesk, into the county segment the subscriber picked.
//
// 2026-09-24. The newsletter form on /newsletter.html reached Lofty (as every
// form does) but never reached Flodesk, which is where the newsletter is actually
// sent from -- so a person who asked for the newsletter was never on the list.
//
// API usage mirrors what already works against her Flodesk account elsewhere
// (homebuyer-funnel lib/flodeskClient.ts, sellerintelligence
// src/integrations/flodesk-sync.ts):
//   * Basic auth, API key as the username and an empty password.
//   * POST /v1/subscribers creates-or-updates by email.
//   * Segments are a SEPARATE call, POST /v1/subscribers/{id}/segments with
//     { segment_ids: [...] }. sellerintelligence found that segment_ids in the
//     create body is silently ignored, so it is not relied on here.
//
// Fail-soft by construction: syncNewsletterSignup() never throws and never
// rejects, has its own timeout, and submission-created.js runs it alongside the
// Lofty path rather than in front of it. A Flodesk outage, a bad key or a missing
// segment costs the Flodesk step only; the lead still reaches Lofty and the alert
// email still goes out.
//
// Configuration lives in Netlify env vars (never in the repo):
//   FLODESK_API_KEY              -- required; without it this step is skipped
//   FLODESK_SEGMENT_LARIMER      -- segment ID for Larimer County subscribers
//   FLODESK_SEGMENT_WELD         -- segment ID for Weld County subscribers
//   FLODESK_SEGMENT_BOULDER      -- segment ID for Boulder County subscribers
//   FLODESK_SEGMENT_NEWSLETTER   -- fallback segment: "somewhere else", no
//                                   answer, or a county whose own var is unset
// With the key set but no segment IDs, the subscriber is still added to the
// Flodesk audience, just not to a segment.

const FLODESK_BASE = "https://api.flodesk.com/v1";
const TIMEOUT_MS = 8000;

// Forms whose whole purpose is the newsletter.
const NEWSLETTER_FORMS = new Set(["newsletter-signup"]);

// County -> the env var holding that county's segment ID.
const COUNTY_SEGMENT_ENV = {
  larimer: "FLODESK_SEGMENT_LARIMER",
  weld: "FLODESK_SEGMENT_WELD",
  boulder: "FLODESK_SEGMENT_BOULDER",
};
const DEFAULT_SEGMENT_ENV = "FLODESK_SEGMENT_NEWSLETTER";

// The county the subscriber chose on the form; failing that, the county of the
// /communities/<county>/... page they arrived on or signed up from.
function resolveCounty(data) {
  const picked = String((data && data.county) || "").trim().toLowerCase();
  if (COUNTY_SEGMENT_ENV[picked]) return picked;
  for (const p of [data && data.attribution_form_page, data && data.attribution_first_page]) {
    const m = /^\/communities\/([a-z-]+)(?:[/.]|$)/.exec(String(p || ""));
    if (m && COUNTY_SEGMENT_ENV[m[1]]) return m[1];
  }
  return null;
}

function segmentFor(county, env) {
  const countyEnv = county ? COUNTY_SEGMENT_ENV[county] : null;
  const specific = countyEnv ? String(env[countyEnv] || "").trim() : "";
  if (specific) return { segmentId: specific, segmentEnv: countyEnv };
  const fallback = String(env[DEFAULT_SEGMENT_ENV] || "").trim();
  if (fallback) return { segmentId: fallback, segmentEnv: DEFAULT_SEGMENT_ENV };
  return { segmentId: null, segmentEnv: null };
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0], last_name: parts.length > 1 ? parts.slice(1).join(" ") : undefined };
}

async function syncNewsletterSignup(formName, data, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || ((...a) => fetch(...a));
  if (!NEWSLETTER_FORMS.has(formName)) return { attempted: false, reason: "not a newsletter form" };
  const apiKey = String(env.FLODESK_API_KEY || "").trim();
  if (!apiKey) return { attempted: false, reason: "FLODESK_API_KEY not set" };
  const email = String((data && data.email) || "").trim();
  if (!email) return { attempted: false, reason: "no email on the submission" };

  const county = resolveCounty(data);
  const { segmentId, segmentEnv } = segmentFor(county, env);
  const headers = {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
    "User-Agent": "TheLittleLadySellsHomes-Website/1.0",
  };
  const base = { attempted: true, county, segmentEnv };
  try {
    const res = await fetchImpl(`${FLODESK_BASE}/subscribers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, ...splitName(data.name) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ...base, ok: false, step: "subscriber", httpStatus: res.status };
    if (!segmentId) return { ...base, ok: true, step: "subscriber", note: "no segment env var set" };
    const sub = await res.json().catch(() => null);
    const id = (sub && sub.id) || email;
    const seg = await fetchImpl(`${FLODESK_BASE}/subscribers/${encodeURIComponent(id)}/segments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ segment_ids: [segmentId] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ...base, ok: !!seg.ok, step: "segment", httpStatus: seg.status };
  } catch (err) {
    return { ...base, ok: false, error: String((err && err.message) || err).slice(0, 200) };
  }
}

// For the handler: takes the raw Netlify event, never throws or rejects.
function newsletterFromEvent(event, opts) {
  let formName = "";
  let data = {};
  try {
    const payload = JSON.parse(event.body);
    formName = (payload && payload.payload && payload.payload.form_name) || "";
    data = (payload && payload.payload && payload.payload.data) || {};
  } catch (e) {
    return Promise.resolve({ attempted: false, reason: "unreadable submission" });
  }
  return syncNewsletterSignup(formName, data, opts).catch((err) => ({
    attempted: true, ok: false, error: String((err && err.message) || err).slice(0, 200),
  }));
}

module.exports = {
  syncNewsletterSignup, newsletterFromEvent, resolveCounty, segmentFor,
  COUNTY_SEGMENT_ENV, DEFAULT_SEGMENT_ENV, NEWSLETTER_FORMS,
};
