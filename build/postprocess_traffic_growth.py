#!/usr/bin/env python3
"""Final traffic-growth corrections applied after the technical + ROI gates.

This layer is deliberately surgical. It consolidates only newly-created duplicate
URLs into proven historical winners, fixes stale static MLS claims on community
pages, removes self-nominating local FAQs, corrects YouTube video-sitemap markup,
and refreshes two legacy high-value pages without changing their established URLs.

The script is idempotent and fails the deploy when an invariant regresses.
"""
from __future__ import annotations

import datetime as dt
import html as html_lib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
CHANGE_DATE = dt.date(2026, 8, 31)

DUPLICATE_MAP = {
    "/guides/multi-generational-homes-northern-colorado.html":
        "/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html",
    "/guides/cost-to-develop-raw-land-colorado.html":
        "/whats-the-real-cost-to-develop-raw-land-in-colorado.html",
    "/guides/best-places-to-retire-in-northern-colorado.html":
        "/the-best-places-to-retire-in-northern-colorado.html",
}

WINNER_CANONICALS = {
    "multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html":
        "https://www.thelittleladysellshomes.com/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html",
    "whats-the-real-cost-to-develop-raw-land-in-colorado.html":
        "https://www.thelittleladysellshomes.com/whats-the-real-cost-to-develop-raw-land-in-colorado.html",
    "the-best-places-to-retire-in-northern-colorado.html":
        "https://www.thelittleladysellshomes.com/the-best-places-to-retire-in-northern-colorado.html",
}


