#!/usr/bin/env python3
"""Persistent ROI/conversion layer applied after the normal site build.

This intentionally leaves canonical URLs, redirects, sitemap policy, and the
core copy of ranking pages alone. It adds attribution, high-intent lead paths,
and a deploy-time regression gate to the finished site.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BACKEND = ROOT / "netlify" / "functions" / "submission-created.js"
ASSET_DIR = SITE / "assets" / "js"

ATTR_FIELDS = (
    "attribution_first_page", "attribution_form_page", "attribution_source",
    "attribution_referrer", "utm_source", "utm_medium", "utm_campaign",
    "utm_content", "utm_term", "roi_context",
)
TARGETS = {
    "rent": SITE / "rent-to-own.html",
    "multi": SITE / "multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html",
    "land": SITE / "whats-the-real-cost-to-develop-raw-land-in-colorado.html",
    "ilc": SITE / "what-is-an-ilc-and-when-should-you-get-a-full-survey.html",
    "loveland": SITE / "loveland-co-market-report-and-trends.html",
    "thanks": SITE / "thank-you.html",
}
RURAL_BRIDGE_PAGES = [
    SITE / "understanding-open-zoning-in-larimer-county.html",
    SITE / "open-zoning-buying-selling-land-larimer.html",
    SITE / "buying-land-larimer-co.html",
    SITE / "buying-land-northern-colorado.html",
]


def read(path: Path) -> str:
    if not path.exists():
        raise RuntimeError(f"Required file missing: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def write_if_changed(path: Path, text: str) -> None:
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old != text:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def attr_inputs() -> str:
    return "".join(f'<input type="hidden" name="{n}" value="">\n' for n in ATTR_FIELDS)


ATTR_INPUTS = attr_inputs()
CONSENT = """<label class="consent">
  <input type="checkbox" name="consent" value="yes" required style="width:auto">
  I agree to receive marketing communication via email, call, text, or similar automated means
  from The Little Lady Sells Homes. Consent is not a condition of purchase. Msg/data rates may
  apply. Reply STOP to unsubscribe.
</label>"""


def form_shell(name: str, fields: str, button: str, form_id: str) -> str:
    return f"""<form class="lead-form" id="{form_id}" name="{name}"
  action="/thank-you.html?from={name}" method="POST" data-netlify="true"
  netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="{name}">
  {ATTR_INPUTS}
  <p style="display:none" aria-hidden="true"><label>Don't fill this out: <input name="bot-field" autocomplete="off" tabindex="-1"></label></p>
  {fields}
  {CONSENT}
  <button class="btn btn-primary" type="submit" data-roi-cta="{name}-submit">{button}</button>
</form>"""


def insert_after_hero(html: str, block: str, marker: str) -> str:
    if f'id="{marker}"' in html:
        return html
    pat = re.compile(
        r'(<main\s+id=["\']main["\'][^>]*>\s*<section\b[^>]*class=["\'][^"\']*\bhero\b[^"\']*["\'][^>]*>.*?</section>)',
        re.I | re.S,
    )
    if not pat.search(html):
        raise RuntimeError(f"Could not locate first hero for {marker}")
    return pat.sub(r"\1\n" + block.strip() + "\n", html, count=1)


def insert_before_main_close(html: str, block: str, marker: str) -> str:
    if f'id="{marker}"' in html:
        return html
    if "</main>" not in html:
        raise RuntimeError(f"Could not locate </main> for {marker}")
    return html.replace("</main>", block.strip() + "\n</main>", 1)


def rent_block() -> str:
    fields = """<input type="text" name="name" placeholder="Your name" autocomplete="name" required>
  <input type="email" name="email" placeholder="Email" autocomplete="email" required>
  <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel">
  <input type="text" name="where_looking" placeholder="Where are you hoping to live?" data-context-label="Where they want to live">
  <textarea name="goal" rows="4" placeholder="What are you trying to accomplish?" data-context-label="What they are trying to accomplish" required></textarea>"""
    form = form_shell("rent-to-own-options", fields, "Show Me My Options", "rent-to-own-options")
    return f"""
