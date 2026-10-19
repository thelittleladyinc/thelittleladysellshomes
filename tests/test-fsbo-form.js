// "Selling it yourself?" -- the FSBO form (2026-10-18), OFF unless FSBO_FORM is "on".
//
// Christine: "Also add a 'Selling it yourself?' form to thelittleladysellshomes and
// my-lead-pages that tags Funnel - FSBO and Source - Website." This pins:
//
//   1. the switch: exactly "on" (spaces and case forgiven), anything else is off,
//      and off renders nothing at all (build/build.py fsbo_section_for);
//   2. the form: this site's one lead form (honeypot, the exact consent pair,
//      /thank-you.html?from=fsbo-inquiry), the property address and an optional
//      "how far along" choice -- about the property and the timing, never the
//      people -- and copy with no fee, commission, lender or "best" claims;
//   3. the built site/ this suite runs against: off = no page carries the form;
//      on = only the FSBO guide page does, with the attribution fields;
//   4. freshness: the form never re-dates the guide (it is not an edit to it);
//   5. analytics: a submit sends the form name only, never what was typed;
//   6. Lofty: "Source - Website" with the form's tags on the create, "Funnel - FSBO"
//      (her FSBO Smart Plan) added AFTER the create and only for a contact proven
//      new, the Seller lead type, texting off unless the site's own explicit-yes
//      box was ticked, and Do Not Contact / email opt-out holding the plan tag.
//
// The byte-for-byte proof that the switch off changes nothing in site/ is a full
// build before and after (docs/FSBO-FORM.md, "How it was tested"): too slow for a
// suite that runs on every build, so section 1 pins the one place the output can
// change instead.
//
// Nothing here calls Lofty or the hub: fetch is a fake that records every request.
"use strict";
process.exitCode = 1;
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const FN_DIR = `${ROOT}/netlify/functions`;
const SITE_DIR = path.join(ROOT, "site");
let failures = 0;
const check = (l, c, x) => { if (c) console.log(`  ok   ${l}`); else { failures++; console.log(`  FAIL ${l}${x ? ` — ${x}` : ""}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const FORM = "fsbo-inquiry";
const GUIDE = "for-sale-by-owner-northern-colorado-fsbo.html";
const FUNNEL_TAG = "Funnel - FSBO";
const SOURCE_TAG = "Source - Website";
const EN_DASH = String.fromCharCode(0x2013);
const SELLER = 1;

// ---- build.py, loaded with the switch set as given -------------------------
function py(code, fsbo) {
  const env = { ...process.env };
  if (fsbo === undefined) delete env.FSBO_FORM; else env.FSBO_FORM = fsbo;
  const r = spawnSync("python3", ["-I", "-c", code], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { error: (r.stderr || "").slice(-600) };
  try { return JSON.parse(r.stdout.split("\n").filter(Boolean).pop()); } catch (e) { return { error: `unparseable: ${r.stdout.slice(-200)}` }; }
}
const LOAD = [
  "import importlib.util, json",
  "spec = importlib.util.spec_from_file_location('tll_build', 'build/build.py')",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
].join("\n");
const generated = (fsbo) => py(`${LOAD}\nprint(json.dumps({'on': m.FSBO_FORM_ON, 'page': m.FSBO_FORM_PAGE, ` +
  `'guide': m.fsbo_section_for(m.FSBO_FORM_PAGE), 'other': m.fsbo_section_for('/sellers'), ` +
  `'home': m.fsbo_section_for('/'), 'section': m.fsbo_form_section(), 'consent': m.consent_boxes_html(), ` +
  `'stages': [v for v, _ in m.FSBO_STAGES], 'name': m.FSBO_FORM_NAME, 'id': m.FSBO_SECTION_ID}))`, fsbo);

const visible = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
const fieldNames = (html) => [...html.matchAll(/<(input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/g)].map((m) => m[2]);
const fieldTag = (html, name) => (html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bname="${name}"[^>]*>`)) || [""])[0];

