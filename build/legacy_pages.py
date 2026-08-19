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
    inner content, drop scripts and document-level tags."""
    s = body_html or ""
    m = re.search(r"<body[^>]*>([\s\S]*?)</body>", s, re.I)
    if m:
        s = m.group(1)
    s = re.sub(r"<script[\s\S]*?</script>", "", s, flags=re.I)
    s = re.sub(r"<!DOCTYPE[^>]*>|</?html[^>]*>|</?head[^>]*>|<meta[^>]*>|<title[\s\S]*?</title>|<link[^>]*>", "", s, flags=re.I)
    # legacy copy writes tel:303-709-4262; iOS accepts it but the site-wide
    # convention (pinned by test-contact) is digits only.
    s = re.sub(r'href="(tel|sms):([^"]+)"',
               lambda m: f'href="{m.group(1)}:{re.sub(r"[^0-9+]", "", m.group(2))}"', s)
    return _localize_media(s.strip())


def _authored_html(term_blocks):
    parts = []
    for b in term_blocks or []:
        if b.get("html"):
            parts.append(_strip_doc_wrapper(b["html"]))
    return "\n".join(p for p in parts if p)


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
    built = skipped_existing = 0

    for t in terms:
        url = t["url"]
        if url == "/" or url.startswith("/-/"):
            continue
        rel = url.lstrip("/")
        # engine already serves this path (same name) -> engine page wins
        engine_owned = (url + ".html") not in previously_ours and (
            os.path.exists(os.path.join(B.OUT, rel + ".html")) or
            os.path.exists(os.path.join(B.OUT, rel, "index.html")))
        if engine_owned:
            skipped_existing += 1
            continue
        if url in RENAMED:
            redirects.append(f"{url} {RENAMED[url]} 301!")
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
            if authored and t.get("words", 0) > 30:
                body_parts.append(f"""
<section class="tight">
  <div class="wrap" style="max-width:820px">
    <div class="blog-article">{authored}</div>
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
        # canonical must match the legacy URL exactly (extensionless).
        out_file = os.path.join(B.OUT, rel + ".html")
        if os.path.exists(out_file):
            with open(out_file) as f:
                page_html = f.read()
            page_html = page_html.replace(
                f'rel="canonical" href="{B.SITE["domain"]}{url}.html"',
                f'rel="canonical" href="{B.SITE["domain"]}{url}"')
            with open(out_file, "w") as f:
                f.write(page_html)
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