<section class="tight" id="roi-rto-funnel">
  <div class="wrap grid-2" style="align-items:start">
    <div>
      <span class="eyebrow">Your options first</span>
      <h2 class="section-title">Not sure if rent-to-own is actually your best option?</h2>
      <p class="lede">Tell me what you're trying to do. I'll help you compare rent-to-own with other home-buying paths that may fit your situation better — without pretending one program works for everyone.</p>
      <p class="fine-note">Already looking in Loveland, Fort Collins, Greeley, or elsewhere in Northern Colorado? Give me the basics and I'll start with the options that make sense to investigate.</p>
    </div>
    <div class="card" style="padding:34px 30px">{form}</div>
  </div>
</section>"""


def multi_block() -> str:
    feature_pairs = [
        ("Separate entrance", "separate entrance"),
        ("Main-floor bedroom / bath", "main-floor bedroom/bath"),
        ("Second kitchen", "second kitchen"),
        ("Guest house / ADU", "guest house / ADU"),
        ("Walkout basement", "walkout basement"),
        ("Enough land for another structure", "land for another structure"),
        ("I'm not sure yet", "not sure yet"),
    ]
    checks = "\n".join(
        f'<label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="must_have" value="{value}" data-context-label="Must-have" style="width:auto"> {label}</label>'
        for label, value in feature_pairs
    )
    fields = f"""<input type="text" name="name" placeholder="Your name" autocomplete="name" required>
  <input type="email" name="email" placeholder="Email" autocomplete="email" required>
  <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel">
  <input type="text" name="where_looking" placeholder="Town or area you're considering" data-context-label="Area">
  <fieldset style="border:0;padding:0;margin:4px 0 0">
    <legend style="font-weight:600;margin-bottom:10px">What would make the layout work?</legend>
    <div style="display:grid;gap:9px">{checks}</div>
  </fieldset>"""
    form = form_shell("multigenerational-search", fields, "Show Me Homes That Could Work", "multigenerational-search")
    return f"""
<section class="tight" id="roi-multigen-funnel">
  <div class="wrap grid-2" style="align-items:start">
    <div>
      <span class="eyebrow">A better search</span>
      <h2 class="section-title">Looking for a true multigenerational home?</h2>
      <p class="lede">Those homes are hard to find with one MLS checkbox. Tell me which property features matter and I'll use that to narrow the search — separate entrances, additional living areas, ADUs, acreage, or a layout that can flex over time.</p>
    </div>
    <div class="card" style="padding:34px 30px">{form}</div>
  </div>
</section>"""


def land_block() -> str:
    fields = """<input type="text" name="name" placeholder="Your name" autocomplete="name" required>
  <input type="email" name="email" placeholder="Email" autocomplete="email" required>
  <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel">
  <input type="text" name="property_address" placeholder="Property address, MLS #, or parcel" data-context-label="Property" required>
  <textarea name="message" rows="4" placeholder="What are you trying to figure out?" data-context-label="Question"></textarea>"""
    form = form_shell("land-property-review", fields, "Send Me the Property", "land-property-review")
    return f"""
<section class="tight" id="roi-land-funnel">
  <div class="wrap" style="max-width:1050px">
    <span class="eyebrow">Start with the expensive questions</span>
    <h2 class="section-title">There isn't one statewide number for developing raw land.</h2>
    <p class="lede">The total can change dramatically based on what is already at the property. Before price estimates mean much, check the pieces that create the biggest surprises.</p>
    <div class="town-table-wrap" style="margin:28px 0 44px">
      <table class="town-table">
        <thead><tr><th>Cost / risk area</th><th>What changes the answer</th></tr></thead>
        <tbody>
          <tr><th>Legal & physical access</th><td>Recorded access, road condition, easements and road maintenance</td></tr>
          <tr><th>Water / well</th><td>Existing source, well permit/use, drilling conditions and water rights where applicable</td></tr>
          <tr><th>Septic</th><td>Existing system, soil/site feasibility, bedroom count and county requirements</td></tr>
          <tr><th>Power & utilities</th><td>Distance to service, extension work and provider requirements</td></tr>
          <tr><th>Survey / ILC</th><td>Parcel size, boundary questions, improvements, lender/title needs</td></tr>
          <tr><th>Site work & permits</th><td>Driveway, grading, drainage, zoning, setbacks and the intended use</td></tr>
        </tbody>
      </table>
    </div>
    <div class="grid-2" style="align-items:start">
      <div>
        <h2 class="section-title" style="font-size:clamp(24px,3vw,34px)">Already looking at a piece of land?</h2>
        <p class="lede">Send me the address, MLS number, or parcel. Before you fall in love with it, I'll help you identify the questions to ask about wells, septic, access, zoning, surveys and the other due-diligence pieces that can change the deal.</p>
        <p class="fine-note">I can help you organize the real-estate questions; county, title, survey, engineering, lending and legal questions still need the appropriate professionals.</p>
      </div>
      <div class="card" style="padding:34px 30px">{form}</div>
    </div>
  </div>