const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".html")) out.push(p); } return out; };

(async () => {
  console.log("\n1. The switch, and what build.py renders with it");
  const off = generated(undefined);
  check("build.py loads (switch unset)", !off.error, off.error);
  if (!off.error) {
    check("unset: the switch is off", off.on === false);
    check("unset: nothing is rendered for the FSBO guide, or any other page", off.guide === "" && off.other === "" && off.home === "");
  }
  for (const v of ["off", "yes", "true", "1", "", "onn", "o n", "enabled"]) {
    const r = generated(v);
    check(`FSBO_FORM=${JSON.stringify(v)}: off, nothing rendered`, !r.error && r.on === false && r.guide === "", r.error || JSON.stringify({ on: r.on }));
  }
  const on = generated(" On ");
  check("FSBO_FORM=\" On \" (spaces and case forgiven): on", !on.error && on.on === true, on.error);
  if (!on.error) {
    const sec = on.guide;
    check("on: the section is rendered for the FSBO guide page only", sec.length > 0 && on.other === "" && on.home === "");
    check("on: it is the FSBO guide that already exists (no new URL)", on.page === "/for-sale-by-owner-northern-colorado-fsbo");
    check("the section carries the marker the freshness check removes", sec.includes(`<section class="tight" id="${on.id}">`) && on.id === "selling-it-yourself");
    check("heading: \"Selling It Yourself?\"", /<h2 class="section-title">Selling It Yourself\?<\/h2>/.test(sec));
    const forms = [...sec.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    check("exactly one form", forms.length === 1, String(forms.length));
    const f = forms[0] || "";
    check("the site's lead form: class lead-form, Netlify, honeypot", /class="lead-form"/.test(f) && /data-netlify="true"/.test(f) &&
      /netlify-honeypot="bot-field"/.test(f) && sec.includes('name="bot-field"'));
    check(`named ${FORM}, with its own hidden form-name`, on.name === FORM && /\bname="fsbo-inquiry"/.test(f) &&
      sec.includes('<input type="hidden" name="form-name" value="fsbo-inquiry">'));
    check("confirmed success goes to /thank-you.html?from=fsbo-inquiry (the only place a lead is counted)",
      /action="\/thank-you\.html\?from=fsbo-inquiry"/.test(f) && /method="POST"/.test(f));
    check("the consent pair is the site's one, verbatim (consent_boxes_html())", on.consent && sec.includes(on.consent));
    check("the Terms box is required, the text box is optional and unticked",
      /name="terms_agree" value="yes" required/.test(sec) && /name="sms_consent" value="yes">/.test(sec) && !/sms_consent[^>]*(checked|required)/.test(sec));
    check("fields: name, email, phone, property address, how far along (+ form-name, honeypot, the two boxes)",
      same(fieldNames(sec).sort(), ["bot-field", "email", "form-name", "fsbo_stage", "name", "phone", "property_address", "sms_consent", "terms_agree"]),
      JSON.stringify(fieldNames(sec)));
    check("the property address is required", / required/.test(fieldTag(sec, "property_address")));
    check("\"how far along\" is optional and says so", !/required/.test(fieldTag(sec, "fsbo_stage")) && /\(optional\)/.test(fieldTag(sec, "fsbo_stage")) &&
      /<option value="">[^<]*skip it<\/option>/.test(sec));
    const submission = fs.readFileSync(`${FN_DIR}/submission-created.js`, "utf8");
    const noteStages = Object.keys(new Function(`return ${submission.match(/const FSBO_STAGES = Object\.freeze\((\{[\s\S]*?\})\);/)[1]}`)());
    check("its choices are the ones the Lofty note puts into words", same(on.stages, noteStages) &&
      on.stages.every((v) => sec.includes(`<option value="${v}">`)), JSON.stringify({ build: on.stages, note: noteStages }));
    const words = visible(sec);
    // Fair housing: the property and the timing, never the people (CLAUDE.md).
    const PEOPLE = /\b(famil(y|ies)|kids?|child(ren)?|married|spouse|husband|wife|partner|age|aged|senior|retire\w*|religio\w*|church|disab\w*|veteran|military|race|ethnic\w*|national origin|household|who (will )?lives?|how many people|single|divorc\w*|widow\w*|pregnan\w*)\b/i;
    check("asks nothing about the people (fair housing)", !PEOPLE.test(words), (words.match(PEOPLE) || [])[0]);
    // CLAUDE.md claims rules + Christine's brief: no fee/commission promises, no lender, no "best".
    const CLAIMS = /\b(best|top|#1|number one|commissions?|fees?|discount\w*|percent|save money|lenders?|loans?|mortgage|guarantee\w*|free)\b|%/i;
    check("no fee, commission, lender, discount, guarantee or \"best\" claim", !CLAIMS.test(words), (words.match(CLAIMS) || [])[0]);
    check("no phone number but Christine's appears in it", !/\d{3}[-. )]\d{3}[-.]\d{4}/.test(words.replace(/303-709-4262/g, "")));
    check("no script, and no analytics call of its own (the site's form-name-only events do the counting)",
      !/<script|gtag|fbq|dataLayer/i.test(sec));
  }

  console.log("\n2. The built site/ this suite runs against");
  const pages = walk(SITE_DIR);
  const carrying = pages.filter((p) => /name="fsbo-inquiry"/.test(fs.readFileSync(p, "utf8"))).map((p) => path.relative(SITE_DIR, p));
  const guidePath = path.join(SITE_DIR, GUIDE);
  check("the FSBO guide page exists at its .html address", fs.existsSync(guidePath));
  const builtOn = String(process.env.FSBO_FORM || "").trim().toLowerCase() === "on";
  const guideHtml = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, "utf8") : "";
  if (!builtOn) {
    check("switch off (as built here): no page carries the FSBO form", carrying.length === 0, carrying.join(", "));
    check("switch off: no page carries the section or the form name anywhere", !pages.some((p) => {
      const h = fs.readFileSync(p, "utf8"); return h.includes("selling-it-yourself") || h.includes(FORM);
    }));
    check("switch off: the FSBO guide still has no form at all", guideHtml && !/<form\b/.test(guideHtml));
  } else {
    check("switch on (as built here): only the FSBO guide carries the form", same(carrying, [GUIDE]), carrying.join(", "));
    check("switch on: the ROI gate gave it the static attribution fields",
      ["attribution_first_page", "attribution_form_page", "attribution_source", "utm_source"].every((n) => guideHtml.includes(`name="${n}"`)));
    check("switch on: its fields have visible labels", /<span class="field-label">Property address<\/span>/.test(guideHtml) &&
      /<span class="field-label">How far along are you\? \(optional\)<\/span>/.test(guideHtml));
  }
  const sitemap = fs.readFileSync(path.join(SITE_DIR, "sitemap.xml"), "utf8");
  check("the guide is in the sitemap once, at its .html address (no new URL either way)",
    (sitemap.match(/for-sale-by-owner-northern-colorado-fsbo\.html<\/loc>/g) || []).length === 1 && !/selling-it-yourself/.test(sitemap));
  const redirects = fs.readFileSync(path.join(SITE_DIR, "_redirects"), "utf8");
  check("no redirect mentions the form or the section", !/fsbo-inquiry|selling-it-yourself/.test(redirects));

  console.log("\n3. Freshness: the form never re-dates the guide");
  if (!on.error && guideHtml) {
    const normalize = (html) => {
      const r = spawnSync("python3", ["-I", "-c", ["import sys", "sys.path.insert(0, 'build')", "import postprocess_audit_fixes as p",
        "sys.stdout.write(p._normalize_for_change_detection(sys.stdin.read()))"].join("\n")], { cwd: ROOT, input: html, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      return r.status === 0 ? r.stdout : `ERROR ${r.stderr}`;
    };
    const plain = guideHtml.replace(/\n?<section class="tight" id="selling-it-yourself">[\s\S]*?<\/section>/, "");
    const anchor = plain.indexOf("\n<section", plain.indexOf("blog-article"));
    const withForm = anchor > 0 ? plain.slice(0, anchor) + "\n" + on.guide.replace(/^\n/, "") + plain.slice(anchor) : "";
    check("a guide with the form compares equal to the guide without it", withForm && !normalize(plain).startsWith("ERROR") &&
      normalize(plain) === normalize(withForm));
    const edited = plain.replace(/<h1([^>]*)>/, "<h1$1>Edited ");
    check("a real edit to the guide still counts", edited !== plain && normalize(plain) !== normalize(edited));
    const other = plain.replace(/<h1([^>]*)>/, '<h1$1><section class="tight" id="something-else">x</section>');
    check("only the marked FSBO section is ignored, nothing else", normalize(plain) !== normalize(other));
  }

  console.log("\n4. Analytics: the form name only, never what was typed");
  const PII = ["Pat Seller", "pat.seller@example.com", "(970) 555-0100", "12 Oak Dr, Loveland, CO 80538"];
  const assetDir = path.join(SITE_DIR, "assets", "js");
  const asset = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).find((f) => /^analytics-events\.[0-9a-f]+\.js$/.test(f)) : null;
  check("the site's analytics script is built", Boolean(asset));
  const fakeForm = {
    matches: () => true, id: "", className: "lead-form", classList: { contains: (c) => c === "lead-form" },
    getAttribute: (n) => (n === "name" ? FORM : n === "action" ? `/thank-you.html?from=${FORM}` : null),
    elements: { name: { value: PII[0] }, email: { value: PII[1] }, phone: { value: PII[2] }, property_address: { value: PII[3] } },
  };
  const runSubmit = (code) => {
    const events = []; const handlers = []; const store = {};
    const window = { gtag: (...a) => events.push(["ga", ...a]), fbq: (...a) => events.push(["meta", ...a]) };
    const ctx = { window, location: { pathname: `/${GUIDE}`, href: `https://www.thelittleladysellshomes.com/${GUIDE}`, origin: "https://www.thelittleladysellshomes.com" },
      document: { addEventListener: (type, fn) => handlers.push([type, fn]) },
      sessionStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] || null, removeItem: (k) => { delete store[k]; } },
      URL, JSON, Date, decodeURIComponent };
    vm.runInNewContext(code, ctx);
    for (const [type, fn] of handlers) if (type === "submit") fn({ target: fakeForm, defaultPrevented: false });
    return { events, store };
  };
  if (asset) {
    const { events } = runSubmit(fs.readFileSync(path.join(assetDir, asset), "utf8"));
    check("a submit sends one lead_form_attempt carrying the form name only",
      events.length === 1 && same(events[0], ["ga", "event", "lead_form_attempt", { form_name: FORM }]), JSON.stringify(events));
    check("nothing typed into the form reaches analytics", !PII.some((v) => JSON.stringify(events).includes(v)));
  }
  const markerScript = (guideHtml.match(/<script>[^<]*tll_lead_submit[\s\S]*?<\/script>/) || [""])[0].replace(/^<script>|<\/script>$/g, "");
  check("the guide page leaves the confirmed-lead marker (the thank-you page counts the lead)", Boolean(markerScript));
  if (markerScript) {
    const { events, store } = runSubmit(markerScript);
    const mark = JSON.parse(store.tll_lead_submit || "null");
    check("the marker holds the form name and a time, nothing typed", mark && mark.form === FORM && typeof mark.t === "number" &&
      same(Object.keys(mark).sort(), ["form", "t"]) && events.length === 0, JSON.stringify(store));
  }
  const ty = fs.readFileSync(path.join(SITE_DIR, "thank-you.html"), "utf8");
  const leadScript = [...ty.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('"generate_lead"'));
  check("the thank-you page's conversion script is there", Boolean(leadScript));
  if (leadScript) {
    const events = [];
    const store = { tll_lead_submit: JSON.stringify({ form: FORM, t: Date.now() - 2000 }) };
    const window = { location: { search: `?from=${FORM}` }, gtag: (...a) => events.push(["ga", ...a]),
      sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } } };
    vm.runInNewContext(leadScript, { URLSearchParams, JSON, Date, window, location: window.location, document: { getElementById: () => null, readyState: "complete", addEventListener: () => {} } });
    check("a confirmed FSBO submit counts once as generate_lead, with the form name only",
      events.length === 1 && same(events[0], ["ga", "event", "generate_lead", { form_name: FORM }]), JSON.stringify(events));
    const direct = [];
    const w2 = { location: { search: `?from=${FORM}` }, gtag: (...a) => direct.push(a), sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
    vm.runInNewContext(leadScript, { URLSearchParams, JSON, Date, window: w2, location: w2.location, document: { getElementById: () => null, readyState: "complete", addEventListener: () => {} } });
    check("a direct visit to /thank-you.html?from=fsbo-inquiry counts nothing", direct.length === 0);
  }

  console.log("\n5. Lofty: the tags, the plan and the lead type");
  const P = require(`${FN_DIR}/lib/_form-plans.js`);
  check(`the plan tag is "${FUNNEL_TAG}", character for character (plain ASCII hyphen, as Christine typed it)`,
    P.PLAN_TAGS.FSBO === FUNNEL_TAG && P.PLAN_TAGS.FSBO.length === 13 && /^[\x20-\x7e]+$/.test(P.PLAN_TAGS.FSBO) && !P.PLAN_TAGS.FSBO.includes(EN_DASH));
  for (const site of ["main", "signature"]) {
    const r = P.planForSubmission(FORM, {}, { site });
    check(`${site}: ${FORM} starts the FSBO plan with the Seller lead type`, r.plan === "FSBO" && same(r.planTags, [FUNNEL_TAG]) && same(r.leadTypes, [SELLER]));
    const v = P.planForSubmission(FORM, {}, { site, valueReviewPlan: true });
    check(`${site}: the value-review switch does not move it`, same(v.planTags, [FUNNEL_TAG]) && same(v.leadTypes, [SELLER]));
  }

  // A fake Lofty (the same shape as tests/test-form-plans.js): GET /v1.0/leads/{id}
  // answers { lead: { tags: [{ tagName }] } }; a PUT replaces the fields it carries.
  const NEWID = "1149000000000001";
  const EXISTING = "1148639689762408";
  const resp = (status, body) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) };
  };
  function fakeLofty({ emailHits = [], phoneHits = [], searchStatus = 200, leads = {} } = {}) {
    const f = { log: [], posts: [], puts: [], leads: JSON.parse(JSON.stringify(leads)) };
    f.fetch = async (url, init = {}) => {
      const s = String(url); const m = init.method || "GET";
      const p = s.replace(/^https:\/\/(api\.lofty\.com|hub\.example\.test\/functions\/v1\/hub-api)/, "").split("?")[0];
      const body = init.body ? JSON.parse(init.body) : null;
      f.log.push({ m, p, body });
      if (/hub\.example\.test/.test(s)) return resp(200, { status: "sent", provider_id: "e1" });
      if (m === "GET" && /\/v1\.0\/leads\?/.test(s)) {
        if (searchStatus !== 200) return resp(searchStatus, "down");
        return resp(200, { leads: /email=/.test(s) ? emailHits : phoneHits });
      }
      if (m === "POST" && /\/v1\.0\/leads$/.test(s)) {
        f.posts.push(body);
        const id = emailHits.length ? EXISTING : NEWID;
        if (!f.leads[id]) f.leads[id] = { tags: [...(body.tags || body.tagsAdd || [])], phones: body.phones || [], cannotText: true };
        return resp(200, `{"data":{"leadId": ${id}}}`);
      }
      if (/\/notes$/.test(s)) return f.leads[String(body.leadId)] ? resp(200, "{}") : resp(404, { message: "errorCode=20006,errorMsg=Lead not exist" });
      if (/\/v2\.0\/tasks$/.test(s)) return resp(200, `{"taskId": 77}`);
      if (/send-task-reminder$/.test(s)) return resp(200, { message: "ok" });
      if (/listCustomField/.test(s)) return resp(200, { data: [] });
      if (/custom-field$/.test(s)) return resp(200, "{}");
      if (/\/inquiry$/.test(s)) return resp(200, "{}");
      const one = s.match(/\/v1\.0\/leads\/(\d+)$/);
      if (one && m === "GET") {
        const l = f.leads[one[1]];
        if (!l) return resp(404, { message: "errorCode=20006,errorMsg=Lead not exist" });
        return resp(200, { lead: { leadId: Number(one[1]), phones: l.phones || [], cannotText: l.cannotText, cannotEmail: l.cannotEmail,
          tags: l.tags.map((t) => ({ tagName: t, tagId: 1 })) } });
      }
      if (one && m === "PUT") {
        const l = f.leads[one[1]];
        f.puts.push({ id: one[1], body, before: l ? [...l.tags] : null, at: f.log.length - 1 });
        if (l) Object.assign(l, body);
        return resp(200, "{}");
      }
      return resp(404, `unexpected ${m} ${s}`);
    };
    return f;
  }

  const blobsPath = require.resolve("@netlify/blobs", { paths: [FN_DIR] });
  const mem = {};
  const pushes = [];
  require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: {
    getStore: () => ({
      get: async (k) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : null),
      setJSON: async (k, v, o) => {
        if (o && o.onlyIfNew && k in mem) return { modified: false };
        if (k === "lofty-last-push.json") pushes.push(v);
        mem[k] = JSON.parse(JSON.stringify(v));
        return { modified: true };
      },
      delete: async (k) => { delete mem[k]; },
      list: async () => ({ blobs: [] }),
    }),
  } };
  for (const k of Object.keys(require.cache)) if (k.startsWith(FN_DIR) && k !== blobsPath && !k.endsWith(".json")) delete require.cache[k];
  process.env.LOFTY_API_KEY = "k";
  process.env.HUB_API_URL = "https://hub.example.test/functions/v1/hub-api"; process.env.HUB_API_KEY = "hub_test";
  for (const k of ["FLODESK_API_KEY", "LOFTY_VIA_HUB", "LEADS_TO_ROUTER", "VALUE_REVIEW_PLAN", "WEBSITE_TO_HUB_INTAKE"]) delete process.env[k];
  const handler = require(`${FN_DIR}/submission-created.js`).handler;
  const last = () => pushes[pushes.length - 1] || {};
  const quiet = async (fn) => {
    const keep = [console.log, console.warn, console.error];
    const lines = [];
    console.log = console.warn = console.error = (...a) => lines.push(a.join(" "));
    try { const r = await fn(); return { r, lines }; } finally { [console.log, console.warn, console.error] = keep; }
  };
  const seller = (extra) => ({ name: "Pat Seller", email: "pat.seller@example.com", phone: "(970) 555-0100",
    property_address: "12 Oak Dr, Loveland, CO 80538", fsbo_stage: "preparing", terms_agree: "yes", ...extra });
  async function submit(f, data) {
    global.fetch = f.fetch;
    for (const k of Object.keys(mem)) delete mem[k];
    return quiet(() => handler({ body: JSON.stringify({ payload: { form_name: FORM, id: "sub-1", data: seller(data) } }) }));
  }
  const createTags = (b) => [...((b && b.tags) || []), ...((b && b.tagsAdd) || [])];
  const funnelPuts = (f) => f.puts.filter((p) => Array.isArray(p.body.tags) && p.body.tags.includes(FUNNEL_TAG));

  console.log("\n5a. A new contact");
  let f = fakeLofty();
  let out = await submit(f, {});
  let create = f.posts[0] || {};
  check("one create, after the email and phone lookups", f.posts.length === 1 &&
    f.log.findIndex((c) => c.m === "POST" && c.p === "/v1.0/leads") > f.log.findIndex((c) => c.m === "GET" && c.p === "/v1.0/leads"));
  check(`the create carries "${SOURCE_TAG}" with the site's usual tags`, Array.isArray(create.tags) &&
    ["Hot Lead - Website", "Website Lead", FORM, SOURCE_TAG].every((t) => create.tags.includes(t)), JSON.stringify(create.tags));
  check(`"${SOURCE_TAG}" is plain ASCII, as Christine typed it`, SOURCE_TAG.length === 16 && /^[\x20-\x7e]+$/.test(SOURCE_TAG) &&
    create.tags && create.tags.includes("Source - Website") && !create.tags.some((t) => t.includes(`Source ${EN_DASH}`)));
  check(`"${FUNNEL_TAG}" is NOT on the create (Lofty would not start the plan for it)`, !createTags(create).includes(FUNNEL_TAG));
  check("created as a Seller (lead type 1), texting off", same(create.leadTypes, [SELLER]) && create.cannotText === true);
  check("the property goes on the lead as Lofty's property field", same(create.property, { streetAddress: "12 Oak Dr", state: "CO", zipCode: "80538", city: "Loveland" }),
    JSON.stringify(create.property));
  check("its own source label in Lofty", create.source === "The Little Lady Sells Homes - Selling It Yourself (FSBO)");
  check("the note says what they asked for: FSBO, the property, how far along",
    /Selling it themselves \(FSBO\)\.\nProperty: 12 Oak Dr, Loveland, CO 80538\nHow far along: Getting the house ready/.test(create.notes || ""), create.notes);
  check("not written up as a valuation request", !/Requested valuation/.test(create.notes || ""));
  let fp = funnelPuts(f);
  const createAt = f.log.findIndex((c) => c.m === "POST" && c.p === "/v1.0/leads");
  check(`"${FUNNEL_TAG}" is added in one PUT after the create, to the new lead`, fp.length === 1 && fp[0].at > createAt && fp[0].id === NEWID, JSON.stringify(fp));
  check("that PUT keeps every tag already on the lead", fp[0] && fp[0].before.length > 0 && fp[0].before.every((t) => fp[0].body.tags.includes(t)) &&
    fp[0].body.tags.includes(SOURCE_TAG));
  check("and it stays on", f.leads[NEWID].tags.includes(FUNNEL_TAG) && f.leads[NEWID].tags.includes(SOURCE_TAG));
  check("/status and the log record it", last().planResult && last().planResult.ok === true && same(last().planResult.added, [FUNNEL_TAG]) &&
    out.lines.some((l) => l.includes(`Nurture plan FSBO for "${FORM}": added tag "${FUNNEL_TAG}" after the create (lead type 1 sent on the create)`)),
  out.lines.filter((l) => /Nurture plan/.test(l)).join(" | "));
  check("no text consent ticked: nothing turns texting on", !f.puts.some((p) => p.body.cannotText === false) && f.leads[NEWID].cannotText === true);

  console.log("\n5b. Returning contacts and contacts the lookup can't rule out");
  f = fakeLofty({ emailHits: [{ leadId: Number(EXISTING), emails: ["pat.seller@example.com"] }], leads: { [EXISTING]: { tags: ["Past Client"], phones: [] } } });
  out = await submit(f, {});
  create = f.posts[0] || {};
  check(`returning: "${SOURCE_TAG}" is ADDED to their tags (tagsAdd), nothing replaced`, Array.isArray(create.tagsAdd) && create.tagsAdd.includes(SOURCE_TAG) && !("tags" in create));
  check("returning: keeps their own lead type", !("leadTypes" in create));
  check(`returning: "${FUNNEL_TAG}" is not added (the site's plan-tag rule: proven-new contacts only)`,
    !createTags(create).includes(FUNNEL_TAG) && funnelPuts(f).length === 0 && /returning contact/.test(last().planResult.skipped || ""), JSON.stringify(last().planResult));
  check("returning: they still get the Call task, as every returning lead does", f.log.some((c) => c.m === "POST" && c.p === "/v2.0/tasks"));
  f = fakeLofty({ phoneHits: [{ leadId: 42, phones: ["9705550100"] }] });
  await submit(f, {});
  check("phone-only match: no lead type, no plan tag", !("leadTypes" in f.posts[0]) && funnelPuts(f).length === 0 && createTags(f.posts[0]).includes(SOURCE_TAG));
  f = fakeLofty({ searchStatus: 503 });
  await submit(f, {});
  check("lookup down ('can't tell' is never 'new'): no lead type, no plan tag", !("leadTypes" in f.posts[0]) && funnelPuts(f).length === 0);

  console.log("\n5c. Do Not Contact and email opt-out hold the plan tag");
  // The plan emails, so full Do Not Contact and an email opt-out hold its tag
  // (lib/_notify.js addPlanTags, unchanged here). "#dnc" alone is deliberately NOT
  // pinned: #dnc = phone only (calls/texts); email still allowed — Christine 2026-10-18.
  // Whether a #dnc-only lead gets an email plan's tag is the shared consent
  // helpers' call (being changed suite-wide by another build), not this form's.
  for (const [label, lead, step] of [
    ["tagged Consent – DNC", { tags: [`Consent ${EN_DASH} DNC`], phones: [] }, "do-not-contact"],
    ["tagged Consent – Unsubscribed", { tags: [`Consent ${EN_DASH} Unsubscribed`], phones: [] }, "email-opt-out"],
    ["cannotEmail: true", { tags: ["Past Client"], phones: [], cannotEmail: true }, "email-opt-out"],
  ]) {
    f = fakeLofty({ leads: { [NEWID]: lead } });
    await submit(f, {});
    check(`a lead ${label}: "${FUNNEL_TAG}" not added (${step})`, funnelPuts(f).length === 0 && last().planResult && last().planResult.step === step,
      JSON.stringify(last().planResult));
  }

  console.log("\n5d. Texting: only the site's own explicit yes, on the same number");
  f = fakeLofty();
  await submit(f, { sms_consent: "yes" });
  check("every create still says cannotText: true", f.posts.every((b) => b.cannotText === true));
  check("an explicit yes on the only number on the lead turns texting on (the site's existing rule)",
    f.puts.some((p) => p.body.cannotText === false) && f.leads[NEWID].cannotText === false);
  // #dnc = phone only (calls/texts); email still allowed — Christine 2026-10-18.
  // So a #dnc lead must never have texting turned on, whatever the form says.
  for (const tag of ["#dnc", `Consent ${EN_DASH} DNC`]) {
    f = fakeLofty({ leads: { [NEWID]: { tags: [tag], phones: ["(970) 555-0100"], cannotText: true } } });
    await submit(f, { sms_consent: "yes" });
    check(`a yes on a lead tagged ${tag} never turns texting on`, !f.puts.some((p) => p.body.cannotText === false) && f.leads[NEWID].cannotText === true);
  }

  console.log("\n5e. Odd answers");
  for (const [stage, want] of [[undefined, "(not answered)"], ["", "(not answered)"], ["__proto__", '"__proto__"'], ["constructor", '"constructor"'],
    ["offer", "Has an offer or is under contract"]]) {
    f = fakeLofty();
    await submit(f, { fsbo_stage: stage });
    check(`how far along ${JSON.stringify(stage)} -> "${want}"`, (f.posts[0].notes || "").includes(`How far along: ${want}`), (f.posts[0].notes || "").split("\n")[2]);
  }
  f = fakeLofty();
  await submit(f, { property_address: "" });
  check("no address: still captured, the note says so, no property field", (f.posts[0].notes || "").includes("Property: (not given)") && !("property" in f.posts[0]));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
