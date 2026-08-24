"""Legacy iHouseWeb URL coverage — the keep-what-ranks layer.

The old thelittleladysellshomes.com (iHouseWeb) carried ~660 indexed URLs:
price-band and property-type search pages per town, a rent-to-own cluster
ranking on page 1, a land/zoning guide moat, 47 blog posts, and a set of core
pages. The 2023 traffic loss taught this brand what changing URLs costs, so
the rebuild's rule is: every legacy URL either renders at its EXACT address
with its ranking title/meta intact, or 301s to its one true equivalent.

Data: build/data/legacy_terms.json (produced from the full-site crawl merged
with 16-month Search Console page data — organic clicks only, so paid traffic
never inflated the priorities).

Integration: build.py calls build_legacy_pages(module) late in __main__ (after
the engine pages exist, so the exists-check can defer to them), and
build_redirects_and_meta() extends its sitemap paths with LEGACY_SITEMAP_PATHS.
"""

import html as _html
import json
import os
import re

# Filled by build_legacy_pages(); read by build.py's sitemap step.
LEGACY_SITEMAP_PATHS = []

# Legacy URLs whose job is now done by an engine page under a different name.
# A 301 keeps the old equity flowing to the successor. Everything NOT in this
# map and not matched by an engine page gets rebuilt at its own URL instead.
RENAMED = {
    # 2026-08-19: the old site had TWO Weld foreclosure pages splitting one
    # query family ("weld county foreclosure search" ranked ~9 while the pages
    # sat at positions 21 and 31 with 4,000 and 5,800 impressions each --
    # they were competing with each other). The cleaner slug survives and
    # gets the deep rebuild; this one 301s into it so the signals combine.
    "/foreclosures-in-weld-county": "/weld-county-foreclosures.html",
    # 2026-08-21: /expiredlisting already has a hand-curated redirect in
    # build.py's LEGACY_URL_REDIRECTS (for a printed magazine QR code that
    # points at the old WordPress URL), but that only covers the bare
    # extensionless path -- it does nothing about THIS engine independently
    # building a full /expiredlisting.html shell from the old capture. That
    # capture is not missing content worth recovering: it's an entire
    # earlier draft of the exact same expired-listing pitch, in the old
    # AgentFire voice and service-tier structure, superseded by the current
    # /expired-listings.html (different framing, different CTA, actually
    # maintained). Recovering it would have restored a stale duplicate
    # competing with the real page. Redirect the shell instead.
    "/expiredlisting": "/expired-listings.html",
    "/my-active-listings": "/current-listings.html",
    "/my-sold-listings": "/past-sales.html",
    "/listings-video-portfolio": "/listing-video-portfolio.html",
    "/quick-search": "/search-homes.html",
    "/advanced-search": "/search-homes.html",
    "/search-colorado": "/search-homes.html",
    "/northern-colorado-home-search": "/search-homes.html",
    "/search-northern-colorado-homes-for-sale": "/search-homes.html",
    "/map-search-legacy": "/search-homes.html",
    "/search-by-area": "/communities/index.html",
    "/christine-gwinnup-the-little-lady-sells-homes": "/about.html",
    "/how-much-is-my-northern-colorado-home-worth": "/free-home-valuation.html",
    # 2026-08-21: batch of 32 "-N" suffixed legacy shells found while working
    # the /expiredlisting case above. Same root cause -- the old AgentFire/
    # iHouseWeb site kept re-saving a page under a numbered slug (a re-publish,
    # an A/B copy test, or a broken duplicate-title collision) instead of
    # editing the original in place, so the crawl captured both. Checked every
    # one's actual prose against its base-slug counterpart before adding it
    # here: same topic, same or near-identical copy, same title in most cases,
    # and the base-slug page is the one that's live and actually maintained
    # (fuller content, current stats, or the modern voice/CTA). Two look-alikes
    # were investigated and deliberately left OUT of this list because they
    # turned out to be genuinely different posts that only share the
    # WordPress-default "my-post" slug pattern, not real duplicates:
    # /my-post-1 (a Rent-to-Own guide) and /my-post-2 (a downsizing guide),
    # both distinct from /my-post (a first-time-buyer guide).
    # 2026-08-21: excluded from the redirect batch below -- the legacy-copy
    # recovery (9e688d6) restored distinct, substantial original text into
    # this page (only ~83% overlap with the base slug now, vs. a thin
    # near-duplicate before), so it's no longer a duplicate and stays live.
    # "/111-2nd-st-ault-1": "/111-2nd-st-ault.html",
    "/condos-and-attached-homes-for-sale-in-eaton-co-1": "/condos-and-attached-homes-for-sale-in-eaton-co.html",
    "/condos-and-attached-homes-for-sale-in-loveland-co-1": "/condos-and-attached-homes-for-sale-in-loveland-co.html",
    "/equestrian-homes-for-sale-in-loveland-co-1": "/equestrian-homes-for-sale-in-loveland-co.html",
    "/farm-and-ranch-for-sale-in-eaton-co-1": "/farm-and-ranch-for-sale-in-eaton-co.html",
    "/farm-and-ranch-for-sale-in-loveland-co-1": "/farm-and-ranch-for-sale-in-loveland-co.html",
    "/homes-for-sale-in-eaton-co-1": "/homes-for-sale-in-eaton-co.html",
    "/homes-for-sale-in-eaton-co-250000-to-400000-1": "/homes-for-sale-in-eaton-co-250000-to-400000.html",
    "/homes-for-sale-in-eaton-co-400000-to-600000-1": "/homes-for-sale-in-eaton-co-400000-to-600000.html",
    "/homes-for-sale-in-eaton-co-600000-to-800000-1": "/homes-for-sale-in-eaton-co-600000-to-800000.html",
    "/homes-for-sale-in-eaton-co-800000-to-1000000-1": "/homes-for-sale-in-eaton-co-800000-to-1000000.html",
    "/homes-for-sale-in-eaton-co-under-250000-1": "/homes-for-sale-in-eaton-co-under-250000.html",
    "/homes-for-sale-in-loveland-co-1": "/homes-for-sale-in-loveland-co.html",
    "/homes-for-sale-in-loveland-co-250000-to-400000-1": "/homes-for-sale-in-loveland-co-250000-to-400000.html",
    "/homes-for-sale-in-loveland-co-400000-to-600000-1": "/homes-for-sale-in-loveland-co-400000-to-600000.html",
    "/homes-for-sale-in-loveland-co-600000-to-800000-1": "/homes-for-sale-in-loveland-co-600000-to-800000.html",
    "/homes-for-sale-in-loveland-co-800000-to-1000000-1": "/homes-for-sale-in-loveland-co-800000-to-1000000.html",
    "/homes-for-sale-in-loveland-co-under-250000-1": "/homes-for-sale-in-loveland-co-under-250000.html",
    "/homes-for-sale-in-pierce-colorado-1": "/homes-for-sale-in-pierce-colorado.html",
    "/homes-for-sale-in-pierce-colorado-2": "/homes-for-sale-in-pierce-colorado.html",
    "/larimer-county-foreclosures-1": "/larimer-county-foreclosures.html",
    "/luxury-homes-for-sale-in-eaton-co-1": "/luxury-homes-for-sale-in-eaton-co.html",
    "/luxury-homes-for-sale-in-loveland-co-1": "/luxury-homes-for-sale-in-loveland-co.html",
    "/mortgage-calculator-2": "/mortgage-calculator.html",
    # 2026-08-21: same reasoning as /111-2nd-st-ault-1 above -- content
    # recovery gave this page its own distinct original copy, so it no
    # longer duplicates /relocation and stays live.
    # "/relocation-1": "/relocation.html",
    "/search-weld-county-1": "/search-weld-county.html",
    "/selling-during-the-holiday-season-pros-and-cons-1-1": "/selling-during-the-holiday-season-pros-and-cons-1.html",
    "/single-family-homes-for-sale-in-eaton-co-1": "/single-family-homes-for-sale-in-eaton-co.html",
    "/single-family-homes-for-sale-in-loveland-co-1": "/single-family-homes-for-sale-in-loveland-co.html",
    "/trustedrealtor-1": "/trustedrealtor.html",
    # These two don't share a base slug with each other or with a "-1"
    # counterpart -- both are thin ("Ask Christine" boilerplate) stubs on the
    # same home-valuation topic that already has a real, maintained lead-gen
    # page under a different name (see the /how-much-is-my-northern-colorado-
    # home-worth entry above, which redirects here for the same reason).
    "/how-much-is-my-home-worth-1": "/free-home-valuation.html",
    "/how-much-is-your-home-worth-1": "/free-home-valuation.html",
    # 2026-08-23: Christine sells Northern Colorado, not Wyoming. These 17
    # Wyoming-focused pages were carried over from an old AgentFire capture
    # that indiscriminately generated city+state landing pages for the
    # entire IDX feed radius. They're all off-topic for the brand: Christine
    # is a NoCo agent (Loveland, Fort Collins, Greeley, Windsor, Estes Park,
    # ...), not a Cheyenne/Burns WY agent. 301 all of them to the NoCo
    # communities index so any accumulated equity funnels into the market
    # she actually serves.
    "/cheyenne-wy-market-report-and-trends": "/communities/index.html",
    "/greeley-wyoming-stats": "/communities/index.html",
    "/search-wyoming": "/search-homes.html",
    "/homes-for-sale-in-burns-wy": "/communities/index.html",
    "/homes-for-sale-in-burns-wy-under-250000": "/communities/index.html",
    "/homes-for-sale-in-burns-wy-250000-to-400000": "/communities/index.html",
    "/homes-for-sale-in-burns-wy-400000-to-600000": "/communities/index.html",
    "/homes-for-sale-in-burns-wy-600000-to-800000": "/communities/index.html",
    "/homes-for-sale-in-burns-wy-800000-to-1000000": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy-under-250000": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy-250000-to-400000": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy-400000-to-600000": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy-600000-to-800000": "/communities/index.html",
    "/homes-for-sale-in-cheyenne-wy-800000-to-1000000": "/communities/index.html",
    "/luxury-homes-for-sale-in-burns-wy": "/communities/index.html",
    "/luxury-homes-for-sale-in-cheyenne-wy": "/communities/index.html",
    # 2026-08-24: Two Wyoming-boosting blog posts from Christine's earlier WY-
    # licensed era ("Why More Coloradans Are Choosing Cheyenne" announced her
    # Wyoming licensure in 2024; "Why Cheyenne Is Becoming a Hot Spot for Real
    # Estate Investors" was market-cheerleading for the WY side). Her Wyoming
    # license has since lapsed and both posts now imply services she is no
    # longer legally able to offer. 301 both into the NoCo blog index; the
    # Wyoming-milestone post had 8 clicks / 1822 impressions of accrued equity
    # per legacy_terms, so a permanent redirect is worth more than a delete.
    "/why-more-coloradans-are-choosing-cheyenne": "/blog/index.html",
    "/why-cheyenne-is-becoming-a-hot-spot-for-real-estate-investors": "/blog/index.html",
}