</section>"""


def ilc_block() -> str:
    fields = """<input type="text" name="name" placeholder="Your name" autocomplete="name" required>
  <input type="email" name="email" placeholder="Email" autocomplete="email" required>"""
    form = form_shell("land-due-diligence-checklist", fields, "Get the Checklist", "land-due-diligence-checklist")
    return f"""
<section class="tight" id="roi-ilc-funnel">
  <div class="wrap grid-2" style="align-items:start">
    <div>
      <span class="eyebrow">Beyond the ILC</span>
      <h2 class="section-title">Buying acreage in Northern Colorado?</h2>
      <p class="lede">An ILC is only one piece of rural-property due diligence. Wells, septic, legal access, easements, zoning, road agreements, survey questions, utilities and insurability can matter just as much.</p>
      <p class="fine-note">I put the questions in one place so you can use them while you're comparing properties.</p>
    </div>
    <div class="card" style="padding:34px 30px">{form}</div>
  </div>
</section>"""


def loveland_block() -> str:
    fields = """<input type="text" name="name" placeholder="Your name" autocomplete="name" required>
  <input type="email" name="email" placeholder="Email" autocomplete="email" required>
  <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel">
  <input type="text" name="property_address" placeholder="Loveland property address" data-context-label="Property" required>"""
    form = form_shell("loveland-market-seller", fields, "See What My Home Could Sell For", "loveland-market-seller")
    return f"""
<section class="tight" id="roi-loveland-market-funnel">
  <div class="wrap">
    <span class="eyebrow">Make the market useful</span>
    <h2 class="section-title">What do Loveland market numbers mean for you?</h2>
    <div class="grid-2col" style="margin-top:28px;align-items:start">
      <div class="card">
        <h3>Thinking about buying?</h3>
        <p>Market averages are useful context, but the homes available in your actual price range are what matter.</p>
        <a class="btn btn-dark" href="/search-homes.html" data-roi-cta="loveland-market-buy-search">Search Loveland Homes</a>
      </div>
      <div class="card">
        <h3>Own a Loveland home?</h3>
        <p>Citywide medians cannot tell you what your specific home would sell for. Address, condition, updates, lot, location and the competing inventory all matter.</p>
        {form}
      </div>
    </div>
  </div>
</section>"""


def checklist_block() -> str:
    return """
<section class="tight" id="land-checklist" hidden>
  <div class="wrap" style="max-width:900px">
    <span class="eyebrow">Save this list</span>
    <h2 class="section-title">Northern Colorado Land & Acreage Due-Diligence Questions</h2>
    <p class="lede">Use this as a question list while you compare rural property. Not every item applies to every parcel, and the right professional should verify the final answer.</p>
    <div class="profile-list">
      <div class="profile-row"><h3>Title, ownership & easements</h3><p>Confirm the legal description, recorded easements, access rights and any title exceptions that affect how the property can be used.</p></div>
      <div class="profile-row"><h3>Legal & physical access</h3><p>Is access recorded? Is the road public or private? Who maintains it, and is there a road maintenance agreement?</p></div>
      <div class="profile-row"><h3>Zoning & intended use</h3><p>Verify current zoning, setbacks and whether the home, shop, barn, ADU, animals, business use or other plans you have are actually permitted.</p></div>
      <div class="profile-row"><h3>Water / well</h3><p>Identify the water source and, when applicable, review the well permit, permitted use, production/testing information and any water-right questions.</p></div>
      <div class="profile-row"><h3>Septic / wastewater</h3><p>For an existing system, review permits, condition and transfer requirements. For vacant land, ask what site or soil work is needed before assuming a septic system can be installed.</p></div>
      <div class="profile-row"><h3>Survey / ILC / boundaries</h3><p>Decide whether an ILC is enough or whether a boundary survey or Improvement Survey Plat is appropriate, especially for acreage, fences, encroachments or future construction.</p></div>
      <div class="profile-row"><h3>Utilities & site-development costs</h3><p>Check power, gas/propane, internet, driveway, grading, drainage and how far services must be extended.</p></div>
      <div class="profile-row"><h3>Flood, wildfire & insurance</h3><p>Review mapped hazards and confirm insurability and likely requirements before your contingency deadlines, not after.</p></div>
      <div class="profile-row"><h3>Financing & appraisal</h3><p>Make sure the property type, improvements, utilities, access and intended loan program work together. Rural properties can create lender-specific questions.</p></div>
      <div class="profile-row"><h3>County-specific verification</h3><p>Rules vary across Larimer, Weld and other counties. Verify current requirements directly with the county and the appropriate title, survey, septic, well, lender, insurance, legal or engineering professional.</p></div>
    </div>
    <div class="card" style="margin-top:38px;padding:34px">
      <h3>Already looking at a property?</h3>
      <p>Send me the address or MLS number and I'll help you organize the questions before you get too far into it.</p>
      <a class="btn btn-primary" href="/whats-the-real-cost-to-develop-raw-land-in-colorado.html#land-property-review" data-roi-cta="checklist-send-property">Send Christine the Property</a>
    </div>
    <p class="fine-note" style="margin-top:24px">This checklist is general real-estate information, not legal, engineering, surveying, lending, insurance or environmental advice.</p>
  </div>