def read(path: Path) -> str:
    if not path.exists():
        raise RuntimeError(f"Required file missing: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def write_if_changed(path: Path, text: str) -> bool:
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def nice_date(value: dt.date) -> str:
    return value.strftime("%B %d, %Y").replace(" 0", " ")


def parse_iso(raw: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        return None


def is_stale(raw: str, days: int = 3) -> bool:
    d = parse_iso(raw)
    if not d:
        return False
    return (dt.date.today() - d).days > days


def max_date(existing: str | None) -> str:
    if not existing:
        return CHANGE_DATE.isoformat()
    old = parse_iso(existing)
    if old and old > CHANGE_DATE:
        return old.isoformat()
    return CHANGE_DATE.isoformat()


def touch_meaningful_freshness(text: str) -> str:
    """Stamp at least the real Aug-31 change date, never a daily deploy date."""
    m = re.search(r'<meta name="last-modified" content="(\d{4}-\d{2}-\d{2})">', text)
    iso = max_date(m.group(1) if m else None)
    if m:
        text = re.sub(
            r'<meta name="last-modified" content="[^"]+">',
            f'<meta name="last-modified" content="{iso}">', text, count=1)
    m2 = re.search(r'<meta property="og:updated_time" content="(\d{4}-\d{2}-\d{2})">', text)
    if m2:
        text = re.sub(
            r'<meta property="og:updated_time" content="[^"]+">',
            f'<meta property="og:updated_time" content="{iso}">', text, count=1)

    def fix_jsonld(mj: re.Match[str]) -> str:
        raw = mj.group(1)
        try:
            obj = json.loads(raw)
        except Exception:
            return mj.group(0)

        def walk(x):
            if isinstance(x, list):
                return [walk(v) for v in x]
            if not isinstance(x, dict):
                return x
            out = {k: walk(v) for k, v in x.items()}
            if out.get("@type") in {"BlogPosting", "Article", "NewsArticle"}:
                current = str(out.get("dateModified") or "")[:10]
                out["dateModified"] = max_date(current or None)
            return out

        fixed = walk(obj)
        return '<script type="application/ld+json">' + json.dumps(
            fixed, ensure_ascii=False, separators=(",", ":")
        ) + '</script>'

    return re.sub(
        r'<script type="application/ld\+json">([\s\S]*?)</script>',
        fix_jsonld, text)


def ensure_duplicate_redirects() -> int:
    path = SITE / "_redirects"
    text = read(path)
    lines = text.splitlines()
    changed = 0
    for src, dst in DUPLICATE_MAP.items():
        exact = re.compile(rf'^\s*{re.escape(src)}\s+(\S+)\s+301!?\s*$')
        found = False
        for i, line in enumerate(lines):
            m = exact.match(line)
            if not m:
                continue
            found = True
            desired = f"{src}  {dst}  301"
            if line.strip() != desired:
                lines[i] = desired
                changed += 1
            break
        if not found:
            lines.append(f"{src}  {dst}  301")
            changed += 1
    final = "\n".join(lines) + ("\n" if text.endswith("\n") or lines else "")
    write_if_changed(path, final)
    return changed


def rewrite_duplicate_hrefs(text: str) -> tuple[str, int]:
    count = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal count
        quote = m.group(1)
        raw = html_lib.unescape(m.group(2))
        if not raw.startswith("/") or raw.startswith("//"):
            return m.group(0)
        parts = urlsplit(raw)
        dst = DUPLICATE_MAP.get(parts.path)
        if not dst:
            return m.group(0)
        count += 1
        new = urlunsplit(("", "", dst, parts.query, parts.fragment))
        return f'href={quote}{html_lib.escape(new, quote=True)}{quote}'

    text = re.sub(r'href=(["\'])([^"\']+)\1', repl, text)
    return text, count


def remove_duplicate_sitemap_urls() -> int:
    path = SITE / "sitemap.xml"
    text = read(path)
    removed = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal removed
        block = m.group(0)
        lm = re.search(r'<loc>https?://[^/]+([^<]*)</loc>', block)
        if lm and lm.group(1) in DUPLICATE_MAP:
            removed += 1
            return ""
        return block

    final = re.sub(r'\s*<url>[\s\S]*?</url>', repl, text)
    write_if_changed(path, final)
    return removed


def remove_self_nomination_faq(text: str) -> tuple[str, int]:
    removed = 0
    visible = re.compile(
        r'\s*<div class="faq-item"><h3>\s*Who is (?:the )?(?:best|top)[^<]*real estate agent[^<]*</h3><p>[\s\S]*?</p></div>',
        re.I,
    )
    text, n = visible.subn("", text)
    removed += n

    def fix_jsonld(m: re.Match[str]) -> str:
        nonlocal removed
        raw = m.group(1)
        try:
            obj = json.loads(raw)
        except Exception:
            return m.group(0)

        def walk(x):
            nonlocal removed
            if isinstance(x, list):
                return [walk(v) for v in x]
            if not isinstance(x, dict):
                return x
            out = {k: walk(v) for k, v in x.items()}
            if out.get("@type") == "FAQPage" and isinstance(out.get("mainEntity"), list):
                keep = []
                for q in out["mainEntity"]:
                    name = str(q.get("name", "")) if isinstance(q, dict) else ""
                    if re.search(
                        r'who is (?:the )?(?:best|top).*real estate agent|top female real estate agent',
                        name, re.I,
                    ):
                        removed += 1
                        continue
                    keep.append(q)
                out["mainEntity"] = keep
            return out

        fixed = walk(obj)
        return '<script type="application/ld+json">' + json.dumps(
            fixed, ensure_ascii=False, separators=(",", ":")
        ) + '</script>'

    text = re.sub(
        r'<script type="application/ld\+json">([\s\S]*?)</script>',
        fix_jsonld, text)
    return text, removed


CARD_RE = re.compile(
    r'Right now there are (?P<count>[\d,]+) active listings in (?P<city>[^,<]+), '
    r'at a median asking price of (?P<price>\$[\d,]+)\. That works out to about '
    r'(?P<ppsf>\$[\d,]+) per square foot\. Straight from the IRES MLS feed as of '
    r'(?P<date>\d{4}-\d{2}-\d{2}) — not a figure typed into this page and left to rot\.',
    re.I,
)

FAQ_RE = re.compile(
    r'As of (?P<date>\d{4}-\d{2}-\d{2}), the median asking price across the '
    r'(?P<count>[\d,]+) active listings in (?P<city>[^,]+) is (?P<price>\$[\d,]+), '
    r'or about (?P<ppsf>\$[\d,]+) per square foot\. That is live IRES MLS inventory, '
    r'recomputed as listings change, not a figure typed in once\. Asking prices are not '
    r'sale prices — what homes actually close for is in the monthly Northern Colorado market report\.',
    re.I,
)


def stale_card_replacement(m: re.Match[str]) -> str:
    if not is_stale(m.group("date")):
        return m.group(0)
    d = parse_iso(m.group("date"))
    assert d
    return (
        f'In the IRES MLS snapshot dated {nice_date(d)}, there were {m.group("count")} active '
        f'listings in {m.group("city")}, at a median asking price of {m.group("price")}. '
        f'That worked out to about {m.group("ppsf")} per square foot. Inventory and asking '
        'prices may have changed since that refresh; the live listings below are the current search.'
    )


def stale_faq_replacement(m: re.Match[str]) -> str:
    if not is_stale(m.group("date")):
        return m.group(0)
    d = parse_iso(m.group("date"))
    assert d
    return (
        f'In the IRES MLS snapshot dated {nice_date(d)}, the median asking price across '
        f'{m.group("count")} active listings in {m.group("city")} was {m.group("price")}, '
        f'or about {m.group("ppsf")} per square foot. Inventory and asking prices may have '
        'changed since that refresh. Asking prices are not sale prices — what homes actually '
        'close for is in the monthly Northern Colorado market report.'
    )


def fix_stale_community_market(text: str) -> tuple[str, int]:
    changed = 0
    text, n = CARD_RE.subn(stale_card_replacement, text)
    changed += n
    text, n = FAQ_RE.subn(stale_faq_replacement, text)
    changed += n

    def fix_jsonld(m: re.Match[str]) -> str:
        nonlocal changed
        raw = m.group(1)
        try:
            obj = json.loads(raw)
        except Exception:
            return m.group(0)

        def walk(x):
            nonlocal changed
            if isinstance(x, list):
                return [walk(v) for v in x]
            if not isinstance(x, dict):
                return x
            out = {k: walk(v) for k, v in x.items()}
            ans = out.get("acceptedAnswer")
            if out.get("@type") == "Question" and isinstance(ans, dict):
                body = ans.get("text")
                if isinstance(body, str):
                    new = FAQ_RE.sub(stale_faq_replacement, body)
                    if new != body:
                        ans["text"] = new
                        changed += 1
            return out

        fixed = walk(obj)
        return '<script type="application/ld+json">' + json.dumps(
            fixed, ensure_ascii=False, separators=(",", ":")
        ) + '</script>'

    text = re.sub(
        r'<script type="application/ld\+json">([\s\S]*?)</script>',
        fix_jsonld, text)
    return text, changed


def fix_video_sitemap() -> int:
    path = SITE / "sitemap-videos.xml"
    text = read(path)
    pattern = re.compile(
        r'\s*<video:content_loc>https?://(?:www\.)?youtube\.com/watch\?v=[^<]+</video:content_loc>',
        re.I,
    )
    final, n = pattern.subn("", text)
    write_if_changed(path, final)
    return n


def fix_fort_collins_rto(text: str) -> str:
    text = text.replace(
        "<title>Rent to Own in Fort Collins CO | 2025 Buyer’s Guide</title>",
        "<title>Rent to Own in Fort Collins CO | Buyer’s Guide</title>",
    )
    text = text.replace(
        '<meta property="og:title" content="Rent to Own in Fort Collins CO | 2025 Buyer’s Guide">',
        '<meta property="og:title" content="Rent to Own in Fort Collins CO | Buyer’s Guide">',
    )
    text = text.replace(
        '<meta name="twitter:title" content="Rent to Own in Fort Collins CO | 2025 Buyer’s Guide">',
        '<meta name="twitter:title" content="Rent to Own in Fort Collins CO | Buyer’s Guide">',
    )
    old_desc = "Learn how rent to own works in Fort Collins, Colorado. Lock in pricing, build equity, and get expert help from local Realtor Christine Gwinnup."
    new_desc = "How rent-to-own can work in Fort Collins, questions to ask before signing, and other home-buying paths to compare with a local Realtor."
    text = text.replace(f'<meta name="description" content="{old_desc}">', f'<meta name="description" content="{new_desc}">')
    text = text.replace(f'<meta property="og:description" content="{old_desc}">', f'<meta property="og:description" content="{new_desc}">')
    text = text.replace(f'<meta name="twitter:description" content="{old_desc}">', f'<meta name="twitter:description" content="{new_desc}">')
    text = text.replace(
        "<p data-end=\"1120\" data-start=\"1030\">It&rsquo;s an excellent choice for buyers who want to secure a home while preparing financially.</p>",
        "<p data-end=\"1120\" data-start=\"1030\">It can be one option for buyers who need time before a traditional purchase, but the contract costs, deadlines, future financing requirements, and alternatives should be compared before you commit.</p>",
    )
    text = text.replace(
        "<h3 data-end=\"1183\" data-start=\"1127\">Why Fort Collins Is a Smart Location for Rent to Own</h3>",
        "<h3 data-end=\"1183\" data-start=\"1127\">What to Compare Before Rent-to-Own in Fort Collins</h3>",
    )
    text = text.replace(
        '<p data-end="1380" data-start="1185">Fort Collins continues to rank as one of the <strong data-end="1265" data-start="1230">best places to live in the U.S.</strong>&mdash;and for good reason. With its blend of lifestyle, education, and innovation, it attracts a wide variety of buyers.</p>',
        '<p data-end="1380" data-start="1185">Fort Collins has a competitive housing market and many different ownership paths. Compare the total rent-to-own cost with homes you could buy through conventional, FHA, VA, USDA when eligible, or current down-payment-assistance options before assuming a lease-option is the best fit.</p>',
    )
    text = text.replace(
        "<p data-end=\"4070\" data-start=\"3865\">Rent to own isn&rsquo;t just a backup plan&mdash;it&rsquo;s a smart, strategic way to get into the Fort Collins market on your terms. You don&rsquo;t have to wait years to buy. With the right support, you can make the move today.</p>",
        "<p data-end=\"4070\" data-start=\"3865\">Rent-to-own can make sense in a narrow set of situations, but it is not automatically cheaper, safer, or faster than buying another way. The useful next step is to compare the contract, the future mortgage timeline, and the alternatives available to you now.</p>",
    )
    final_block = re.compile(
        r'<p data-end="4331" data-start="4072">Let&rsquo;s talk about your goals, your options, and your timeline\.<br data-end="4136" data-start="4133">\s*'
        r'Visit the full Fort Collins Rent to Own page here:<br data-end="4189" data-start="4186">\s*'
        r'<a[^>]*>www\.thelittleladysellshomes\.com/rent-to-own-fort-collins-colorado</a></p>',
        re.I,
    )
    replacement = (
        '<p data-traffic-bridge="fort-collins-rto-options">Tell me what you are trying to accomplish and I’ll help you compare rent-to-own with other buying paths that may fit better. '
        '<a href="/rent-to-own.html#roi-rto-funnel"><strong>Show Me My Options →</strong></a></p>'
    )
    text = final_block.sub(replacement, text)
    return text


def fix_ilc_cost(text: str) -> str:
    pattern = re.compile(
        r'<h2>Cost Difference</h2>\s*<ul>\s*'
        r'<li><strong>ILC:</strong> Typically \$350&ndash;\$600</li>\s*'
        r'<li><strong>Boundary Survey:</strong> \$1,000&ndash;\$2,500\+ depending on acreage and terrain</li>\s*'
        r'</ul>\s*'
        r'<p>When in doubt, a boundary survey gives you peace of mind and long-term protection &mdash; especially if you\'re investing in fencing or future structures\.</p>',
        re.I,
    )
    replacement = '''<h2>How Much Does an ILC or Boundary Survey Cost in Colorado?</h2>

<p>Pricing varies by surveyor and property. Parcel size, acreage, terrain, access, record research, visible improvements, the number of corners involved, and the scope of work can all change the quote. An ILC is generally less involved than a boundary survey, but an old online price range is not a reliable estimate for a specific property.</p>

<ul>
\t<li><strong>ILC:</strong> Ask for a current written quote based on the specific parcel and closing need.</li>
\t<li><strong>Boundary Survey:</strong> Usually more involved; acreage, terrain, monument/corner work, research, and project scope can materially change the fee.</li>
</ul>

<p>If the exact boundary matters for a fence, addition, outbuilding, access question, or dispute, ask the surveyor which product actually fits the purpose before choosing based on price alone.</p>'''
    return pattern.sub(replacement, text)


def update_sitemap_dates(changed_paths: set[str]) -> None:
    if not changed_paths:
        return
    path = SITE / "sitemap.xml"
    text = read(path)

    def repl(m: re.Match[str]) -> str:
        block = m.group(0)
        lm = re.search(r'<loc>https?://[^/]+([^<]*)</loc>', block)
        if not lm:
            return block
        url_path = lm.group(1) or "/"
        if url_path not in changed_paths:
            return block
        html_path = SITE / url_path.lstrip("/")
        if not html_path.exists():
            return block
        hm = re.search(
            r'<meta name="last-modified" content="(\d{4}-\d{2}-\d{2})">',
            read(html_path),
        )
        if not hm:
            return block
        iso = hm.group(1)
        if re.search(r'<lastmod>[^<]+</lastmod>', block):
            return re.sub(r'<lastmod>[^<]+</lastmod>', f'<lastmod>{iso}</lastmod>', block)
        return block.replace("</loc>", f"</loc><lastmod>{iso}</lastmod>", 1)

    text = re.sub(r'<url>[\s\S]*?</url>', repl, text)
    write_if_changed(path, text)


def validate() -> list[str]:
    errors: list[str] = []
    redirects = read(SITE / "_redirects")
    for src, dst in DUPLICATE_MAP.items():
        if not re.search(
            rf'^\s*{re.escape(src)}\s+{re.escape(dst)}\s+301!?\s*$',
            redirects, re.M,
        ):
            errors.append(f"duplicate redirect missing/wrong: {src} -> {dst}")

    sitemap = read(SITE / "sitemap.xml")
    for src in DUPLICATE_MAP:
        if re.search(rf'<loc>https?://[^<]+{re.escape(src)}</loc>', sitemap):
            errors.append(f"duplicate URL still in sitemap: {src}")

    for p in SITE.rglob("*.html"):
        h = read(p)
        rel = p.relative_to(SITE).as_posix()
        for src in DUPLICATE_MAP:
            if re.search(rf'href=["\']{re.escape(src)}(?:[?#][^"\']*)?["\']', h):
                errors.append(f"internal href still points at duplicate: {rel} -> {src}")
                break
        if rel.startswith("communities/"):
            if re.search(r'Who is (?:the )?(?:best|top)[^<\"]*real estate agent', h, re.I):
                errors.append(f"self-nominating town FAQ remains: {rel}")
            for m in CARD_RE.finditer(h):
                if is_stale(m.group("date")):
                    errors.append(f"stale community market card still says Right now: {rel}")
                    break
            for m in FAQ_RE.finditer(h):
                if is_stale(m.group("date")):
                    errors.append(f"stale community FAQ still says live inventory: {rel}")
                    break

    for rel, canonical in WINNER_CANONICALS.items():
        h = read(SITE / rel)
        if f'<link rel="canonical" href="{canonical}">' not in h:
            errors.append(f"historical winner canonical changed: {rel}")

    videos = read(SITE / "sitemap-videos.xml")
    if re.search(r'<video:content_loc>https?://(?:www\.)?youtube\.com/watch\?v=', videos, re.I):
        errors.append("YouTube watch URL remains in video:content_loc")

    fc = read(SITE / "rent-to-own-homes-in-fort-collins-is-it-right-for-you-in-2025.html")
    for phrase in (
        "2025 Buyer’s Guide",
        "It&rsquo;s an excellent choice",
        "smart, strategic way to get into the Fort Collins market",
        "www.thelittleladysellshomes.com/rent-to-own-fort-collins-colorado",
    ):
        if phrase in fc:
            errors.append(f"stale/promotional Fort Collins RTO phrase remains: {phrase}")
    if 'href="/rent-to-own.html#roi-rto-funnel"' not in fc:
        errors.append("Fort Collins RTO page is not bridged to the main options funnel")

    ilc = read(SITE / "what-is-an-ilc-and-when-should-you-get-a-full-survey.html")
    if "Typically $350&ndash;$600" in ilc or "$1,000&ndash;$2,500+" in ilc:
        errors.append("stale specific ILC/survey price range remains")

    return errors


def main() -> int:
    if not SITE.is_dir():
        print("traffic-growth: site/ not found", file=sys.stderr)
        return 2

    redirect_changes = ensure_duplicate_redirects()
    removed_sitemap = remove_duplicate_sitemap_urls()
    video_fixes = fix_video_sitemap()
    link_rewrites = 0
    faq_removals = 0
    market_fixes = 0
    changed_pages: set[str] = set()

    for p in sorted(SITE.rglob("*.html")):
        original = read(p)
        text = original
        text, n = rewrite_duplicate_hrefs(text)
        link_rewrites += n

        rel = p.relative_to(SITE).as_posix()
        if rel.startswith("communities/"):
            text, n = remove_self_nomination_faq(text)
            faq_removals += n
            text, n = fix_stale_community_market(text)
            market_fixes += n

        if rel == "rent-to-own-homes-in-fort-collins-is-it-right-for-you-in-2025.html":
            text = fix_fort_collins_rto(text)
        if rel == "what-is-an-ilc-and-when-should-you-get-a-full-survey.html":
            text = fix_ilc_cost(text)

        if text != original:
            text = touch_meaningful_freshness(text)
            write_if_changed(p, text)
            changed_pages.add("/" + rel)

    update_sitemap_dates(changed_pages)
    errors = validate()
    if errors:
        print("!! traffic-growth gate FAILED", file=sys.stderr)
        for e in errors[:80]:
            print(f"   - {e}", file=sys.stderr)
        if len(errors) > 80:
            print(f"   ... and {len(errors) - 80} more", file=sys.stderr)
        return 1

    print(f"--- traffic-growth gate OK: {len(changed_pages)} HTML files normalized")
    print(f"--- duplicate redirects added/normalized: {redirect_changes}")
    print(f"--- duplicate sitemap URLs removed: {removed_sitemap}")
    print(f"--- internal duplicate hrefs rewritten: {link_rewrites}")
    print(f"--- town self-nomination FAQ entries removed: {faq_removals}")
    print(f"--- stale community market claims corrected: {market_fixes}")
    print(f"--- YouTube content_loc entries removed: {video_fixes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