# url -> local filename under /assets/legacy-media/, loaded from the crawl's
# media map. Every image referenced by legacy content was rehosted there:
# the originals live on iHouseWeb's CDN, which dies with the account.
_MEDIA_MAP = None


def _media_map():
    global _MEDIA_MAP
    if _MEDIA_MAP is None:
        _MEDIA_MAP = {}
        p = os.path.join(os.path.dirname(__file__), "data", "legacy_media_map.tsv")
        if os.path.exists(p):
            with open(p) as f:
                for line in f:
                    if "\t" in line:
                        url, local = line.rstrip("\n").split("\t", 1)
                        _MEDIA_MAP[url] = "/assets/legacy-media/" + os.path.basename(local)
    return _MEDIA_MAP


def _localize_media(html_text):
    s = html_text or ""
    for url, local in _media_map().items():
        if url in s:
            s = s.replace(url, local)
        amp = url.replace("&", "&amp;")
        if amp != url and amp in s:
            s = s.replace(amp, local)
    return s


def _strip_doc_wrapper(body_html):
    """Post bodies were stored as full HTML documents. Keep only the body's
    inner content, drop scripts, styles, and document-level tags.

    2026-08-21: some legacy custom-form pages (loveland-co-buyers-guide,
    newsletter) stored malformed HTML with NO <body> tag at all -- the whole
    hero + <style> block sit inside <head>. The <body> regex below correctly
    falls through to using the whole string on those, but until now nothing
    stripped the <style> block, so its raw CSS text leaked into the page as
    visible copy. Comments never render, but stripping them too keeps the
    fallback path clean regardless of how a future record is shaped."""
    s = body_html or ""
    m = re.search(r"<body[^>]*>([\s\S]*?)</body>", s, re.I)
    if m:
        s = m.group(1)
    s = re.sub(r"<!--[\s\S]*?-->", "", s)
    s = re.sub(r"<script[\s\S]*?</script>", "", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", "", s, flags=re.I)
    s = re.sub(r"<!DOCTYPE[^>]*>|</?html[^>]*>|</?head[^>]*>|<meta[^>]*>|<title[\s\S]*?</title>|<link[^>]*>", "", s, flags=re.I)
    # legacy copy writes tel:303-709-4262; iOS accepts it but the site-wide
    # convention (pinned by test-contact) is digits only.
    s = re.sub(r'href="(tel|sms):([^"]+)"',
               lambda m: f'href="{m.group(1)}:{re.sub(r"[^0-9+]", "", m.group(2))}"', s)
    return _localize_media(s.strip())


def _form_nested_html(b):
    """iHouseWeb "custom-form" blocks carried real page copy in a nested
    customContent block, sitting alongside the actual inputs -- headline,
    body, and on several pages named client testimonials.

    A form block's own top-level "html" is always None, so _authored_html
    skipped these entirely and the copy never reached the built page. That
    silently dropped ~13,700 words across 26 pages in the original migration,
    including two named testimonials on /cash-offer (Allie M., Downtown
    Loveland and Christine B., Estes Park) that appear nowhere else on the
    site. The inputs themselves are correctly NOT recovered -- those are
    replaced by the site's own Netlify-wired lead form (see leadForm below).
    """
    out = []
    for fb in ((b.get("options") or {}).get("formBlocks") or []):
        if fb.get("type") != "customContent":
            continue
        raw = (fb.get("options") or {}).get("html")
        if not raw:
            continue
        s = _strip_doc_wrapper(raw)
        # CKEditor left bookmark comments and runs of literal "{C}" in this
        # copy. They are invisible in a browser but they wreck tag matching --
        # the comment contains ">", so an <img> whose srcset runs through the
        # garbage no longer parses as a single tag and survived the CDN strip
        # below (caught on /colorado-investment-property). Clean first.
        s = re.sub(r"<!--\s*cke_bookmark[\s\S]*?-->", "", s, flags=re.I)
        s = re.sub(r"(?:\{C\}|%7BC%7D)+", "", s, flags=re.I)
        # The old page's own heading becomes a second <h1> under the site hero's
        # H1. Two H1s on a page is exactly the kind of thing that makes Google
        # pick its own title, so demote the recovered one to a section heading.
        s = re.sub(r"<h1\b[^>]*>", "<h2>", s, flags=re.I)
        s = re.sub(r"</h1>", "</h2>", s, flags=re.I)
        # The recovered markup ends with the old form's submit button and,
        # on some pages, an anchor to an iHouseWeb endpoint that no longer
        # exists. The page already has a real form; a second dead "Get My
        # Free Cash Offer" button below it is worse than no button.
        s = re.sub(r"<(?:button|input)\b[^>]*>(?:[\s\S]*?</button>)?", "", s, flags=re.I)
        s = re.sub(r"</?form\b[^>]*>", "", s, flags=re.I)
        # The recovered CTA on /cash-offer and /im-ready-to-sell-my-home points
        # at buymyhouse.com with a referral id. That looked at first like a
        # third-party leak worth stripping -- but nine pages already live on
        # this site (/cash-for-my-home, /fast-cash-offer, /cash-offer-now and
        # the cash-offer blog cluster) carry the same referral link, so the
        # relationship is active and these two pages were the inconsistent
        # ones. Kept as-is; removing it here would have quietly broken a
        # revenue path on her two highest-intent seller pages.
        # _strip_doc_wrapper already ran _localize_media, so anything still
        # pointing at the iHouseWeb CDN could not be rehosted: one URL is a
        # corrupt CKEditor artifact ({C}{C}{C}... plus a cke_bookmark comment)
        # and one is a licensed AdobeStock file that returns 403. The account
        # is retired and the CDN dies with it, so these would become broken
        # images on a live page -- and test-legacypages rightly fails the build
        # for hotlinking it. Drop the element, keep the surrounding copy.
        s = re.sub(r"<img\b[^>]*ihouseprd[^>]*>", "", s, flags=re.I)
        s = re.sub(r'<a\b[^>]*href="[^"]*ihouseprd[^"]*"[^>]*>([\s\S]*?)</a>',
                   r"\1", s, flags=re.I)
        # An <img> was often the only child of a <p> or <figure>; leaving the
        # empty wrapper behind prints a stray gap in the article.
        s = re.sub(r"<(p|figure)\b[^>]*>\s*(?:<br\s*/?>|&nbsp;|\s)*</\1>", "", s, flags=re.I)
        if s.strip():
            out.append(s.strip())
    return out


def _authored_html(term_blocks):
    parts = []
    for b in term_blocks or []:
        if b.get("html"):
            parts.append(_strip_doc_wrapper(b["html"]))
        elif b.get("type") == "form":
            parts.extend(_form_nested_html(b))
    return "\n".join(p for p in parts if p)


def _visible_words(html_text):
    return len(re.sub(r"<[^>]+>", " ", html_text or "").split())


def _first_words(html_text, n=40):
    t = re.sub(r"<[^>]+>", " ", html_text or "")
    t = re.sub(r"\s+", " ", t).strip()
    ws = t.split(" ")
    return " ".join(ws[:n]) + ("…" if len(ws) > n else "")


def _search_qs(search):
    p = {}
    if search.get("city"):
        p["cities"] = search["city"]
    if search.get("minPrice"):
        p["minPrice"] = str(search["minPrice"])
    if search.get("maxPrice"):
        p["maxPrice"] = str(search["maxPrice"])
    if search.get("propertyCategory"):
        p["propertyCategory"] = search["propertyCategory"]
    if search.get("subdivision"):
        p["subdivision"] = search["subdivision"].replace("-", " ").title()
    p["noFloor"] = "true"
    return "&".join(f"{k}={v.replace(' ', '%20')}" for k, v in p.items())


def _net_proceeds_calculator_body(B):
    """Real, working, client-side net-proceeds estimator for /home-sale-calculator.
    Modeled on build.py's mortgage-calculator.html widget (same .mc-input /
    .card / .grid-2 pattern) so it matches the rest of the site."""
    calc_script = """<script>
(function () {
  function fmt(n) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function calc() {
    var price = parseFloat(document.getElementById('npc-price').value) || 0;
    var payoff = parseFloat(document.getElementById('npc-payoff').value) || 0;
    var commPct = parseFloat(document.getElementById('npc-comm').value) || 0;
    var closePct = parseFloat(document.getElementById('npc-close').value) || 0;
    var concessions = parseFloat(document.getElementById('npc-concessions').value) || 0;

    var commission = price * (commPct / 100);
    var closing = price * (closePct / 100);
    var totalCosts = commission + closing + concessions + payoff;
    var net = price - totalCosts;

    document.getElementById('npc-comm-out').textContent = fmt(commission);
    document.getElementById('npc-close-out').textContent = fmt(closing);
    document.getElementById('npc-concessions-out').textContent = fmt(concessions);
    document.getElementById('npc-payoff-out').textContent = fmt(payoff);
    document.getElementById('npc-total-out').textContent = fmt(totalCosts);
    document.getElementById('npc-net').textContent = fmt(net);
  }
  document.querySelectorAll('.npc-input').forEach(function (el) {
    el.addEventListener('input', calc);
  });
  calc();
})();
</script>"""
    return f"""
<section class="hero" style="padding:100px 0 60px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Know Your Number Before You List</span>
    <h1>Home Sale Net Proceeds Calculator</h1>
    <p class="lede">Estimate what you'll actually walk away with after commission, closing costs, and
    your mortgage payoff — updates instantly as you type. Estimate only; every deal has details
    a real conversation catches that a calculator can't.</p>
  </div>
</section>
<section>
  <div class="wrap grid-2">
    <div class="card">
      <h2 class="widget-title">Your Numbers</h2>
      <div style="display:grid;gap:14px;margin-top:16px">
        <label class="consent">Estimated Sale Price
          <input class="npc-input" id="npc-price" type="number" value="500000" step="1000"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Mortgage Payoff Balance
          <input class="npc-input" id="npc-payoff" type="number" value="0" step="1000"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Commission Rate (% of price)
          <input class="npc-input" id="npc-comm" type="number" value="6" step="0.5"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Closing Costs / Title &amp; Escrow (% of price)
          <input class="npc-input" id="npc-close" type="number" value="1.5" step="0.1"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Repairs / Buyer Concessions ($)
          <input class="npc-input" id="npc-concessions" type="number" value="0" step="500"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
      </div>
    </div>
    <div class="card">
      <h3>Estimated Net Proceeds</h3>
      <p style="font-size:34px;font-family:var(--font-serif);margin:8px 0 20px" id="npc-net">$0</p>
      <table style="width:100%;font-size:14px;color:#4a4a4c;border-collapse:collapse">
        <tr><td style="padding:6px 0">Commission</td><td style="text-align:right" id="npc-comm-out">$0</td></tr>
        <tr><td style="padding:6px 0">Closing Costs</td><td style="text-align:right" id="npc-close-out">$0</td></tr>
        <tr><td style="padding:6px 0">Repairs / Concessions</td><td style="text-align:right" id="npc-concessions-out">$0</td></tr>
        <tr><td style="padding:6px 0">Mortgage Payoff</td><td style="text-align:right" id="npc-payoff-out">$0</td></tr>
        <tr style="border-top:1px solid #e4e4d8"><td style="padding:10px 0 0;font-weight:700">Total Costs</td><td style="text-align:right;font-weight:700;padding-top:10px" id="npc-total-out">$0</td></tr>
      </table>
      <div class="btn-row" style="justify-content:flex-start;margin-top:24px">
        <a class="btn btn-dark" href="/free-home-valuation.html">Get A Real Valuation For My Home</a>
      </div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <p class="lede">This is an estimate, not a net sheet — your actual commission rate, closing costs, and
    any negotiated repairs or concessions will be spelled out in writing before you ever sign
    anything. {B.esc(B.SITE['agent'])} builds a real net sheet for every listing using your
    actual mortgage payoff and the specific terms on the table.</p>
  </div>
</section>
{calc_script}
"""


def _max_home_price_calculator_body(B):
    """Real, working, client-side affordability estimator for /affordability-calculator.
    Solves for max home price algebraically from a standard 28/36 debt-to-income
    guideline, mirroring the mortgage-calculator.html pattern in build.py."""
    calc_script = """<script>
(function () {
  function fmt(n) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function calc() {
    var income = parseFloat(document.getElementById('mhp-income').value) || 0;
    var debts = parseFloat(document.getElementById('mhp-debts').value) || 0;
    var down = parseFloat(document.getElementById('mhp-down').value) || 0;
    var rate = parseFloat(document.getElementById('mhp-rate').value) || 0;
    var years = parseFloat(document.getElementById('mhp-term').value) || 30;
    var taxRate = parseFloat(document.getElementById('mhp-tax').value) || 0;
    var ins = parseFloat(document.getElementById('mhp-ins').value) || 0;
    var hoa = parseFloat(document.getElementById('mhp-hoa').value) || 0;

    var frontMax = income * 0.28;
    var backMax = income * 0.36 - debts;
    var budget = Math.max(0, Math.min(frontMax, backMax));
    var c = Math.max(0, budget - ins - hoa);

    var r = (rate / 100) / 12;
    var n = years * 12;
    var factor;
    if (r > 0) {
      factor = r / (1 - Math.pow(1 + r, -n));
    } else {
      factor = n > 0 ? (1 / n) : 0;
    }
    var taxFactor = (taxRate / 100) / 12;
    var denom = factor + taxFactor;
    var price = denom > 0 ? (c + down * factor) / denom : down;
    price = Math.max(price, 0);
    var loan = Math.max(price - down, 0);
    var piMonthly = loan * factor;
    var taxMonthly = price * taxFactor;

    document.getElementById('mhp-price').textContent = fmt(price);
    document.getElementById('mhp-loan-out').textContent = fmt(loan);
    document.getElementById('mhp-pi-out').textContent = fmt(piMonthly);
    document.getElementById('mhp-tax-out').textContent = fmt(taxMonthly);
    document.getElementById('mhp-ins-out').textContent = fmt(ins);
    document.getElementById('mhp-hoa-out').textContent = fmt(hoa);
    document.getElementById('mhp-budget-out').textContent = fmt(budget);
  }
  document.querySelectorAll('.mhp-input').forEach(function (el) {
    el.addEventListener('input', calc);
  });
  calc();
})();
</script>"""
    return f"""
<section class="hero" style="padding:100px 0 60px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Know What You Can Afford First</span>
    <h1>Home Affordability Calculator</h1>
    <p class="lede">See roughly how much home you can afford based on your income, debts, and down
    payment — using the standard 28/36 lending guideline. Estimate only; a lender's actual
    pre-approval depends on your full credit and financial picture.</p>
  </div>
</section>
<section>
  <div class="wrap grid-2">
    <div class="card">
      <h2 class="widget-title">Your Numbers</h2>
      <div style="display:grid;gap:14px;margin-top:16px">
        <label class="consent">Gross Monthly Income (before taxes)
          <input class="mhp-input" id="mhp-income" type="number" value="8000" step="100"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Other Monthly Debts (car, cards, student loans)
          <input class="mhp-input" id="mhp-debts" type="number" value="500" step="50"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Down Payment ($)
          <input class="mhp-input" id="mhp-down" type="number" value="40000" step="1000"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Interest Rate (%)
          <input class="mhp-input" id="mhp-rate" type="number" value="6.65" step="0.05"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Loan Term (years)
          <input class="mhp-input" id="mhp-term" type="number" value="30" step="5"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Property Tax Rate (% of price / yr)
          <input class="mhp-input" id="mhp-tax" type="number" value="0.6" step="0.05"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">Homeowners Insurance ($ / month)
          <input class="mhp-input" id="mhp-ins" type="number" value="120" step="5"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
        <label class="consent">HOA Dues ($ / month)
          <input class="mhp-input" id="mhp-hoa" type="number" value="0" step="5"
            style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid var(--gray)">
        </label>
      </div>
    </div>
    <div class="card">
      <h3>Estimated Max Home Price</h3>
      <p style="font-size:34px;font-family:var(--font-serif);margin:8px 0 20px" id="mhp-price">$0</p>
      <table style="width:100%;font-size:14px;color:#4a4a4c;border-collapse:collapse">
        <tr><td style="padding:6px 0">Loan Amount</td><td style="text-align:right" id="mhp-loan-out">$0</td></tr>
        <tr><td style="padding:6px 0">Principal &amp; Interest / mo</td><td style="text-align:right" id="mhp-pi-out">$0</td></tr>
        <tr><td style="padding:6px 0">Property Tax / mo</td><td style="text-align:right" id="mhp-tax-out">$0</td></tr>
        <tr><td style="padding:6px 0">Insurance / mo</td><td style="text-align:right" id="mhp-ins-out">$0</td></tr>
        <tr><td style="padding:6px 0">HOA / mo</td><td style="text-align:right" id="mhp-hoa-out">$0</td></tr>
        <tr style="border-top:1px solid #e4e4d8"><td style="padding:10px 0 0;font-weight:700">Total Monthly Budget</td><td style="text-align:right;font-weight:700;padding-top:10px" id="mhp-budget-out">$0</td></tr>
      </table>
      <div class="btn-row" style="justify-content:flex-start;margin-top:24px">
        <a class="btn btn-dark" href="/search-homes.html">Search Homes In This Range</a>
      </div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <p class="lede">This uses the 28/36 rule — a common lending guideline capping housing costs at 28%
    of gross monthly income and total debt at 36% — not a guaranteed approval amount. The default
    interest rate above reflects Freddie Mac's 30-year fixed average as of August 20, 2026
    (<a href="https://www.freddiemac.com/pmms" style="text-decoration:underline">freddiemac.com/pmms</a>);
    your actual rate depends on your lender, credit, and loan program. {B.esc(B.SITE['agent'])} works
    with local lenders who can turn this estimate into a real pre-approval.</p>
  </div>
</section>
{calc_script}
"""


def build_legacy_pages(B):
    """B is the build module (build.py), passed in to reuse its page shell,
    widgets, and OUT dir without a circular import."""
    del LEGACY_SITEMAP_PATHS[:]
    data_path = os.path.join(os.path.dirname(__file__), "data", "legacy_terms.json")
    if not os.path.exists(data_path):
        print("  legacy pages: no build/data/legacy_terms.json — skipped")
        return
    with open(data_path) as f:
        terms = json.load(f)["terms"]

    # content records for authored blocks live alongside the terms file
    content_dir = os.path.join(os.path.dirname(__file__), "data", "legacy_content")

    # The demand-driven upgrade layer (2026-08-19, Christine: "most traffic
    # pages even better and more detailed based on what people are
    # searching"): per-URL title/meta rewrites, added question-answer
    # sections, and FAQ blocks with FAQPage schema, written against the
    # page's real Search Console queries. Merged OVER the migrated content,
    # never replacing it -- keep-what-ranks applies to body copy too.
    enhancements = {}
    enh_path = os.path.join(os.path.dirname(__file__), "data", "enhanced_pages.json")
    if os.path.exists(enh_path):
        with open(enh_path) as f:
            enhancements = json.load(f)

    # site/ persists between builds, so "does the file exist" would see THIS
    # module's own output from the previous run and conclude the engine owns
    # every page. The marker file records what this module wrote last time;
    # only a file that exists AND isn't ours counts as an engine page.
    marker_path = os.path.join(os.path.dirname(__file__), "data", ".legacy_outputs.json")
    previously_ours = set()
    if os.path.exists(marker_path):
        with open(marker_path) as f:
            previously_ours = set(json.load(f))

    redirects = []
    ours = []
    built = skipped_existing = market_reports = 0

    for t in terms:
        url = t["url"]
        if url == "/" or url.startswith("/-/"):
            continue
        rel = url.lstrip("/")
        # RENAMED is hand-curated -- every key in it is a slug someone
        # already confirmed is a legacy shell that must 301, never a real
        # engine page (see the per-entry comments above: two competing Weld
        # foreclosure pages, an old iHouseWeb form URL now built as a
        # community page, etc). Check it before engine_owned rather than
        # after: engine_owned's own judgment call ("not in previously_ours
        # AND a file already exists -> must be the engine's own page") can
        # be fooled by exactly the case RENAMED exists to fix -- a page this
        # module built once, in a run before it was added to RENAMED, whose
        # output is still sitting in site/ (which nothing here ever prunes)
        # but is no longer listed in this run's marker snapshot. That file
        # would otherwise be misread as "the engine owns this" and left on
        # disk forever, still deployed, still crawlable, never touched again
        # by any code path -- which is exactly how /expiredlisting.html
        # survived being added to RENAMED. A RENAMED hit means the answer is
        # known regardless of what engine_owned would have concluded.
        if url in RENAMED:
            redirects.append(f"{url} {RENAMED[url]} 301!")
            for _stale in (os.path.join(B.OUT, rel + ".html"),
                           os.path.join(B.OUT, rel, "index.html")):
                if os.path.exists(_stale):
                    os.remove(_stale)
            continue
        # engine already serves this path (same name) -> engine page wins
        engine_owned = (url + ".html") not in previously_ours and (
            os.path.exists(os.path.join(B.OUT, rel + ".html")) or
            os.path.exists(os.path.join(B.OUT, rel, "index.html")))
        if engine_owned:
            skipped_existing += 1
            continue

        title = t.get("title") or t.get("name") or rel.replace("-", " ").title()
        meta = t.get("metaDescription") or ""
        h1 = t.get("name") or title.split(" | ")[0]
        enh = enhancements.get(url) or {}
        if enh.get("title"):
            title = enh["title"]
        if enh.get("metaDescription"):
            meta = enh["metaDescription"]
        if enh.get("h1"):
            h1 = enh["h1"]

        content_rec = {}
        rec_path = os.path.join(content_dir, rel.replace("/", "__") + ".json")
        if os.path.exists(rec_path):
            with open(rec_path) as f:
                content_rec = json.load(f)

        # ---- market report pages own their whole body ---------------------
        # 16 legacy URLs carried a dynamic marketReportBlock (an Altos iframe
        # plus iHouseWeb's own widget). Neither survives a static build, and
        # because the widget WAS the content the migration crawl recorded
        # words=0 for every one -- so the >30-word guard below correctly
        # dropped what little was there and published a 54-word shell. Those
        # shells hold 19,923 Search Console impressions at a 0.19% CTR.
        #
        # The block declares its own town, so read the town from the data
        # rather than parsing slugs, and hand the page to the live generator
        # in build.py. It renders its own hero, so skip the default one.
        # Guarded on words<=30 -- the same threshold the authored-content check
        # below uses. /eaton-home-value also carries a marketReportBlock but has
        # 133 real words and is a valuation page, not a market report; taking it
        # over would have destroyed migrated copy and answered a question the
        # visitor did not ask. Only pages that would otherwise render an empty
        # shell are eligible.
        mr_city = mr_state = None
        if t.get("words", 0) <= 30:
            for blk in content_rec.get("blocks") or []:
                if blk.get("type") == "marketReportBlock":
                    value = ((blk.get("options") or {}).get("location") or {}).get("value") or ""
                    if "," in value:
                        mr_city, mr_state = [s.strip() for s in value.split(",", 1)]
                    break

        if mr_city:
            mr_body, mr_title, mr_meta, mr_schema = B.town_market_report_body(
                mr_city, mr_state, url)
            body_parts = [mr_body]
            # An explicit enhancement still wins; otherwise the generated
            # title/meta carry the live figures, which is the point.
            if not enh.get("title"):
                title = mr_title
            if not enh.get("metaDescription"):
                meta = mr_meta
            B.page(title, meta, url + ".html", None, "\n".join(body_parts),
                   schema_extra=[mr_schema] if mr_schema else "")
            # 2026-08-23 (Wave 4): the post-hoc canonical rewrite that used
            # to run here converted the .html canonical to the extensionless
            # legacy iHouseWeb form. Netlify 301-redirects extensionless →
            # .html in production, so the declared canonical was itself a
            # redirect target — the state Google treats as "canonical URL
            # not reachable, choose our own". Removed. The default .html
            # canonical emitted by head() is what serves 200 and what the
            # sitemap now lists.
            LEGACY_SITEMAP_PATHS.append(url + ".html")
            ours.append(url + ".html")
            built += 1
            market_reports += 1
            continue

        if url in ("/home-sale-calculator", "/affordability-calculator"):
            if url == "/home-sale-calculator":
                calc_title = "Home Sale Net Proceeds Calculator | " + B.SITE["agent"] + " | Northern Colorado"
                calc_meta = ("Estimate your net proceeds from selling your Northern Colorado home. "
                             "Free calculator factors in commission, closing costs, repairs, and your "
                             "mortgage payoff — instant results.")
                calc_body = _net_proceeds_calculator_body(B)
            else:
                calc_title = "Home Affordability Calculator | " + B.SITE["agent"] + " | Northern Colorado"
                calc_meta = ("Find out how much home you can afford in Northern Colorado. Free "
                             "affordability calculator uses income, debts, and down payment to estimate "
                             "your max home price.")
                calc_body = _max_home_price_calculator_body(B)
            B.page(calc_title, calc_meta, url + ".html", None, calc_body)
            # 2026-08-23 (Wave 4): extensionless-canonical rewrite removed.
            # See the note on the market-report branch above.
            LEGACY_SITEMAP_PATHS.append(url + ".html")
            ours.append(url + ".html")
            built += 1
            continue

        body_parts = [f"""
<section class="hero" style="padding:80px 0 40px">
  <div class="wrap">
    <h1>{B.esc(h1)}</h1>
  </div>
</section>"""]

        if t.get("kind") == "blogPost" and content_rec.get("post", {}).get("body"):
            post = content_rec["post"]
            date = (post.get("publishDate") or "")[:10]
            article = _strip_doc_wrapper(post["body"])
            # The stored body opens by repeating the page's own H1 (the hero
            # above already shows it). Drop the first h1 wherever it sits in
            # the opening of the article -- iHouseWeb bodies often lead with
            # leftover head debris before it.
            head_zone = article[:800]
            head_zone_fixed = re.sub(r"<h1[\s\S]*?</h1>", "", head_zone, count=1)
            article = head_zone_fixed + article[800:]
            body_parts.append(f"""
<section class="tight">
  <div class="wrap" style="max-width:760px">
    {f'<p class="search-status" style="margin-bottom:18px">By {B.esc(post.get("author") or B.SITE["agent"])}{f" · {date}" if date else ""}</p>' if True else ''}
    <div class="blog-article">{article}</div>
  </div>
</section>""")
        else:
            authored = _authored_html(content_rec.get("blocks"))
            # legacy_terms' "words" was counted from the top-level block html,
            # which is None on a form block -- so every page whose copy was
            # nested inside a custom-form recorded words: 0 and got refused
            # here even once _authored_html could see it (this covers
            # /newsletter and /loveland-co-buyers-guide, 2026-08-21). Measure
            # what we actually recovered instead of trusting the precomputed
            # count.
            # /dream-home-finder's recovered copy carries its own "Frequently
            # Asked Questions" h2, and the enhancement adds a second FAQ block
            # under the same heading. The two question sets are different and
            # both worth keeping (general buyer questions vs. questions about
            # this specific tool), so retitle the recovered one rather than
            # dropping either. Only fires when the enhancement really does add
            # a competing FAQ heading.
            if authored and enh.get("faq"):
                authored = re.sub(
                    r"(<h2\b[^>]*>)\s*Frequently Asked Questions\s*(</h2>)",
                    r"\1Questions We Hear A Lot\2", authored, flags=re.I)
            if authored and max(t.get("words", 0), _visible_words(authored)) > 30:
                body_parts.append(f"""
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <div class="blog-article">{authored}</div>
  </div>
</section>""")

        # An "intro" renders ABOVE the migrated body. Appending is the right
        # default -- it never destroys authored copy -- but it is the wrong
        # shape for a page whose whole query is a direct question. Someone
        # searching "how far is Windsor from Denver" wants the number, and
        # burying it under 330 words of dining copy is why that page sits at
        # position 8 with a 0.09% CTR. Intro puts the answer first; the
        # original post keeps every word it had, one scroll down.
        intro = enh.get("intro") or []
        if intro:
            intro_html = "\n    ".join(
                f"<p>{B._blog_para_html(par)}</p>" for par in intro)
            # body_parts[0] is always the hero, so index 1 is directly under
            # the H1 and above the migrated article.
            body_parts.insert(1, f"""
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <div class="blog-article">
    {intro_html}
    </div>
  </div>
</section>""")

        # ---- demand-driven upgrades (see enhanced_pages.json) ------------
        enh_schema = ""
        for sec in enh.get("sections") or []:
            paras = "\n    ".join(
                f"<p>{B._blog_para_html(par)}</p>" for par in sec.get("paragraphs", []))
            body_parts.append(f"""
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <h2 class="section-title" style="font-size:clamp(22px,2.6vw,30px)">{B.esc(sec.get("h2", ""))}</h2>
    {paras}
  </div>
</section>""")
        if enh.get("faq"):
            faq_html, enh_schema = B._faq_block([(q, a) for q, a in enh["faq"]])
            body_parts.append(faq_html)

        # A lead page without a lead form is a brochure. The old iHouseWeb
        # versions of these pages WERE forms (custom-form blocks) -- that's
        # where the veteran and first-time-buyer leads actually came from --
        # so an enhancement can declare one and get the site's standard
        # Netlify-wired form (honeypot, consent line, submission-created ->
        # Lofty + notification, /thank-you.html redirect). Netlify registers
        # new form names automatically on deploy.
        lf = enh.get("leadForm")
        if lf:
            body_parts.append(f"""
<section class="tight">
  <div class="wrap" style="max-width:640px">
    <span class="eyebrow" style="color:var(--dusty-rose)">{B.esc(lf.get("kicker", "No Pressure, Real Answers"))}</span>
    <h2 class="section-title">{B.esc(lf["heading"])}</h2>
    <p class="lede">{B.esc(lf.get("lede", ""))}</p>
    {B._tool_lead_form(lf["name"], lf.get("button", "Send"), lf.get("extraFields", ""))}
  </div>
</section>""")

        search = t.get("search")
        if search:
            qs = _search_qs(search)
            feed_params = {}
            if search.get("city"):
                feed_params["city"] = search["city"]
            if search.get("minPrice"):
                feed_params["minPrice"] = str(search["minPrice"])
            if search.get("maxPrice"):
                feed_params["maxPrice"] = str(search["maxPrice"])
            if search.get("propertyCategory"):
                feed_params["propertyCategory"] = search["propertyCategory"]
            if search.get("subdivision"):
                feed_params["subdivision"] = search["subdivision"].replace("-", " ").title()
            label = search.get("city") or "this area"
            body_parts.append(f"""
<section>
  <div class="wrap">
    <h2 class="section-title">Current Listings</h2>
    {B._live_feed_widget("legacy_" + re.sub(r"[^a-z0-9]+", "_", rel), feed_params)}
    <div class="btn-row" style="margin-top:26px">
      <a class="btn btn-dark" href="/search-homes.html?{qs}">See Every Match &amp; Filter Further &rarr;</a>
    </div>
  </div>
</section>""")

        # every legacy page ends with a way to reach Christine
        body_parts.append(f"""
<section class="tight">
  <div class="wrap center">
    <h2 class="section-title">Want A Local's Eye On This?</h2>
    <p class="lede" style="max-width:560px;margin:0 auto 22px">{B.esc(B.SITE['agent'])} answers these
    questions for buyers and sellers every week — at every price point. No pressure, real answers.</p>
    <div class="btn-row" style="justify-content:center">
      <a class="btn btn-primary" href="/contact.html">Ask Christine</a>
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/search-homes.html">Search Homes</a>
    </div>
  </div>
</section>""")

        B.page(title, meta or _first_words(_authored_html(content_rec.get("blocks")), 24) or
               f"{h1} — {B.SITE['name']}.",
               url + ".html", None, "\n".join(body_parts),
               schema_extra=[enh_schema] if enh_schema else "")
        # 2026-08-23 (Wave 4): the previous behaviour rewrote the .html
        # canonical to the extensionless legacy iHouseWeb URL so "canonical
        # must match the legacy URL exactly (extensionless)" — but in
        # production Netlify 301-redirects extensionless → .html, so the
        # declared canonical redirected. Google's rule: canonical URLs must
        # be reachable as 200, or Google picks its own. That put ~610 pages
        # in exactly the "Duplicate, Google chose a different canonical"
        # state Wave 2 was supposed to eliminate. Removed. The default .html
        # canonical from head() is what serves 200 and what the sitemap
        # emits, so declared canonical + sitemap + served URL now agree.
        LEGACY_SITEMAP_PATHS.append(url + ".html")
        ours.append(url + ".html")
        built += 1

    # build_redirects_and_meta() writes site/_redirects wholesale AFTER this
    # runs, so these lines are handed to the build module and merged there
    # (before its broad catch-all patterns, which must stay last).
    B.LEGACY_REDIRECTS = ["# legacy iHouseWeb renames (see build/legacy_pages.py)"] + redirects

    # ---- the directory page --------------------------------------------
    # Two jobs: (1) no legacy page is an orphan — every one is reachable from
    # the footer via this page, which is what keeps internal-links honest and
    # gives crawlers a path to all ~550 of them; (2) it's genuinely useful —
    # the old site had no index of its own long tail.
    fam_order = [
        ("Rent-To-Own In Northern Colorado", lambda u: "rent-to-own" in u),
        ("Land, Zoning & Rural Living Guides",
         lambda u: re.search(r"land|zoning|acreage|survey|septic|well|barn|ilc|rural|agricultur", u)),
        ("Browse Homes By Town & Price",
         lambda u: re.search(r"for-sale-in-|-homes$|foreclosure", u)),
        ("Guides, Stories & Local Life", lambda u: True),
    ]
    groups = {name: [] for name, _ in fam_order}
    for t in terms:
        u = t["url"]
        if (u + ".html") not in set(LEGACY_SITEMAP_PATHS):
            continue
        label = (t.get("name") or (t.get("title") or "").split(" | ")[0] or u.strip("/")).strip()
        for name, match in fam_order:
            if match(u.strip("/")):
                groups[name].append((label, u))
                break
    sections = []
    for name, _ in fam_order:
        items = sorted(groups[name])
        if not items:
            continue
        links = "\n      ".join(
            f'<li><a href="{u}">{B.esc(label)}</a></li>' for label, u in items)
        sections.append(f"""
<section class="tight">
  <div class="wrap">
    <h2 class="section-title">{B.esc(name)}</h2>
    <ul class="directory-list" style="columns:2;column-gap:40px;list-style:none;padding:0;line-height:2">
      {links}
    </ul>
  </div>
</section>""")
    B.page(
        "Site Directory | Every Guide, Town & Search Page",
        f"Every page on {B.SITE['name']} — rent-to-own guides, land and zoning "
        "answers, town-by-town home searches, and local stories.",
        "/site-directory.html", None,
        """
<section class="hero" style="padding:80px 0 40px">
  <div class="wrap">
    <h1>Site Directory</h1>
    <p class="lede">Everything on this site, in one place — the guides, the towns, the searches.</p>
  </div>
</section>""" + "\n".join(sections))
    LEGACY_SITEMAP_PATHS.append("/site-directory.html")

    with open(marker_path, "w") as f:
        json.dump(sorted(ours + ["/site-directory.html"]), f, indent=1)

    print(f"  legacy pages: {built} rebuilt at exact URLs, {len(redirects)} renamed->301, "
          f"{skipped_existing} already served by engine pages")
    print(f"  legacy pages: {market_reports} town market reports generated from live "
          f"IRES inventory")