</section>
<script>
(function () {
  var from = new URLSearchParams(window.location.search).get('from');
  if (from === 'land-due-diligence-checklist') {
    var el = document.getElementById('land-checklist');
    if (el) el.hidden = false;
  }
})();
</script>"""


def bridge_block(kind: str) -> str:
    if kind == "land":
        return """
<section class="tight" id="roi-land-bridge"><div class="wrap" style="max-width:980px"><div class="card" style="padding:30px 34px">
  <h3>Buying land? Keep the due-diligence pieces connected.</h3>
  <p>An attractive parcel can turn on access, water, septic, zoning and boundary questions. Use the guides together instead of evaluating each issue in isolation.</p>
  <div class="btn-row" style="justify-content:flex-start">
    <a class="btn btn-dark" href="/buying-land-northern-colorado.html" data-roi-cta="bridge-buying-land">Buying Land Guide</a>
    <a class="btn btn-dark" href="/what-is-an-ilc-and-when-should-you-get-a-full-survey.html" data-roi-cta="bridge-ilc">ILC vs. Survey</a>
    <a class="btn btn-primary" href="/whats-the-real-cost-to-develop-raw-land-in-colorado.html#land-property-review" data-roi-cta="bridge-send-land">Send Me a Property</a>
  </div>
</div></div></section>"""
    if kind == "multi":
        return """
<section class="tight" id="roi-multi-bridge"><div class="wrap" style="max-width:980px"><div class="card" style="padding:30px 34px">
  <h3>Ready to see which homes could actually work?</h3>
  <p>Start with the features you need, then use the live home search to compare the current inventory.</p>
  <div class="btn-row" style="justify-content:flex-start">
    <a class="btn btn-primary" href="#multigenerational-search" data-roi-cta="multi-bridge-form">Tell Me What You Need</a>
    <a class="btn btn-dark" href="/search-homes.html" data-roi-cta="multi-bridge-search">Search Homes</a>
  </div>
</div></div></section>"""
    if kind == "rent":
        return """
<section class="tight" id="roi-rto-bridge"><div class="wrap" style="max-width:980px"><div class="card" style="padding:30px 34px">
  <h3>Don't choose a path before you know the alternatives.</h3>
  <p>Rent-to-own can be useful in the right situation, but it should be compared with the other buying paths available for your property, location and finances.</p>
  <div class="btn-row" style="justify-content:flex-start">
    <a class="btn btn-primary" href="#rent-to-own-options" data-roi-cta="rto-bridge-form">Show Me My Options</a>
    <a class="btn btn-dark" href="/rent-to-own-in-fort-collins.html" data-roi-cta="rto-bridge-foco">Fort Collins</a>
    <a class="btn btn-dark" href="/rent-to-own-in-loveland.html" data-roi-cta="rto-bridge-loveland">Loveland</a>
  </div>
