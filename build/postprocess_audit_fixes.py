#!/usr/bin/env python3
"""Post-build corrections and guardrails for The Little Lady Sells Homes.

This runs AFTER build/build.py and BEFORE Netlify publishes site/.  It exists to
fix output-level issues discovered in the Aug. 31, 2026 forensic audit without
reopening the site's recent URL/performance migration.

The rules are intentionally narrow and defensive:
  * never rename canonical URLs;
  * never remove legacy redirects;
  * turn Meta Lead into a confirmed-success event, not a submit-attempt event;
  * rewrite internal links that point through our own 301s;
  * stop fake build-date freshness signals;
  * label stale MLS snapshots honestly;
  * remove public Search Console counts;
  * replace self-nominating SEO FAQs with consumer questions;
  * surgically clean the two high-engagement legacy pages flagged in the audit;
  * add privacy-safe business funnel events;
  * validate every invariant and fail the deploy if one regresses.

No third-party packages are required.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html as html_lib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
TODAY = dt.date.today()
SITE_HOSTS = {"www.thelittleladysellshomes.com", "thelittleladysellshomes.com"}


def _fail(msg: str) -> None:
    raise RuntimeError(msg)


def _html_files() -> list[Path]:
    return sorted(SITE.rglob("*.html"))


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def _committed_text(path: Path) -> str | None:
    """Read HEAD's committed version even after build.py has overwritten site/."""
    rel = path.relative_to(ROOT).as_posix()
    try:
        p = subprocess.run(
            ["git", "show", f"HEAD:{rel}"],
            cwd=ROOT,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return None
    if p.returncode != 0:
        return None
    try:
        return p.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _normalize_for_change_detection(text: str) -> str:
    """Ignore only known build/deploy noise; real copy/markup changes remain."""
    text = re.sub(
        r'<meta property="og:updated_time" content="\d{4}-\d{2}-\d{2}">',
        '<meta property="og:updated_time" content="DATE">',
        text,
    )
    text = re.sub(
        r'<meta name="last-modified" content="\d{4}-\d{2}-\d{2}">',
        '<meta name="last-modified" content="DATE">',
        text,
    )
    # build.py stamps RealEstateAgent dateModified with BUILD_DATE.  That field
    # is removed later, so ignore it when deciding whether the PAGE changed.
    text = re.sub(r'("@type"\s*:\s*"RealEstateAgent"[\s\S]{0,3500}?"dateModified"\s*:\s*)"\d{4}-\d{2}-\d{2}"', r'\1"DATE"', text)
    return text


def _extract_meta_date(text: str) -> dt.date | None:
    m = re.search(r'<meta name="last-modified" content="(\d{4}-\d{2}-\d{2})">', text)
    if not m:
        return None
    try:
        return dt.date.fromisoformat(m.group(1))
    except ValueError:
        return None


def _extract_blogposting_date(text: str) -> dt.date | None:
    for raw in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>', text):
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        candidates = obj if isinstance(obj, list) else [obj]
        for item in candidates:
            if isinstance(item, dict) and item.get("@type") in {"BlogPosting", "Article", "NewsArticle"}:
                value = item.get("dateModified") or item.get("datePublished")
                if isinstance(value, str):
                    try:
                        return dt.date.fromisoformat(value[:10])
                    except ValueError:
                        pass
    return None


def _market_asof(text: str) -> dt.date | None:
    # Current output: "last refreshed 9 days ago (August 17, 2026)."
    m = re.search(r'last refreshed\s+\d+\s+days? ago\s*\(([^)]+)\)', text, flags=re.I)
    if not m:
        # Also accept the corrected wording on repeated runs.
        m = re.search(r'refreshed\s+<strong>([A-Z][a-z]+ \d{1,2}, \d{4})</strong>', text)
    if not m:
        return None
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return dt.datetime.strptime(html_lib.unescape(m.group(1)), fmt).date()
        except ValueError:
            pass
    return None


def _meaningful_date(path: Path, current: str) -> dt.date:
    market_date = _market_asof(current)
    if market_date:
        return market_date

    previous = _committed_text(path)
    if previous is not None and _normalize_for_change_detection(previous) == _normalize_for_change_detection(current):
        # BlogPosting already carries the article's real content date.  Prefer it
        # to the previously build-stamped meta date when the article itself did
        # not change in this deploy.
        blog_date = _extract_blogposting_date(current)
        if blog_date:
            return blog_date
        old = _extract_meta_date(previous)
        if old:
            return old
    return TODAY


def _rewrite_jsonld(text: str, page_date: dt.date, *, homepage: bool = False, rent_to_own: bool = False) -> str:
    home_faqs = [
        ("What types of Northern Colorado properties do you work with?",
         "Christine represents residential buyers and sellers across Northern Colorado, including acreage and horse property, homes with wells or septic systems, relocation, first-time buyers, and traditional in-town homes."),
        ("Where does The Little Lady Sells Homes work?",
         "Christine is based in Loveland and works throughout Northern Colorado and other Colorado Front Range markets shown on this site, with especially deep coverage across Larimer and Weld Counties."),
        ("What happens after I contact Christine?",
         "You will hear directly from Christine or her real estate team about your specific goal and the next useful step. Website lead forms are routed through the site's lead system and the thank-you page confirms a successful submission."),
        ("Do you represent both buyers and sellers?",
         "Yes. Christine represents buyers and sellers, including clients who are relocating, buying acreage, purchasing a first home, selling a current home, or comparing a move within Northern Colorado."),
        ("What is included in your listing marketing?",
         "Listing marketing is tailored to the property and can include professional photography, real video, online distribution, social media, and a pricing and launch strategy built around the home's actual market."),
    ]
    rto_faqs = [
        ("Are rent-to-own homes legitimate in Colorado?",
         "Some are legitimate, but every agreement should be verified carefully. Confirm ownership, understand the option fee and rent-credit terms, compare the purchase price with the market, and have a Colorado attorney review legal provisions before you sign."),
        ("How does rent-to-own work in Colorado?",
         "A rent-to-own arrangement combines a lease with either an option to buy or a purchase obligation. The contract controls the price, option fee, rent credits, repairs, deadlines, and what happens if the buyer cannot obtain financing later."),
        ("What credit score do I need for rent-to-own?",
         "There is no single rent-to-own credit-score rule. Requirements vary by seller or program, and the mortgage needed to complete the purchase later has its own underwriting standards. A lender should review your current qualification before you pay an option fee."),
        ("What is the difference between lease-option and lease-purchase?",
         "A lease-option generally gives the tenant a right, but not always an obligation, to buy. A lease-purchase can create a contractual purchase obligation. The exact Colorado contract language matters, so legal questions belong with a Colorado attorney."),
        ("What alternatives should I check before rent-to-own?",
         "Ask a lender to check current conventional, FHA, VA, USDA and Colorado down-payment-assistance options for your situation. Eligibility, geography, income limits and available assistance change, so the current program rules should be verified before comparing them with rent-to-own."),
    ]

    def fix_obj(obj):
        if isinstance(obj, list):
            return [fix_obj(x) for x in obj]
        if not isinstance(obj, dict):
            return obj
        out = {k: fix_obj(v) for k, v in obj.items()}
        typ = out.get("@type")
        if typ == "RealEstateAgent":
            # This is an entity profile, not a page freshness object.  A daily
            # BUILD_DATE here falsely claims the agent entity changed every deploy.
            out.pop("dateModified", None)
        if typ in {"BlogPosting", "Article", "NewsArticle"} and page_date:
            out["dateModified"] = page_date.isoformat()
        if typ == "FAQPage":
            items = out.get("mainEntity") or []
            if homepage:
                items = [
                    {"@type": "Question", "name": q,
                     "acceptedAnswer": {"@type": "Answer", "text": a}}
                    for q, a in home_faqs
                ]
            elif rent_to_own:
                items = [
                    {"@type": "Question", "name": q,
                     "acceptedAnswer": {"@type": "Answer", "text": a}}
                    for q, a in rto_faqs
                ]
            else:
                items = [x for x in items if not (
                    isinstance(x, dict) and re.search(
                        r'who is (?:the )?(?:best|top).*real estate agent|top female real estate agent',
                        str(x.get("name", "")), re.I)
                )]
            out["mainEntity"] = items
        return out

    def repl(m):
        raw = m.group(1)
        try:
            obj = json.loads(raw)
        except Exception:
            return m.group(0)
        fixed = fix_obj(obj)
        if isinstance(fixed, dict) and fixed.get("@type") == "FAQPage" and not fixed.get("mainEntity"):
            return ""
        return '<script type="application/ld+json">' + json.dumps(fixed, ensure_ascii=False, separators=(",", ":")) + '</script>'

    return re.sub(r'<script type="application/ld\+json">([\s\S]*?)</script>', repl, text)


def _set_freshness(text: str, page_date: dt.date, *, homepage: bool = False, rent_to_own: bool = False) -> str:
    iso = page_date.isoformat()
    text = re.sub(r'<meta property="og:updated_time" content="[^"]+">', f'<meta property="og:updated_time" content="{iso}">', text)
    text = re.sub(r'<meta name="last-modified" content="[^"]+">', f'<meta name="last-modified" content="{iso}">', text)
    return _rewrite_jsonld(text, page_date, homepage=homepage, rent_to_own=rent_to_own)


def _redirect_map() -> dict[str, str]:
    path = SITE / "_redirects"
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for line in _read(path).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        src, dst, status = parts[:3]
        if not status.startswith("301") or not src.startswith("/"):
            continue
        # Wildcards/placeholders are routing rules, not literal internal links.
        if any(ch in src for ch in "*: "):
            continue
        out[src] = dst
    return out


def _resolve_redirect(path: str, redirects: dict[str, str]) -> str | None:
    seen = set()
    cur = path
    for _ in range(12):
        if cur in seen:
            return None
        seen.add(cur)
        dst = redirects.get(cur)
        if not dst:
            return cur if cur != path else None
        if dst.startswith("http://") or dst.startswith("https://"):
            return dst
        cur = dst
    return None


def _rewrite_internal_redirect_links(text: str, redirects: dict[str, str]) -> tuple[str, int]:
    changed = 0

    def repl(m):
        nonlocal changed
        quote, href = m.group(1), html_lib.unescape(m.group(2))
        if not href.startswith("/") or href.startswith("//"):
            return m.group(0)
        split = urlsplit(href)
        final = _resolve_redirect(split.path, redirects)
        if not final:
            return m.group(0)
        if final.startswith("http"):
            new = final
            if split.query:
                new += ("&" if "?" in new else "?") + split.query
            if split.fragment:
                new += "#" + split.fragment
        else:
            new = urlunsplit(("", "", final, split.query, split.fragment))
        if new == href:
            return m.group(0)
        changed += 1
        return f'href={quote}{html_lib.escape(new, quote=True)}{quote}'

    return re.sub(r'href=(["\'])([^"\']+)\1', repl, text), changed


def _fix_meta_lead_tracking(text: str) -> str:
    # Remove the generator's current Meta event: browser submit != successful lead.
    # Match only the narrow listener that checks .lead-form and fires Lead.
    pattern = re.compile(
        r'document\.addEventListener\(\'submit\',function\(e\)\{'
        r'var f=e\.target;'
        r'if\(f&&f\.classList&&f\.classList\.contains\(\'lead-form\'\)\)\{'
        r'fbq\(\'track\',\'Lead\',\{form_name:f\.getAttribute\(\'name\'\)\|\|\'unknown\'\}\);'
        r'\}\},\{capture:true,passive:true\}\);'
    )
    return pattern.sub("", text)


def _ensure_confirmed_meta_lead(text: str) -> str:
    marker = "confirmed_meta_lead"
    if marker in text:
        return text
    script = """<script id="confirmed_meta_lead">(function(){try{var p=new URLSearchParams(location.search);var f=p.get('from');if(f&&typeof window.fbq==='function'){window.fbq('track','Lead',{form_name:f,success:'confirmed'});}}catch(e){}})();</script>"""
    return text.replace("</body>", script + "\n</body>")


def _analytics_asset() -> str:
    js = r"""(function(){
'use strict';
function send(name,params){if(typeof window.gtag==='function'){window.gtag('event',name,params||{});}}
function formName(f){return (f&&f.getAttribute&&f.getAttribute('name'))||'unknown';}
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.matches)return;if(f.classList.contains('lead-form')){send('lead_form_attempt',{form_name:formName(f)});return;}var id=(f.id||'')+' '+(f.className||'')+' '+(f.getAttribute('action')||'');if(/search|filter|home/i.test(id)){send('home_search_submit',{form_id:f.id||'unknown'});}},true);
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var raw=a.getAttribute('href')||'';if(a.matches('[data-contact]')){send('contact_click',{method:a.getAttribute('data-contact')||'unknown'});}if(/^\/listing\//.test(raw)||a.closest('.listing-card')){send('listing_click',{link_path:raw.split('?')[0].slice(0,180)});}try{var u=new URL(a.href,location.href);if(u.origin!==location.origin){var d=u.hostname.replace(/^www\./,'');if(/jotform\.com$/.test(d)){send('external_form_click',{destination_domain:d});}if(['signaturepropertycollection.com','owninnoco.com'].indexOf(d)!==-1){send('brand_site_click',{destination_domain:d});}}}catch(_){}} ,true);
if(/^\/listing\//.test(location.pathname)){send('listing_detail_view',{listing_path:location.pathname.slice(0,180)});}
})();"""
    digest = hashlib.sha256(js.encode()).hexdigest()[:12]
    rel = f"/assets/js/analytics-events.{digest}.js"
    dest = SITE / rel.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    _write(dest, js)
    return rel


def _inject_analytics_asset(text: str, rel: str) -> str:
    if rel in text:
        return text
    return text.replace("</body>", f'<script defer src="{rel}"></script>\n</body>')


def _strip_public_gsc_counts(text: str) -> str:
    text = re.sub(
        r'\s*<span[^>]*>\s*\(\s*[\d,]+\s+clicks?\s+from\s+Google\s+search\s*\)\s*</span>',
        "",
        text,
        flags=re.I,
    )
    return text


def _home_faq_block() -> str:
    faqs = [
        ("What types of Northern Colorado properties do you work with?",
         "I work with residential buyers and sellers across Northern Colorado — from in-town homes to acreage, horse property, wells, septic systems, relocation and first-time purchases. If a property has extra moving pieces, that's usually where I can be most useful."),
        ("Where do you work?",
         "I'm based in Loveland and work across the Northern Colorado and Colorado Front Range markets shown throughout this site, with especially deep coverage in Larimer and Weld Counties."),
        ("What happens after I contact you?",
         "You'll hear directly from me or my real estate team about what you're trying to do and the next useful step. A successful website form takes you to a confirmation page so you know it actually went through."),
        ("Do you represent both buyers and sellers?",
         "Yes. I represent buyers and sellers, including people relocating, buying acreage, purchasing a first home, selling a current home or comparing a move within Northern Colorado."),
        ("What is included in your listing marketing?",
         "The plan depends on the home, but my listings can include professional photography, real video, online distribution, social media and a pricing and launch strategy built around the property's actual market."),
    ]
    rows = "\n      ".join(
        f'<div class="faq-item"><h3>{html_lib.escape(q)}</h3><p>{html_lib.escape(a)}</p></div>'
        for q, a in faqs
    )
    return f'''<section class="tight">\n  <div class="wrap" style="max-width:820px">\n    <h2 class="section-title">Frequently Asked Questions</h2>\n    {rows}\n  </div>\n</section>'''


def _fix_homepage_faq(text: str) -> str:
    if not re.search(r'Who is the best real estate agent|top female real estate agent', text, re.I):
        return text
    pat = re.compile(
        r'<section class="tight">\s*<div class="wrap" style="max-width:820px">\s*'
        r'<h2 class="section-title">Frequently Asked Questions</h2>[\s\S]*?'
        r'</div>\s*</section>'
    )
    matches = list(pat.finditer(text))
    for m in reversed(matches):
        if re.search(r'Who is the best real estate agent|top female real estate agent', m.group(0), re.I):
            text = text[:m.start()] + _home_faq_block() + text[m.end():]
            break
    return text


def _remove_tight_section_by_heading(text: str, heading: str) -> str:
    q = re.escape(heading)
    pattern = re.compile(
        r'<section class="tight">\s*<div class="wrap"[^>]*>\s*'
        r'<h2 class="section-title"[^>]*>\s*' + q + r'\s*</h2>[\s\S]*?</div>\s*</section>\s*',
        re.I,
    )
    return pattern.sub("", text)


def _fix_eaton(text: str) -> str:
    intro = """<p>Eaton sits on Colorado's northern plains in Weld County, about seven miles north of Greeley. It still reads as an agricultural town first: US 85, working farmland at the edges, an older town grid, and newer neighborhoods arriving gradually rather than all at once.</p>

<h3>Why Eaton exists where it does</h3>
<p>The town is named for Benjamin Harrison Eaton, whose irrigation work helped turn this part of the high plains into productive farmland in the late 1800s. Eaton incorporated in 1892, and that irrigation and agricultural history still explains a lot about the landscape around town today.</p>

<h3>How Eaton fits into Northern Colorado</h3>
<p>Eaton is close to Greeley for day-to-day shopping, employment and medical services, while Fort Collins is a longer east-west drive rather than a straight I-25 commute. That distinction matters. If you are considering Eaton because of price, lot size or small-town scale, drive the route you would actually use for work before you make the housing decision.</p>
<p>For current inventory, use the <a href="/communities/weld/eaton.html">Eaton community page</a>. For current market numbers, use the <a href="/eaton-co-market-report-and-trends.html">Eaton market report</a>; those numbers are dated to the MLS refresh rather than frozen into this article.</p>"""
    start = text.find('<div class="blog-article">')
    if start != -1:
        content_start = start + len('<div class="blog-article">')
        end_marker = '</div>\n  </div>\n</section>'
        end = text.find(end_marker, content_start)
        if end != -1:
            text = text[:content_start] + intro + text[end:]

    for h in ("Who moves to Eaton, and why", "Who tends to move to Eaton, and why"):
        text = _remove_tight_section_by_heading(text, h)

    text = text.replace(
        "That's a genuinely small district, which is part of the draw for families who want their kids to be known by name rather than one of a few thousand.",
        "It is a comparatively small district, which may appeal to buyers who prefer a smaller school system; anyone with specific academic, special-education, athletics or program needs should confirm current offerings directly with the district.",
    )
    text = text.replace(
        "That's a fair trade for a lot of families, and it's a dealbreaker for others,",
        "That's a fair trade for some buyers and a dealbreaker for others,",
    )
    text = text.replace(
        "small enough that most families end up knowing the staff by name within a year. That kind of scale is part of Eaton's appeal for people leaving bigger metro school systems,",
        "a much smaller system than the large metro districts nearby. That scale is one factor some buyers compare,",
    )
    return text


def _fix_rent_to_own(text: str) -> str:
    replacements = {
        '<span style="font-size:0.9rem;color:#5a625d;">Families helped</span>': '<span style="font-size:0.9rem;color:#5a625d;">Homes sold</span>',
        '<li><strong>Credit Score:</strong> Legitimate programs typically require <strong>580&ndash;620+</strong>.</li>': '<li><strong>Qualification:</strong> Requirements vary by seller or program, and the mortgage needed at the end has its own underwriting standards.</li>',
        '<li><strong>Most renters I talk to are surprised they qualify for programs like $0-down USDA or CHFA.</strong></li>': '<li><strong>Before paying an option fee, have a lender check whether a traditional loan or current down-payment-assistance program is already available to you.</strong></li>',
        '<p style="margin-top:16px; font-size:0.95rem; color:#5a625d; font-style:italic;"><strong>April 2026 Local Note:</strong> We are seeing more $0-down USDA approvals in the Promontory area of Greeley than anywhere else in NoCo right now.</p>': '',
        "<p>Some are. Most aren't. I'll be the local Realtor who says it out loud: the majority of \"rent-to-own\" listings you'll find on national sites for Loveland, Fort Collins, and Greeley fall into one of three buckets:</p>": "<p>Some are legitimate, but online rent-to-own listings deserve careful verification before you pay anyone. The problems I watch for fall into three broad buckets:</p>",
        '<li><strong>Legitimate but expensive corporate programs.</strong> Companies like Home Partners of America are real, but you typically pay above-market rent and an above-market purchase price for the convenience. Sometimes it\'s worth it. Often it isn\'t.</li>': '<li><strong>Corporate programs with a real contract but a higher total cost.</strong> A program can be legitimate and still be a poor financial fit. Compare the rent, option terms, future purchase price and exit costs with buying through a standard loan.</li>',
        '<p>Less than you\'d need for a conventional mortgage, but more than zero. Most legitimate rent-to-own programs in Northern Colorado want to see a credit score of at least 580&ndash;620, verifiable income of roughly 3x the monthly rent, and no recent evictions or bankruptcies. If your credit is below 580, rent-to-own probably isn\'t the right path &mdash; and the honest answer is that 12 months of focused credit repair will get you further than a lease-option ever will.</p>': '<p>There is no universal rent-to-own credit score. A landlord, seller or corporate program can set its own screening standards, and the mortgage you will need to complete the purchase later has separate underwriting rules. Before paying a non-refundable option fee, have a lender review what would need to change for you to qualify by the purchase deadline.</p>',
        '<p>Here\'s the part that surprises almost every renter I talk to. Most renters who call me asking about rent-to-own actually qualify today for a program that gets them into a home faster, with less money down, and without the lease-option markup. Programs like CHFA down payment assistance, USDA $0-down loans in Weld County, and FHA with seller credits or grants.</p>': '<p>Before assuming rent-to-own is your only path, have a lender check what you qualify for today. Depending on the borrower and property, that can include conventional or FHA financing, VA or USDA loans for eligible buyers and locations, and current Colorado down-payment-assistance programs. Program rules, income limits, geography and assistance amounts change, so verify the current terms rather than relying on a website summary.</p>',
        '<p style="margin-top:12px;">Some are, but most online rent-to-own listings for Northern Colorado are either lead-generation traps, pre-foreclosure situations, or expensive corporate programs. Always verify with a local Realtor before any money changes hands.</p>': '<p style="margin-top:12px;">Some are legitimate, but verify the owner, the full contract, the option fee, the purchase price and what happens if you do not close before any money changes hands.</p>',
        '<p style="margin-top:12px;">Most legitimate programs require a credit score of at least 580&ndash;620, verifiable income of about 3x the monthly rent, and no recent evictions or bankruptcies.</p>': '<p style="margin-top:12px;">There is no single standard. Screening varies by seller or program, and the future mortgage has its own underwriting requirements. Have a lender review your current qualification and the timeline before paying an option fee.</p>',
        '<p style="margin-top:12px;">Most legitimate programs still require a 580+ credit score. If your credit is lower, the honest answer is that no rent-to-own program will be a good deal for you &mdash; and 12 months of focused credit repair will get you further than a lease-option ever will.</p>': '<p style="margin-top:12px;">Requirements vary. If credit is the reason you are considering rent-to-own, compare the cost and deadline of the lease-option with a lender-guided credit plan before committing non-refundable money.</p>',
        '<p style="margin-top:12px;">Yes &mdash; and most renters who call about rent-to-own actually qualify for one. CHFA offers down payment assistance grants. USDA loans offer $0 down in much of Weld County. FHA with down payment assistance often requires nothing out of pocket. Take the Quick Check below and I\'ll tell you exactly which one fits.</p>': '<p style="margin-top:12px;">Possibly. Ask a lender to check current conventional, FHA, VA, USDA and Colorado down-payment-assistance options. Eligibility and assistance vary by borrower, property and current program rules, so compare verified numbers with the rent-to-own contract.</p>',
        '<p style="font-size:0.95rem;color:#5a625d;">Rent-to-own, $0-down USDA/CHFA, or credit repair plan</p>': '<p style="font-size:0.95rem;color:#5a625d;">Rent-to-own, eligible low- or zero-down financing, down-payment assistance, or a credit-and-savings plan</p>',
        '<p style="font-size:0.95rem;color:#5a625d;">Faster and with less risk than most people expect</p>': '<p style="font-size:0.95rem;color:#5a625d;">With the costs, deadlines and tradeoffs clear before you commit</p>',
        '<p style="margin-top:24px;font-size:0.9rem;color:#5a625d;">Most people are surprised by what they actually qualify for.</p>': '<p style="margin-top:24px;font-size:0.9rem;color:#5a625d;">You may have more than one realistic path. The point of the check is to compare them.</p>',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    for h in (
        "How does rent-to-own actually work in Colorado?",
        "What credit score do you need for rent-to-own?",
        "Rent-to-own vs. low- and zero-down programs: which actually gets you a home?",
        "Rent-to-own scams: the red flags",
        "Frequently Asked Questions",
    ):
        text = _remove_tight_section_by_heading(text, h)

    # Do not imply an agent is providing legal review.
    text = text.replace(
        "Have a real estate agent or attorney read any rent-to-own contract before you sign. I do this for Northern Colorado renters regularly, no charge and no pressure — it's a fifteen-minute conversation that can save you a five-figure mistake.",
        "Have the real-estate terms reviewed carefully and use a Colorado attorney for legal advice about the contract before you sign. I can help you compare the property, price and transaction structure, but legal interpretation belongs with an attorney.",
    )
    return text


def _fix_stale_market(text: str) -> tuple[str, dt.date | None]:
    asof = _market_asof(text)
    if not asof:
        return text, None
    age = max(0, (TODAY - asof).days)
    if age <= 3:
        return text, asof

    nice = asof.strftime("%B %-d, %Y") if os.name != "nt" else asof.strftime("%B %d, %Y").replace(" 0", " ")
    text = text.replace("Live From IRES MLS", "IRES MLS Market Snapshot")
    text = re.sub(r'content="Live ([^"]+?) real estate market report:', r'content="\1 IRES MLS market snapshot:', text)
    text = re.sub(
        r'What is actually for sale in ([^<]+?) right now &mdash; read straight\s*from the same multiple listing service used to price every listing in this market\. No\s*Zestimates, no national-aggregator guesses, and no waiting on a monthly write-up\.',
        r'A snapshot of what was for sale in \1 when this IRES MLS data was refreshed &mdash; read straight from the same multiple listing service used to price homes in this market. No Zestimates or national-aggregator estimates.',
        text,
        flags=re.I,
    )
    text = re.sub(
        r'Live from <strong>IRES MLS</strong> for ([^,]+), last refreshed \d+ days? ago \([^)]+\)\. These are <strong>asking</strong> prices on homes for sale right now &mdash; what sellers are asking, not what buyers finally paid\.',
        rf'IRES MLS snapshot for <strong>\1</strong>, refreshed <strong>{nice}</strong> ({age} days ago). These are <strong>asking</strong> prices from that snapshot &mdash; what sellers were asking when the data was refreshed, not what buyers finally paid.',
        text,
        flags=re.I,
    )
    text = re.sub(r'(<span class="eyebrow"[^>]*>)([^<]+) Right Now(</span>)', r'\1\2 Market Snapshot\3', text)
    return text, asof


def _update_sitemap_dates() -> None:
    sitemap = SITE / "sitemap.xml"
    if not sitemap.exists():
        return
    text = _read(sitemap)
    dates: dict[str, str] = {}
    for p in _html_files():
        rel = "/" + p.relative_to(SITE).as_posix()
        m = re.search(r'<meta name="last-modified" content="(\d{4}-\d{2}-\d{2})">', _read(p))
        if m:
            dates[rel] = m.group(1)

    def repl(m):
        block = m.group(0)
        lm = re.search(r'<loc>https?://[^/]+([^<]*)</loc>', block)
        if not lm:
            return block
        path = lm.group(1) or "/"
        if path == "/":
            path = "/index.html"
        date = dates.get(path)
        if not date:
            return block
        if re.search(r'<lastmod>[^<]+</lastmod>', block):
            return re.sub(r'<lastmod>[^<]+</lastmod>', f'<lastmod>{date}</lastmod>', block)
        return block.replace("</loc>", f"</loc><lastmod>{date}</lastmod>", 1)

    text = re.sub(r'<url>[\s\S]*?</url>', repl, text)
    _write(sitemap, text)


def _validate(redirects: dict[str, str], analytics_rel: str) -> list[str]:
    errors: list[str] = []
    pages = _html_files()
    for p in pages:
        h = _read(p)
        rel = p.relative_to(SITE).as_posix()
        if re.search(r'\([\d,]+ clicks? from Google search\)', h, re.I):
            errors.append(f"public Search Console count remains: {rel}")
        if rel == "index.html" and re.search(r'Who is the best real estate agent|top female real estate agent', h, re.I):
            errors.append("self-nominating homepage FAQ remains")
        if analytics_rel not in h:
            errors.append(f"business analytics asset missing: {rel}")
        if not re.search(r'<meta name="last-modified" content="\d{4}-\d{2}-\d{2}">', h):
            errors.append(f"meaningful last-modified missing: {rel}")
        # No internal href should point at one of our literal 301 sources.
        for m in re.finditer(r'href=["\'](/[^"\']+)["\']', h):
            path = urlsplit(html_lib.unescape(m.group(1))).path
            if _resolve_redirect(path, redirects):
                errors.append(f"internal href still points through 301: {rel} -> {path}")
                break

    ty = SITE / "thank-you.html"
    if ty.exists():
        h = _read(ty)
        if "confirmed_meta_lead" not in h or "p.get('from')" not in h:
            errors.append("thank-you does not emit confirmed Meta Lead from ?from=")
    # Meta must never count a lead from a form submit attempt.
    for p in pages:
        h = _read(p)
        if "classList.contains('lead-form')" in h and "fbq('track','Lead'" in h:
            errors.append(f"Meta Lead still fires on submit attempt: {p.relative_to(SITE)}")
            break

    eaton = SITE / "discovering-eaton-colorado-on-the-northern-plains.html"
    if eaton.exists():
        h = _read(eaton).lower()
        for phrase in ("family-friendly environment", "safe and nurturing", "great place to raise a family", "hidden gems"):
            if phrase in h:
                errors.append(f"Eaton legacy marketing phrase remains: {phrase}")

    rto = SITE / "rent-to-own.html"
    if rto.exists():
        h = _read(rto)
        for phrase in ("April 2026 Local Note", "Most renters who call me asking about rent-to-own actually qualify today", "Most buyers I work with who start below a 620"):
            if phrase in h:
                errors.append(f"rent-to-own unsupported claim remains: {phrase}")

    for p in pages:
        h = _read(p)
        asof = _market_asof(h)
        if asof and (TODAY - asof).days > 3 and "Live From IRES MLS" in h:
            errors.append(f"stale market page still says Live: {p.relative_to(SITE)}")

    return errors


def main() -> int:
    if not SITE.is_dir():
        print("postprocess: site/ not found", file=sys.stderr)
        return 2

    redirects = _redirect_map()
    analytics_rel = _analytics_asset()
    total_redirect_links = 0
    changed_pages = 0

    for path in _html_files():
        original = _read(path)
        text = original
        rel = path.relative_to(SITE).as_posix()

        text = _fix_meta_lead_tracking(text)
        if rel == "thank-you.html":
            text = _ensure_confirmed_meta_lead(text)

        text = _strip_public_gsc_counts(text)
        if rel == "index.html":
            text = _fix_homepage_faq(text)
        if rel == "discovering-eaton-colorado-on-the-northern-plains.html":
            text = _fix_eaton(text)
        if rel == "rent-to-own.html":
            text = _fix_rent_to_own(text)

        text, _ = _fix_stale_market(text)
        text, nlinks = _rewrite_internal_redirect_links(text, redirects)
        total_redirect_links += nlinks
        text = _inject_analytics_asset(text, analytics_rel)

        page_date = _meaningful_date(path, text)
        text = _set_freshness(
            text,
            page_date,
            homepage=(rel == "index.html"),
            rent_to_own=(rel == "rent-to-own.html"),
        )

        if text != original:
            _write(path, text)
            changed_pages += 1

    _update_sitemap_dates()
    errors = _validate(redirects, analytics_rel)
    if errors:
        print("!! postprocess audit gate FAILED", file=sys.stderr)
        for e in errors[:50]:
            print(f"   - {e}", file=sys.stderr)
        if len(errors) > 50:
            print(f"   ... and {len(errors) - 50} more", file=sys.stderr)
        return 1

    print(f"--- postprocess audit gate OK: {changed_pages} HTML files normalized")
    print(f"--- internal redirect hops removed: {total_redirect_links}")
    print(f"--- analytics asset: {analytics_rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
