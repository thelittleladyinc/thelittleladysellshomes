// Cloudinary settings, read and described for /status -- and nothing else.
//
// 2026-09-30 (Signature move, part 1, docs/SIGNATURE-MOVE.md). This is the
// configuration half of the Signature repo's lib/_cloudinary.js, copied so the
// moved site-health.js can report on Cloudinary the same way. The other half --
// downloading MLS Grid photos and re-hosting them on Cloudinary -- is deliberately
// NOT here: that only ever ran inside the Signature sync's MLS Grid photo chores,
// and no MLS Grid call path moves to this site in this change. Unset (the normal
// state here), every row reads "not configured, optional".
//
// The comments below are carried over unchanged from the Signature copy.
"use strict";

// ---- THIS MUST RUN BEFORE require("cloudinary") -------------------------
// 2026-08-18, from a live crash on Christine's /site-health:
//
//   Error: Invalid CLOUDINARY_URL protocol. URL should begin with 'cloudinary://'
//       at module.exports (/var/task/node_modules/cloudinary/lib/config.js:110:13)
//       at Module._compile (node:internal/modules/cjs/loader:1871:14)
//
// The Cloudinary SDK reads process.env.CLOUDINARY_URL and THROWS while it is being
// required — at import time, before a single line of this file's own code runs.
// So the tolerant parser added earlier today was useless in the one case it was
// written for: Cloudinary's console shows the value as
// "CLOUDINARY_URL=cloudinary://..." and its copy button includes the prefix, and
// pasting that into Netlify took down every function that imports this module.
//
// listing-photo.js survived only because its Cloudinary import is lazy, which is
// the accident that kept photos on the page. site-health and sync-listings both
// went down — the health page that would have explained it, and the job that keeps
// the listings current.
//
// A misconfigured environment variable must never be able to crash a function.
// The value is normalised here, in place, before the SDK can see it; and if it is
// still not a connection string, it is removed from the environment entirely so
// the SDK loads unconfigured instead of throwing. Unconfigured is a state this
// codebase already handles everywhere — isCloudinaryConfigured() exists precisely
// for it, and the health page reports it in plain words.
(function normaliseCloudinaryUrlEnv() {
  const raw = (process.env.CLOUDINARY_URL || "").trim();
  if (!raw) return;
  const cleaned = raw
    .replace(/^CLOUDINARY_URL\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    // 2026-08-18, and this is the one that actually got her. Cloudinary's console
    // shows the value as
    //     cloudinary://<your_api_key>:<your_api_secret>@dcim65cok
    // so the obvious action is to replace the WORDS and leave the brackets, which
    // is exactly what happened: api_key came through as "<681436826781583>" and the
    // secret measured 29 characters — Cloudinary's 27, plus two brackets.
    //
    // It parsed, it configured, the cloud name was right, and Cloudinary answered
    // "unknown api_key" — a message that points at the account rather than at two
    // stray characters. Angle brackets are never valid in a key, a secret or a
    // cloud name, so they are simply removed.
    .replace(/[<>]/g, "")
    .trim();
  if (/^cloudinary:\/\//i.test(cleaned)) {
    if (cleaned !== raw) {
      console.warn("_cloudinary: CLOUDINARY_URL had a `CLOUDINARY_URL=` prefix or " +
        "surrounding quotes — that is exactly what Cloudinary's own console gives you " +
        "when you copy it. Using the connection string inside it.");
    }
    process.env.CLOUDINARY_URL = cleaned;
    return;
  }
  console.error("_cloudinary: CLOUDINARY_URL is set but is not a " +
    "cloudinary://<api_key>:<api_secret>@<cloud_name> string. Removing it from the " +
    "environment so the Cloudinary SDK does not throw on import — Cloudinary will " +
    "read as NOT CONFIGURED until the value is corrected.");
  delete process.env.CLOUDINARY_URL;
})();

// 2026-08-17. CLOUDINARY_URL is now accepted as a single variable, and preferred
// over the three separate ones, because three separate values is a shape that
// invites exactly the mistakes Christine hit twice this evening:
//
//   1. CLOUDINARY_CLOUD_NAME set to the API key's NAME ("Signature Property
//      Collection") rather than the cloud name. Reported as a cloud_name error.
//   2. An api_key from one key row paired with the api_secret from another.
//      Reported as "api_secret mismatch", which is accurate and tells you nothing
//      about WHICH of the two is wrong.
//
// Neither is carelessness. That console lists several keys, each with its own
// secret behind a reveal control, and nothing on the page stops you combining two
// rows. The three-variable shape makes a wrong combination possible at all.
//
// Cloudinary's own answer is the connection string, which it shows on that same
// page: cloudinary://<api_key>:<api_secret>@<cloud_name>. All three values, from
// one key, in one copyable string -- a matched set by construction. Paste it as
// CLOUDINARY_URL and the mismatch failure mode stops existing.
//
// The three separate vars still work and are still read when CLOUDINARY_URL is
// absent, so nothing that is already configured breaks.
function cloudinaryUrlParts() {
  let raw = (process.env.CLOUDINARY_URL || "").trim();
  if (!raw) return null;
  // 2026-08-18. Cloudinary's own API Keys page shows the value as
  //     CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
  // and its copy button hands you that whole line, prefix included. Pasting it
  // straight into Netlify — the obvious thing to do — produced a value this
  // parser rejected, at which point it fell back SILENTLY to the three separate
  // variables, which on this site still pointed at the previous cloud. The
  // result would have been Christine switching Cloudinary accounts, seeing no
  // error anywhere, and every photo still going to the old one.
  //
  // Tolerating the vendor's own copy format is not looseness. Strictness is still
  // enforced on the part that matters — the connection string itself — and the
  // failure this removes was invisible, which is the only kind worth this much
  // comment.
  raw = raw.replace(/^CLOUDINARY_URL\s*=\s*/i, "").trim();
  // Some consoles wrap the value in quotes when copied.
  raw = raw.replace(/^["']|["']$/g, "").trim();
  // And the placeholder brackets from Cloudinary's own template — see the note in
  // normaliseCloudinaryUrlEnv above. Stripped here as well as at import time,
  // because this parser is what every runtime read goes through and the two must
  // never disagree about what a value means.
  raw = raw.replace(/[<>]/g, "").trim();
  // Deliberately strict. A half-parsed connection string would configure the SDK
  // with something wrong and produce a confusing auth error two layers away --
  // which is the exact class of problem this exists to remove.
  const m = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([^/?\s]+)/i.exec(raw);
  if (!m) {
    console.warn("_cloudinary: CLOUDINARY_URL is set but is not a " +
      "cloudinary://<api_key>:<api_secret>@<cloud_name> string — ignoring it and " +
      "falling back to the three separate variables.");
    return null;
  }
  return { api_key: m[1], api_secret: m[2], cloud_name: m[3] };
}

function cloudinaryCredentials() {
  const fromUrl = cloudinaryUrlParts();
  if (fromUrl) return fromUrl;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  return { cloud_name, api_key, api_secret };
}

function isCloudinaryConfigured() {
  return !!cloudinaryCredentials();
}

// The cloud this deploy is configured to write to, or null. Exported because a
// stored URL is only a cache hit if it lives on the cloud we are still using.
function currentCloudName() {
  const c = cloudinaryCredentials();
  return (c && c.cloud_name) || null;
}

// The cloud a previously-stored Cloudinary URL actually lives on.
// Shape: https://res.cloudinary.com/<cloud_name>/image/upload/...
function cloudNameOfUrl(url) {
  const m = /^https?:\/\/res\.cloudinary\.com\/([^/]+)\//i.exec(String(url || ""));
  return m ? m[1] : null;
}

// What is ACTUALLY configured, described without revealing anything secret.
//
// 2026-08-18. Christine moved the site to its own Cloudinary account, the cloud
// name resolved correctly, and Cloudinary still answered "unknown api_key". She
// checked the credentials and reported they were right — at which point guessing
// from the outside had run out, and so had my three attempts at guessing for her.
//
// An api_key is not a secret: it is the public half of the pair and Cloudinary
// prints it in a table. So it can simply be shown, and compared against the
// console by eye. The secret is never shown — but its LENGTH is, because the
// failures that survive "I checked it" are almost always invisible ones: a
// truncated paste, a trailing newline the Netlify field does not render, a smart
// quote, a zero-width character. A length and a character-class check catch all
// of those, and none of them can be seen by looking harder at the value.
function cloudinaryDiagnostics() {
  const rawUrl = process.env.CLOUDINARY_URL || "";
  const creds = cloudinaryCredentials();
  const suspicious = (v) => {
    const str = String(v == null ? "" : v);
    return {
      length: str.length,
      hasLeadingOrTrailingSpace: str !== str.trim(),
      hasWhitespaceInside: /\s/.test(str.trim()),
      hasNonAscii: /[^\x20-\x7E]/.test(str),
      // Curly quotes and non-breaking spaces survive a copy-paste and look normal.
      hasSmartQuoteOrNbsp: /[\u2018\u2019\u201C\u201D\u00A0\u200B]/.test(str),
    };
  };
  return {
    source: rawUrl
      ? "CLOUDINARY_URL"
      : (process.env.CLOUDINARY_CLOUD_NAME ? "the three separate CLOUDINARY_* variables" : "nothing is set"),
    configured: !!creds,
    // Safe to print: this is the public half of the pair, shown in Cloudinary's
    // own table. Compare it against the API Keys page of the cloud below.
    cloudName: (creds && creds.cloud_name) || null,
    apiKey: (creds && creds.api_key) || null,
    apiKeyLooksNumeric: !!(creds && /^\d{10,}$/.test(String(creds.api_key || ""))),
    apiKeyChecks: suspicious(creds && creds.api_key),
    // Never the value. Cloudinary secrets are ~27 characters; anything far from
    // that is a truncated or partial paste.
    apiSecretLength: creds && creds.api_secret ? String(creds.api_secret).length : 0,
    apiSecretChecks: suspicious(creds && creds.api_secret),
    urlStartsWithScheme: /^cloudinary:\/\//i.test(rawUrl),
    urlLength: rawUrl.length,
    urlChecks: suspicious(rawUrl),
  };
}

module.exports = {
  isCloudinaryConfigured, cloudinaryDiagnostics, currentCloudName, cloudNameOfUrl,
  // Exported so site-health can report WHICH cloud is in use, and so the parsing
  // of CLOUDINARY_URL is testable rather than only reachable through an upload.
  cloudinaryCredentials,
};