</div></div></section>"""
    raise ValueError(kind)


CLIENT_JS = r"""(function () {
  'use strict';
  var KEY = 'tllsh_roi_attribution_v1';
  function getState() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function setState(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function cleanReferrer(v) { if (!v) return ''; try { var u = new URL(v); return u.origin + u.pathname; } catch (e) { return ''; } }
  function classify(ref, us, um) {
    if (us) return us + (um ? ' / ' + um : '');
    if (!ref) return '(direct) / (none)';
    try {
      var h = new URL(ref).hostname.toLowerCase();
      if (/(^|\.)google\./.test(h)) return 'google / organic';
      if (/(^|\.)bing\.com$/.test(h)) return 'bing / organic';
      if (/(^|\.)duckduckgo\.com$/.test(h)) return 'duckduckgo / organic';
      if (/(^|\.)search\.yahoo\.com$/.test(h)) return 'yahoo / organic';
      if (/(^|\.)facebook\.com$/.test(h) || h === 'fb.com') return 'facebook / referral';
      if (/(^|\.)instagram\.com$/.test(h)) return 'instagram / referral';
      if (/(^|\.)youtube\.com$/.test(h)) return 'youtube / referral';
      return h + ' / referral';
    } catch (e) { return 'referral'; }
  }
  var first = getState();
  if (!first || !first.first_page) {
    var q = new URLSearchParams(location.search);
    first = {
      first_page: location.pathname || '/', referrer: cleanReferrer(document.referrer),
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '', utm_content: q.get('utm_content') || '',
      utm_term: q.get('utm_term') || ''
    };
    first.source = classify(first.referrer, first.utm_source, first.utm_medium);
    setState(first);
  }
  function hidden(form, name, value) {
    var el = form.querySelector('input[name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; form.appendChild(el); }
    el.value = value || '';
  }
  function context(form) {
    var groups = {};
    form.querySelectorAll('[data-context-label]').forEach(function (el) {
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      var value = (el.value || '').trim(); if (!value) return;
      var label = el.getAttribute('data-context-label') || el.name || 'Context';
      if (!groups[label]) groups[label] = [];
      if (groups[label].indexOf(value) === -1) groups[label].push(value);
    });
    return Object.keys(groups).map(function (k) { return k + ': ' + groups[k].join(', '); }).join('\n');
  }
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('form.lead-form')) return;
    hidden(form, 'attribution_first_page', first.first_page || '');
    hidden(form, 'attribution_form_page', location.pathname || '');
    hidden(form, 'attribution_source', first.source || '');
    hidden(form, 'attribution_referrer', first.referrer || '');
    hidden(form, 'utm_source', first.utm_source || ''); hidden(form, 'utm_medium', first.utm_medium || '');
    hidden(form, 'utm_campaign', first.utm_campaign || ''); hidden(form, 'utm_content', first.utm_content || '');
    hidden(form, 'utm_term', first.utm_term || ''); hidden(form, 'roi_context', context(form));
  }, true);
  document.addEventListener('click', function (event) {
    var el = event.target && event.target.closest ? event.target.closest('[data-roi-cta]') : null;
    if (!el) return;
    if (typeof window.gtag === 'function') window.gtag('event', 'roi_cta_click', {cta_id: el.getAttribute('data-roi-cta') || 'unknown', page_path: location.pathname || '/'});
  });
})();"""


def create_asset() -> str:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(CLIENT_JS.encode("utf-8")).hexdigest()[:12]
    name = f"roi-conversion.{digest}.js"
    for old in ASSET_DIR.glob("roi-conversion.*.js"):
        if old.name != name:
            old.unlink()
    write_if_changed(ASSET_DIR / name, CLIENT_JS + "\n")
    return f"/assets/js/{name}"


def add_attr_fields(html: str) -> str:
    pat = re.compile(r'(<form\b(?=[^>]*\bclass=["\'][^"\']*\blead-form\b[^"\']*["\'])[^>]*>)', re.I)
    def repl(m: re.Match[str]) -> str:
        tail = html[m.end():m.end() + 2200]
        close = tail.find("</form>")
        scope = tail if close < 0 else tail[:close]
        return m.group(1) if 'name="attribution_first_page"' in scope else m.group(1) + "\n" + ATTR_INPUTS
    return pat.sub(repl, html)


def add_asset(html: str, src: str) -> str:
    html = re.sub(r'\s*<script\s+defer\s+src="/assets/js/roi-conversion\.[0-9a-f]{12}\.js"></script>\s*', "\n", html, flags=re.I)
    if src in html:
        return html
    if "</body>" not in html:
        raise RuntimeError("HTML missing </body>")
    return html.replace("</body>", f'<script defer src="{src}"></script>\n</body>', 1)


def patch_backend() -> None:
    text = read(BACKEND)
    if "ROI_ATTRIBUTION_PATCH_V1" not in text:
        label_anchor = '  "loveland-buyers-guide": "The Little Lady Sells Homes - Loveland Buyer\'s Guide Download",\n};'
        if label_anchor not in text:
            raise RuntimeError("Could not locate SOURCE_LABELS anchor")
        labels = """  "loveland-buyers-guide": "The Little Lady Sells Homes - Loveland Buyer's Guide Download",
  // ROI_ATTRIBUTION_PATCH_V1 - high-intent organic funnels
  "rent-to-own-options": "The Little Lady Sells Homes - Rent-to-Own Options",
  "multigenerational-search": "The Little Lady Sells Homes - Multigenerational Home Search",
  "land-property-review": "The Little Lady Sells Homes - Land / Acreage Property Review",
  "land-due-diligence-checklist": "The Little Lady Sells Homes - Land & Acreage Due-Diligence Checklist",
  "loveland-market-seller": "The Little Lady Sells Homes - Loveland Market Seller Inquiry",
};"""
        text = text.replace(label_anchor, labels, 1)

        tag_anchor = '    body.tags = [TRIGGER_TAG, "Website Lead", formName];'
        if tag_anchor not in text:
            raise RuntimeError("Could not locate body.tags anchor")
        tag_patch = """    body.tags = [TRIGGER_TAG, "Website Lead", formName];
    // ROI_ATTRIBUTION_PATCH_V1: make high-intent funnel leads sortable in Lofty.
    const ROI_TAGS = {
      "rent-to-own-options": ["Buyer Lead", "Rent-to-Own"],
      "multigenerational-search": ["Buyer Lead", "Multigenerational"],
      "land-property-review": ["Buyer Lead", "Land & Acreage"],
      "land-due-diligence-checklist": ["Buyer Lead", "Land & Acreage"],
      "loveland-market-seller": ["Seller Lead", "Loveland"],
    };
    if (ROI_TAGS[formName]) body.tags.push(...ROI_TAGS[formName]);"""
        text = text.replace(tag_anchor, tag_patch, 1)

        notes_anchor = "    if (!body.notes) body.notes = banner;"
        if notes_anchor not in text:
            raise RuntimeError("Could not locate notes anchor")
        notes_patch = """    if (!body.notes) body.notes = banner;

    // ROI_ATTRIBUTION_PATCH_V1: CRM/email-only journey context. This is not
    // sent to GA4 or Meta by this server function.
    if (data.roi_context) body.notes += `\\n\\nWHAT THEY NEED\\n${data.roi_context}`;
    const journey = [];
    if (data.attribution_first_page) journey.push(`First page: ${data.attribution_first_page}`);
    if (data.attribution_form_page) journey.push(`Form page: ${data.attribution_form_page}`);
    if (data.attribution_source) journey.push(`Source: ${data.attribution_source}`);
    if (data.attribution_referrer) journey.push(`Referrer: ${data.attribution_referrer}`);
    const utmBits = [
      data.utm_source && `source=${data.utm_source}`,
      data.utm_medium && `medium=${data.utm_medium}`,
      data.utm_campaign && `campaign=${data.utm_campaign}`,
      data.utm_content && `content=${data.utm_content}`,
      data.utm_term && `term=${data.utm_term}`,
    ].filter(Boolean);
    if (utmBits.length) journey.push(`UTM: ${utmBits.join(" | ")}`);
    if (journey.length) body.notes += `\\n\\nWEBSITE JOURNEY\\n${journey.join("\\n")}`;"""
        text = text.replace(notes_anchor, notes_patch, 1)

    for needle in ("ROI_ATTRIBUTION_PATCH_V1", '"rent-to-own-options"', '"multigenerational-search"', '"land-property-review"', '"land-due-diligence-checklist"', '"loveland-market-seller"', "WEBSITE JOURNEY", "WHAT THEY NEED"):
        if needle not in text:
            raise RuntimeError(f"Backend ROI patch missing {needle}")
    write_if_changed(BACKEND, text)


def apply_funnels() -> None:
    configs = [
        (TARGETS["rent"], rent_block(), "roi-rto-funnel"),
        (TARGETS["multi"], multi_block(), "roi-multigen-funnel"),
        (TARGETS["land"], land_block(), "roi-land-funnel"),
        (TARGETS["ilc"], ilc_block(), "roi-ilc-funnel"),
        (TARGETS["loveland"], loveland_block(), "roi-loveland-market-funnel"),
    ]
    for path, block, marker in configs:
        write_if_changed(path, insert_after_hero(read(path), block, marker))

    write_if_changed(TARGETS["thanks"], insert_before_main_close(read(TARGETS["thanks"]), checklist_block(), "land-checklist"))

    write_if_changed(TARGETS["rent"], insert_before_main_close(read(TARGETS["rent"]), bridge_block("rent"), "roi-rto-bridge"))
    write_if_changed(TARGETS["multi"], insert_before_main_close(read(TARGETS["multi"]), bridge_block("multi"), "roi-multi-bridge"))
    for path in RURAL_BRIDGE_PAGES:
        if path.exists():
            write_if_changed(path, insert_before_main_close(read(path), bridge_block("land"), "roi-land-bridge"))


def instrument_site(src: str) -> None:
    for path in SITE.rglob("*.html"):
        html = add_attr_fields(read(path))
        html = add_asset(html, src)
        write_if_changed(path, html)


def validate(src: str) -> None:
    errors = []
    expected = {
        TARGETS["rent"]: ("roi-rto-funnel", "rent-to-own-options"),
        TARGETS["multi"]: ("roi-multigen-funnel", "multigenerational-search"),
        TARGETS["land"]: ("roi-land-funnel", "land-property-review"),
        TARGETS["ilc"]: ("roi-ilc-funnel", "land-due-diligence-checklist"),
        TARGETS["loveland"]: ("roi-loveland-market-funnel", "loveland-market-seller"),
    }
    for path, (marker, form_name) in expected.items():
        html = read(path)
        if html.count(f'id="{marker}"') != 1: errors.append(f"{path.name}: expected one {marker}")
        if f'name="{form_name}"' not in html: errors.append(f"{path.name}: missing {form_name}")
        if f'action="/thank-you.html?from={form_name}"' not in html: errors.append(f"{path.name}: wrong thank-you action")
        if 'name="consent"' not in html: errors.append(f"{path.name}: consent missing")
        if html.count(src) != 1: errors.append(f"{path.name}: ROI JS not exactly once")

    land = read(TARGETS["land"])
    if '<link rel="canonical" href="https://www.thelittleladysellshomes.com/whats-the-real-cost-to-develop-raw-land-in-colorado.html">' not in land:
        errors.append("raw-land canonical changed")
    if '<title>How Much Does It Cost To Develop Raw Land in Colorado? Water, Power, Septic &amp; Access</title>' not in land:
        errors.append("raw-land title changed unexpectedly")
    multi = read(TARGETS["multi"])
    if '<link rel="canonical" href="https://www.thelittleladysellshomes.com/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html">' not in multi:
        errors.append("multigenerational canonical changed")
    thanks = read(TARGETS["thanks"])
    if 'id="land-checklist"' not in thanks or "land-due-diligence-checklist" not in thanks:
        errors.append("thank-you checklist missing")

    asset = read(SITE / src.lstrip("/"))
    if "generate_lead" in asset or "fbq(" in asset: errors.append("ROI JS must not fire lead conversions")
    if "roi_cta_click" not in asset: errors.append("ROI CTA event missing")
    backend = read(BACKEND)
    if "ROI_ATTRIBUTION_PATCH_V1" not in backend or "WEBSITE JOURNEY" not in backend:
        errors.append("backend attribution patch missing")

    for path in SITE.rglob("*.html"):
        html = read(path)
        if "lead-form" in html and 'name="attribution_first_page"' not in html:
            errors.append(f"{path.relative_to(SITE)}: lead form lacks attribution fields")

    if errors:
        raise RuntimeError("ROI conversion gate failed:\n- " + "\n- ".join(errors))


def main() -> int:
    for path in TARGETS.values():
        if not path.exists():
            raise RuntimeError(f"Target page missing: {path.relative_to(ROOT)}")
    patch_backend()
    apply_funnels()
    src = create_asset()
    instrument_site(src)
    validate(src)
    print(f"ROI conversion layer OK — attribution + five funnels + checklist + conversion bridges; {src}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ROI conversion layer FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
