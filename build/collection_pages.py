"""The Little Lady's Signature Property Collection -- the luxury tier's pages.

2026-09-30 (Signature move, part 2 -- docs/SIGNATURE-MOVE.md). Christine retired
Signature Property Collection as a separate brand. Its luxury tier lives here now,
under /signature-property-collection/, built by this module from Signature's own
builders (build_money_pages, build_loveland_luxury_page, build_luxury_market,
build_concierge, build_luxury_home_tours, its buyers/sellers pages and two
guides), ported rather than copied:

- One site, one pipeline. Pages go through build.py's page(): this site's
  header, footer, forms, minified CSS, analytics and deploy gates. The tier look
  is body.tier-signature (style.css) and the Collection's own fonts, loaded only
  on these pages (build.py _collection_head).
- Christine only. Signature's pages presented a duo; on this site she is a solo
  agent (her decision, 2026-09-27), so the co-listing copy, the "250+ as a team"
  and "$200M+ combined" figures and the second agent's name, photo and phone are
  not carried over. Her own figures are the site's: 150+ homes sold personally,
  RealTrends Verified top 0.5%. tests/test-no-kendra.js pins it.
- Honest about the search. Since 2026-09-28 only her own listings render on these
  sites and every other search opens her Lofty home-search site, already
  filtered. So these pages no longer say "every $950K+ listing is live on this
  page, straight from IRES" or "right now": they offer that search as a button,
  and say plainly when Lofty cannot filter for what the page is about (horse
  property, riverfront). CLAUDE.md, Market-report truthfulness.
- CLAUDE.md copy rules: no "dream home" filler (the two video titles that use it
  are shown under a plain title), no self-nominating "best agent" copy (the
  "Best Luxury Real Estate Agent" guide is retitled "How To Choose A Luxury Real
  Estate Agent..."), no hand-typed market figures without a source and date.
- Every page has a lead form, built by build.py _tool_lead_form() so it carries
  the static attribution fields and consent line (the Signature pages had none,
  and 12 of them had no form at all). New form names, labelled in
  submission-created.js SOURCE_LABELS: signature-buyers-inquiry,
  signature-sellers-inquiry, signature-concierge-inquiry, signature-luxury-market,
  signature-resort-buyer-inquiry, signature-expired-inquiry.
- Canonicals point at the Signature URL each page stands in for until its
  redirect goes live (COLLECTION_CANONICAL_TO_SIGNATURE in build.py), so none of
  these pages is in the sitemap yet, and no existing page of this site links to
  them yet: that comes with phase (e), with Christine's OK.
"""

import json
from urllib.parse import urlencode

DIR = "/signature-property-collection"
# Christine's RealScout search, which Signature's mountain pages used for resort
# inventory her IRES-based home search does not carry.
REALSCOUT_SEARCH_URL = "https://christinegwinnup.realscout.com/agent/search"

# Every video these pages show, with the title shown for it. Real videos from
# Christine's channel; two YouTube titles say "Dream Home" and are shown here
# under a plain description instead (CLAUDE.md: no "dream home" filler).
VIDEOS = {
    "e-_3Qs3liQ0": "Inside a $1.35M Luxury Home in Small-Town Colorado",
    "2WJPuQvlhxM": "A Golf Course Home Tour on Loveland's Olde Course",
    "Dr5RN8_VfbU": "Custom Ranch Home with 4,000+ Sq Ft",
    "K2XYDr2cgYU": "What Makes a Home Luxurious? — Colliers Hill, Erie",
    "PxB2iHNqT74": "Luxury Home Tour in Erie, Colorado",
    "dqPsEqR55Wk": "913 Green Mountain Dr, Erie — Home Tour",
    "kAr4BH8C-JA": "4,200 Sq Ft Home on 4+ Acres in Nunn, Colorado",
    "-i3DOTQ5zN4": "MillCreek Open House Tour",
    "Jz4kQHtpfzM": "Why Loveland Buyers Love The Olde Course",
    "JFfx8G9OxP0": "Why Everyone Loves Living in Erie Colorado",
    "YvIPzWebofA": "Is This The Best Lake In Fort Collins?",
    "nqPzw2QUjzA": "Sweetheart Winery — One Reason I Moved Back To Loveland",
    "2mr0--sAM7s": "Devil's Backbone — Three Things To Know Before You Hike",
    "2jNGXw5lzAM": "I Moved Away From Loveland, CO... And Here's Why I'm Back",
    "NBR-GFs9y8c": "Livestock & Business Land in Colorado: Not What It Seems",
    "N57_J3llZCQ": "45 Acres + 40x60 Heated Shop | Custom Colorado Ranch (No HOA)",
}
# The luxury playlist's 14 videos, in playlist order (build.py LUXURY_PLAYLIST_VIDEOS).
PLAYLIST_ORDER = ["e-_3Qs3liQ0", "2WJPuQvlhxM", "Dr5RN8_VfbU", "K2XYDr2cgYU", "PxB2iHNqT74",
                  "kAr4BH8C-JA", "Jz4kQHtpfzM", "JFfx8G9OxP0", "YvIPzWebofA", "nqPzw2QUjzA",
                  "2mr0--sAM7s", "2jNGXw5lzAM", "dqPsEqR55Wk", "-i3DOTQ5zN4"]


def _p(slug):
    return f"{DIR}/{slug}.html"


# ---------------------------------------------------------------- helpers ---
def _page(B, title, meta, path, body, schema=None):
    B.page(title, meta, path, None, body, schema_extra=list(schema or []), tier=B.COLLECTION_TIER)


def _search_href(params):
    q = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    return f"{DIR}/search-homes.html" + (f"?{q}" if q else "")


def _search_block(B, params, label, note=None):
    """A home search for this page's market, as a button: it opens Christine's
    home-search site already filtered (the tier keeps the $950K floor unless the
    link names its own minimum). No listing data is fetched by the page."""
    note_html = f'<p class="search-note">{B.esc(note)}</p>' if note else ""
    return f"""<div class="collection-search">
      <div class="btn-row" style="justify-content:flex-start">
        <a class="btn btn-dark" href="{B.esc(_search_href(params))}">{B.esc(label)} &rarr;</a>
        <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/current-listings.html">{B.esc(B.SITE['agent'].split()[0])}'s Own Listings</a>
      </div>
      {note_html}
    </div>"""


def _video_card(B, vid, caption, dark=False):
    color = ' style="color:#e8e5e0"' if dark else ""
    cap = f'<p class="video-embed-caption"{color}>{B.esc(caption)}</p>' if caption else ""
    return f"<div>{B._yt_embed(vid, VIDEOS[vid])}{cap}</div>"


def _video_schema(B, vids):
    return [B._video_object_schema(
        vid, VIDEOS[vid],
        f"{VIDEOS[vid]} — a video from {B.SITE['agent']}'s channel, shown on "
        f"{B.COLLECTION_NAME}.") for vid in dict.fromkeys(vids)]


def _playlist_schema(B):
    """The luxury playlist as an ItemList, with the titles these pages show."""
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Luxury Home Tours in Northern Colorado",
        "description": (f"Video tours of luxury homes across Northern Colorado hosted by "
                        f"{B.SITE['agent']} — estate homes, acreage, golf-course frontage and "
                        f"custom builds from Loveland to Erie."),
        "url": B.LUXURY_PLAYLIST_URL,
        "numberOfItems": len(PLAYLIST_ORDER),
        "itemListOrder": "https://schema.org/ItemListOrderAscending",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "url": f"https://www.youtube.com/watch?v={vid}",
             "name": VIDEOS[vid]}
            for i, vid in enumerate(PLAYLIST_ORDER, start=1)],
    }, indent=None)


def _paras_html(B, paragraphs):
    """Short headings and paragraphs, the same rule Signature's builders used:
    a short line with no closing punctuation is a sub-heading."""
    return "\n      ".join(
        f'<h2 class="article-subhead" style="margin-top:32px">{B.esc(x)}</h2>'
        if len(x) < 70 and not x.endswith((".", "!", "?", ":", ","))
        else f"<p>{B._blog_para_html(x)}</p>"
        for x in paragraphs)


def _form_section(B, form_name, heading, lede, button, extra="", anchor="start"):
    return f"""<section class="tight" id="{anchor}">
  <div class="wrap grid-2">
    <div>
      <span class="eyebrow" style="color:var(--dusty-rose)">No Obligation</span>
      <h2 class="section-title">{B.esc(heading)}</h2>
      <p class="lede">{lede}</p>
    </div>
    {B._tool_lead_form(form_name, button, extra)}
  </div>
</section>"""


MESSAGE_FIELD = '<textarea name="message" rows="3" placeholder="{}"></textarea>'
ADDRESS_FIELD = '<input type="text" name="address" placeholder="Property Address (optional)">'


# The Collection's markets: the money pages, the mountain pages, and the $1M+ page.
MARKETS = [
    (_p("loveland-luxury-homes"), "Loveland Luxury Homes"),
    (_p("fort-collins-luxury-homes"), "Fort Collins Luxury Homes"),
    (_p("windsor-luxury-homes"), "Windsor Luxury Homes"),
    (_p("estes-park-luxury-homes"), "Estes Park Luxury Homes"),
    (_p("northern-colorado-horse-property"), "Horse Property & Acreage"),
    (_p("northern-colorado-riverfront-homes"), "Riverfront & Waterfront"),
    (_p("northern-colorado-golf-course-homes"), "Golf Course Homes"),
    (_p("vail-co-buyers-agent"), "Buying In Vail"),
    (_p("breckenridge-co-buyers-agent"), "Buying In Breckenridge"),
    (_p("steamboat-springs-co-buyers-agent"), "Buying In Steamboat"),
    (_p("winter-park-co-buyers-agent"), "Buying In Winter Park"),
]


def _markets_row(B, current_path):
    """Cross-links between the Collection's market pages, so authority pools
    instead of fragmenting (Signature's _money_pages_row)."""
    pills = "\n      ".join(
        f'<a class="city-pill" href="{path}">{B.esc(label)}</a>'
        for path, label in MARKETS + [(_p("luxury-market"), "Homes Over $1 Million")]
        if path != current_path)
    return f"""
<section class="tight section-dark">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">More From The Collection</span>
    <div class="city-pill-row" style="margin-top:14px">
      {pills}
    </div>
  </div>
</section>
"""


def build_collection_pages(B):
    build_hub(B)
    build_money_pages(B)
    build_buyers(B)
    build_sellers(B)
    build_concierge(B)
    build_luxury_market(B)
    build_luxury_home_tours(B)
    build_guides(B)
    build_expired_landing(B)
    build_form_definitions(B)
    print(f"  collection: {len(B.COLLECTION_CANONICAL_TO_SIGNATURE)} pages canonical to "
          f"Signature until their redirects (phase e)")


# ------------------------------------------------------------------- HUB ---
HUB_FAQ = [
    ("What is The Little Lady's Signature Property Collection?",
     "It is Christine Gwinnup's luxury practice: homes from $950,000 across Northern Colorado, "
     "including estate homes, acreage and horse property, and architecturally distinct homes. It "
     "used to have its own website, Signature Property Collection. It now lives inside The Little "
     "Lady Sells Homes, with the same agent and the same standard of marketing, so if you arrived "
     "from a printed piece or a link that says Signature Property Collection, you are in the right "
     "place."),
    ("What price range does the Collection cover?",
     "Its searches start at $950,000, the floor Christine uses for the luxury tier here. What that "
     "buys varies by town — lakefront in Loveland, foothills acreage west of Fort Collins, new "
     "construction in Windsor, view property in Estes Park — which is why each market has its own "
     "page."),
    ("Can I buy a luxury home here before I move to Colorado?",
     "Yes. The workable version is a scouting trip to choose the town, then a focused touring trip, "
     "with live video walkthroughs in between. What you should not do is waive an inspection on a "
     "house you have only seen on a screen. The relocation page and the free Northern Colorado "
     "Relocation Guide cover the whole sequence."),
    ("Does Christine represent buyers in the mountain resort towns?",
     "Yes. Colorado real estate licenses are statewide, so she represents buyers in Vail, "
     "Breckenridge, Steamboat Springs and Winter Park, working directly with the listing brokers "
     "there — often alongside the sale of a Front Range home that funds the purchase."),
]


def build_hub(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    services = [
        ("Buyer Representation", "Private showings, off-market access when it exists, and "
         "construction-grade diligence on estate homes, acreage and architecturally significant "
         "properties — not a generic buyer's-agent checklist."),
        ("Luxury Marketing &amp; Staging", "Cinematic video, drone and print campaigns built for "
         "$1M+ listings, paired with professional staging that photographs the way the home "
         "actually lives."),
        ("Concierge Relocation", "For executives, out-of-state buyers and families "
         "moving on a timeline — private tours, trusted local vendors, and one point of contact "
         "from first call to closing."),
        ("Investment &amp; Acreage Advisory", "Farm, ranch and acreage transactions, creative "
         "financing structures, and portfolio strategy for investors in Northern Colorado's "
         "luxury tier."),
    ]
    services_html = "\n      ".join(
        f'<div class="card"><h3>{t}</h3><p>{d}</p></div>' for t, d in services)
    market_cards = "\n      ".join(
        f'<a class="card" href="{path}" style="display:block"><h3>{esc(label)}</h3></a>'
        for path, label in MARKETS)
    guides = [
        (_p("luxury-market"), "Northern Colorado Homes Over $1 Million",
         "Who buys and who sells at this level, and what they search for first."),
        (_p("selling-a-luxury-home-northern-colorado-2026"), "Selling A Luxury Home In 2026",
         "What the current market rewards when you price and launch a $1M+ home."),
        (_p("how-to-choose-a-luxury-real-estate-agent"), "How To Choose A Luxury Agent",
         "The credentials you can verify, and the four questions that separate agents."),
        (_p("concierge-experience"), "The Concierge Experience",
         "What working together looks like, from first call to after the close."),
        (_p("luxury-home-tours"), "Luxury Home Tours",
         "Every luxury tour Christine has published, in one place."),
        (_p("expired-listings"), "A Second Strategy For An Expired Listing",
         "The relaunch advisory for a luxury listing that did not sell the first time."),
    ]
    guide_cards = "\n      ".join(
        f'<a class="card" href="{path}" style="display:block"><h3>{esc(t)}</h3><p>{esc(d)}</p></a>'
        for path, t, d in guides)
    testimonials = "\n      ".join(B._testimonial_card(t, who) for t, who in B.TESTIMONIALS[:3])
    # The Collection's own articles (moved from Signature's blog; build.py
    # COLLECTION_BLOG_SLUGS), linked from here rather than from the site's blog
    # index while their canonicals still point at Signature.
    posts = [b for b in B.BLOG if b["slug"] in B.COLLECTION_BLOG_SLUGS]
    insights = "\n      ".join(
        f'<a class="card" href="/blog/{esc(b["slug"])}.html" style="display:block">'
        f'<span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">{esc(b.get("date") or "")}</span>'
        f'<h3>{esc(b["title"])}</h3><p>{esc(b.get("meta") or "")}</p></a>'
        for b in posts)
    insights_html = f"""
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Luxury Insights</span>
    <h2 class="section-title">From The Collection&rsquo;s Journal</h2>
    <div class="grid-3" style="gap:24px">
      {insights}
    </div>
  </div>
</section>
""" if posts else ""
    faq_html, faq_schema = B._faq_block(HUB_FAQ)
    tour_vids = ["e-_3Qs3liQ0", "2WJPuQvlhxM", "Dr5RN8_VfbU"]
    body = f"""
<section class="hero">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">Estate Homes &middot; Acreage &middot; Architecturally Significant Property</span>
    <h1>The Little Lady&rsquo;s Signature Property Collection</h1>
    <p class="lede">{esc(B.SITE['agent'])}&rsquo;s luxury practice: homes from $950K across
    Northern Colorado, Denver north through Larimer and Weld counties. Formerly Signature
    Property Collection &mdash; the same agent and the same standard, now part of
    {esc(B.SITE['name'])}.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="{_p('buyers')}">Buying At This Level</a>
      <a class="btn btn-outline" href="{_p('sellers')}">Selling An Estate Home</a>
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow">{esc(B.SITE['agent'])}</span>
    <h2 class="section-title">One Agent For Northern Colorado&rsquo;s Luxury Tier</h2>
    <p class="lede">RealTrends Verified in the top 0.5% of agents nationwide, with 150+ homes sold
    personally, {esc(first)} represents the estate homes, acreage and architecturally distinct
    properties that a general search does not do justice to &mdash; and handles each one
    herself.</p>
    <div class="grid-2" style="gap:32px">
      {services_html}
    </div>
  </div>
</section>

<section class="section-dark">
  <div class="wrap">
    <span class="eyebrow">Where The Collection Works</span>
    <h2 class="section-title">The Collection&rsquo;s Markets</h2>
    <p class="lede">A page for each market, written for the buyer or seller at this level: the
    micro-markets that matter, the homework the land demands, and a search already filtered for
    it.</p>
    <div class="grid-3" style="gap:20px">
      {market_cards}
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Read Before You Decide</span>
    <h2 class="section-title">Guides &amp; The Way Christine Works</h2>
    <div class="grid-3" style="gap:24px">
      {guide_cards}
    </div>
  </div>
</section>

<section class="section-dark tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Video Tours</span>
    <h2 class="section-title" style="color:#fff">Featured Luxury Home Tours</h2>
    <p class="lede" style="color:#e8e5e0;max-width:780px">Real Northern Colorado luxury homes,
    filmed and hosted by {esc(first)}: a small-town estate, a golf-course home on The Olde
    Course, and a custom ranch.</p>
    <div class="video-grid">
      {_video_card(B, "e-_3Qs3liQ0", "A $1.35M home in a small Northern Colorado town, toured top to bottom.", dark=True)}
      {_video_card(B, "2WJPuQvlhxM", "The Olde Course: golf-course living in Loveland, from the back patio.", dark=True)}
      {_video_card(B, "Dr5RN8_VfbU", "A 4,000+ sq ft custom ranch, the single-level layout buyers ask for by name.", dark=True)}
    </div>
    <div class="btn-row" style="margin-top:36px">
      <a class="btn" style="background:#E57373;color:#141415" href="{_p('luxury-home-tours')}">See Every Luxury Tour &rsaquo;</a>
      <a class="btn btn-outline" style="border-color:#F8F6F4;color:#F8F6F4" href="{B.LUXURY_PLAYLIST_URL}"
         target="_blank" rel="noopener">Watch On YouTube</a>
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Search</span>
    <h2 class="section-title">Northern Colorado Homes From $950K</h2>
    <p class="lede">The search opens every active listing from $950,000 in Larimer and Weld
    counties on {esc(first)}&rsquo;s home-search site, already filtered. Her own current listings
    are on this site.</p>
    {_search_block(B, {}, "Search Homes From $950K")}
  </div>
</section>

<section>
  <div class="wrap">
    <span class="eyebrow">5-Star Rated on Google</span>
    <h2 class="section-title">What Clients Say</h2>
    <div class="grid-3">
      {testimonials}
    </div>
    <div class="btn-row" style="margin-top:40px">
      <a class="btn btn-dark" href="/testimonials.html">Read All The Reviews</a>
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/sold-homes-map.html">See The Homes She Has Sold</a>
    </div>
  </div>
</section>
{insights_html}
{faq_html}
{_form_section(B, "signature-concierge-inquiry", "Start A Private Conversation",
    f"Buying, selling, or two years out and still deciding &mdash; tell {esc(first)} what you "
    "are weighing. She answers these herself, usually the same day.",
    "Start The Conversation", MESSAGE_FIELD.format("What are you weighing? (optional)"))}
"""
    _page(B,
          "The Little Lady's Signature Property Collection",
          f"{B.SITE['agent']}'s luxury practice: estate homes, acreage and architecturally "
          f"significant property from $950K across Northern Colorado, formerly Signature "
          f"Property Collection.",
          B.COLLECTION_HUB, body,
          [faq_schema, _playlist_schema(B)] + _video_schema(B, tour_vids))


# ----------------------------------------------------------- MONEY PAGES ---
# Signature's build_loveland_luxury_page() and build_money_pages() (2026-08-18 to
# 08-20), one list now. Christine's own words and research are kept; what changed
# is listed in this module's docstring.
MONEY_PAGES = [
    {
        "slug": "loveland-luxury-homes",
        "title": "Loveland CO Luxury Homes For Sale | Lakefront & Foothills Estates",
        "meta": "Loveland homes from $950K — lakefront on Boyd Lake, Mariana Butte golf homes, "
                "foothills acreage and Centerra custom builds — with the neighborhoods explained by "
                "a Loveland agent who lives here.",
        "h1": "Loveland CO Luxury Homes For Sale",
        "eyebrow": "Lakefront &middot; Golf &middot; Foothills Acreage &middot; Custom Builds",
        "intro": "Luxury in Loveland doesn't mean one neighborhood — it means lakefront on Boyd Lake "
                 "and Horseshoe Lake, golf-course homes at Mariana Butte, foothills acreage out west "
                 "toward Masonville, custom builds in Dakota Glen, and modern estates on the Centerra "
                 "side. The search below opens every active $950K+ Loveland listing, already filtered.",
        "search": {"cities": "Loveland"},
        "search_label": "Search Loveland Homes From $950K",
        "videos_heading": "Loveland Luxury, On Video",
        "videos": [
            ("2WJPuQvlhxM", "The Olde Course — what a Loveland golf-course home looks like inside."),
            ("Jz4kQHtpfzM", "The Olde Course neighborhood and why buyers keep choosing it, in under a minute."),
            ("2jNGXw5lzAM", "Christine's own move-back story — the honest case for planting roots here."),
        ],
        "paragraphs": [
            "What Luxury Actually Means In Loveland",
            "Loveland's top of the market runs differently than Denver's or Boulder's. Here, the luxury tier "
            "generally starts around $950K and runs past $2.5M — and what that buys is the interesting part: "
            "real lakefront, real acreage, real custom construction, at prices that would get a nice townhouse "
            "closer to Denver. That's exactly why so many of my luxury buyers are arriving from somewhere more "
            "expensive.",
            "The Micro-Markets That Matter",
            "The lakes first: homes on and around [Boyd Lake](/communities/loveland/boyd-lake-north-loveland.html) "
            "and Horseshoe Lake are the closest thing Northern Colorado has to true waterfront living, and they "
            "trade accordingly. West of town, the [Buckhorn corridor](/communities/loveland/buckhorn-subdivisions-loveland.html) "
            "and the foothills subdivisions — Bonnell West, Sedona Hills, up toward Masonville — are where acreage, "
            "views, and horse setups live. Mariana Butte wraps the golf course on the west side. "
            "[Downtown](/communities/loveland/downtown-loveland-real-estate.html) has quietly added genuine "
            "high-end condos above the galleries and restaurants. And on the east side, "
            "[Kinston and the Centerra area](/communities/loveland/kinston-centerra-loveland.html) carry the newest "
            "construction — beautiful homes, and the part of town where you should read my "
            "[metro-district tax guide](/blog/colorado-metro-districts-what-your-property-tax-bill-wont-tell-you.html) "
            "before you write an offer, because the real tax bill on a newer build can differ sharply from the listing's.",
            "Buying At This Level While Selling Your Current Home",
            "Most of my luxury buyers aren't first-timers — they're moving up, and the real puzzle isn't finding "
            "the next house, it's sequencing the sale of the current one. There are more ways to solve that than "
            "most people think: contingent offers done credibly, bridge financing, HELOC strategies — I wrote out "
            "the honest pros and cons in [Bridge Loans, HELOCs & Creative Ways To Buy Before You Sell]"
            "(/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html). If you want to know what "
            "your current home would actually bring, ask me for a real valuation — not an algorithm's guess — and "
            "we'll build the sequence from there.",
            "Why Work With A Loveland Luxury Specialist",
            "I live here, I list here, and I've sold over 150 homes personally across Northern Colorado. At this "
            "price point, the difference between a good outcome and a great one is made in preparation, "
            "positioning, and negotiation, not in luck. If you're weighing Loveland against the other towns "
            "first, start with [the honest town-by-town comparison](/blog/moving-to-northern-colorado-which-town-actually-fits.html) "
            "or the full guide to [living in Loveland](/communities/larimer/loveland.html).",
        ],
        "faq": [
            ("What price range counts as a luxury home in Loveland?",
             "The luxury tier in Loveland generally begins around $950,000 — which is the floor this page's "
             "search uses — and the top of the current market reaches past $2.5 million. What distinguishes "
             "the tier here is less the number than what it buys: lakefront, acreage, golf-course frontage, or "
             "true custom construction."),
            ("Which Loveland neighborhoods have luxury homes?",
             "The lakefront streets around Boyd Lake and Horseshoe Lake, the Mariana Butte golf community, the "
             "foothills and acreage subdivisions west of town (Bonnell West, the Buckhorn corridor, toward "
             "Masonville), Dakota Glen, downtown Loveland's newer high-end condos, and the newest construction "
             "in Kinston and the Centerra area on the east side."),
            ("Can I buy a Loveland luxury home before selling my current house?",
             "Often, yes — through a credible contingent offer, bridge financing, or a HELOC strategy, depending "
             "on your equity and timeline. Christine walks move-up buyers through the honest pros and cons of "
             "each and helps sequence the sale and purchase so neither transaction holds the other hostage."),
        ],
    },
    {
        "slug": "fort-collins-luxury-homes",
        "title": "Fort Collins CO Luxury Homes For Sale | Old Town To The Foothills",
        "meta": "Fort Collins homes from $950K — Old Town's historic blocks, the west-side foothills near "
                "Horsetooth, and the Harmony corridor — with a local luxury specialist.",
        "h1": "Fort Collins CO Luxury Homes For Sale",
        "eyebrow": "Old Town Historic &middot; Foothills &amp; Horsetooth &middot; Harmony Corridor",
        "intro": "Fort Collins luxury splits into distinct personalities: meticulously kept historic homes "
                 "in and around Old Town, foothills properties out west toward Horsetooth with the views that "
                 "justify the drive, and newer executive homes along the Harmony corridor on the south side. "
                 "The search below opens every active $950K+ Fort Collins listing, already filtered.",
        "search": {"cities": "Fort Collins"},
        "search_label": "Search Fort Collins Homes From $950K",
        "videos_heading": "Fort Collins, On Video",
        "videos": [
            ("YvIPzWebofA", "Christine on one of the west-side lakes that shapes Fort Collins luxury — the "
                            "water and foothills story a listing sheet can't tell."),
        ],
        "paragraphs": [
            "Where Fort Collins Luxury Actually Lives",
            "Old Town first: the historic blocks near downtown carry homes a century old that have been "
            "brought to modern standards, and they trade on scarcity — there is a fixed supply of them and "
            "no way to build more. West of town, the foothills toward Horsetooth Reservoir are where acreage, "
            "elevation, and views live; these properties often come with wells and rural considerations, so "
            "read [the acreage homework guide](/blog/buying-acreage-in-northern-colorado-wells-water-septic.html) "
            "before you fall for one. South, the Harmony corridor's newer executive neighborhoods put you "
            "close to the tech employers and the airport run.",
            "Weighing Fort Collins Against Its Neighbors",
            "Many buyers at this level are deciding between Fort Collins and somewhere quieter — "
            f"[Windsor's newer construction]({_p('windsor-luxury-homes')}), [Loveland's lakes and foothills]"
            f"({_p('loveland-luxury-homes')}), or Timnath a few minutes east. The honest comparison is in "
            "[the town-by-town guide](/blog/moving-to-northern-colorado-which-town-actually-fits.html), and "
            "the full picture of daily life is on the [living in Fort Collins page]"
            "(/communities/larimer/fort-collins.html).",
            "Buying At This Level While Selling Your Current Home",
            "Most luxury buyers here are moving up, and the sequencing question — buy first or sell first — "
            "matters more than any single house. The honest options are laid out in [Bridge Loans, HELOCs & "
            "Creative Ways To Buy Before You Sell](/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html), "
            "and a real valuation of your current home is the place to start.",
        ],
        "faq": [
            ("What price range counts as a luxury home in Fort Collins?",
             "The luxury tier in Fort Collins generally begins around $950,000 — the floor this page's "
             "search uses. What that buys varies sharply by area: a restored historic home near Old Town, "
             "acreage with views in the west-side foothills, or a large newer executive home along the "
             "Harmony corridor."),
            ("Which Fort Collins areas have luxury homes?",
             "The historic blocks in and around Old Town, the foothills west of town toward Horsetooth "
             "Reservoir, and the newer executive neighborhoods along the Harmony corridor in south Fort "
             "Collins. Acreage properties sit mainly on the west and north edges."),
            ("Does Christine Gwinnup work in Fort Collins?",
             "Yes — Christine represents buyers and sellers across Larimer County, including Fort Collins, "
             "with 150+ homes sold personally across Northern Colorado's Front Range."),
        ],
    },
    {
        "slug": "windsor-luxury-homes",
        "title": "Windsor CO Luxury Homes For Sale | Lakes, Golf & New Construction",
        "meta": "Windsor homes from $950K — lake communities, golf-course homes and Northern Colorado's "
                "newest luxury construction, with the metro-district homework included.",
        "h1": "Windsor CO Luxury Homes For Sale",
        "eyebrow": "Lake Communities &middot; Golf Course Living &middot; New Construction",
        "intro": "Windsor is where Northern Colorado's newest luxury construction lives — master-planned "
                 "lake and golf communities like Water Valley and RainDance, custom builds, and modern "
                 "floor plans you simply can't find in the older towns. The search below opens every "
                 "active $950K+ Windsor listing, already filtered.",
        "search": {"cities": "Windsor"},
        "search_label": "Search Windsor Homes From $950K",
        "paragraphs": [
            "Why Luxury Buyers Keep Choosing Windsor",
            "The honest answer: newness and water. Windsor's master-planned communities — Water Valley and "
            "Pelican Lakes around the golf course and lakes, RainDance with its own national golf course — "
            "deliver the modern-build experience at prices that surprise buyers arriving from Denver or "
            "either coast. Add the I-25 position splitting the Fort Collins and Greeley commutes, and the "
            "town's growth story explains itself. The full daily-life picture is on the "
            "[living in Windsor page](/communities/weld/windsor.html).",
            "The One Thing To Check Before You Offer On A Newer Build",
            "Most of Windsor's newer neighborhoods sit inside metro districts, which change the real "
            "property-tax math — the figure on the listing is often years out of date, and the real bill "
            "can differ by thousands. Read [the metro-district guide](/blog/colorado-metro-districts-what-your-property-tax-bill-wont-tell-you.html) "
            "before you write an offer; it takes fifteen minutes and it is the single most valuable "
            "homework in this market.",
            "Weighing Windsor Against Its Neighbors",
            f"Windsor versus [Fort Collins]({_p('fort-collins-luxury-homes')}) is the classic comparison — "
            f"newer and quieter versus established and walkable. [Loveland]({_p('loveland-luxury-homes')}) "
            "adds lakes and foothills to the mix, and Timnath sits between. The town-by-town honest "
            "version is in [the comparison guide](/blog/moving-to-northern-colorado-which-town-actually-fits.html).",
        ],
        "faq": [
            ("What price range counts as a luxury home in Windsor?",
             "The luxury tier in Windsor generally begins around $950,000 — the floor this page's search "
             "uses — and runs well past $2 million for custom lakefront and golf-course homes in the "
             "master-planned communities."),
            ("Which Windsor neighborhoods have luxury homes?",
             "Water Valley and Pelican Lakes around the lakes and golf course, RainDance with its national "
             "golf course, and the custom and semi-custom builds throughout Windsor's newer master-planned "
             "areas. Many sit inside metro districts, which affects the real tax bill — worth checking "
             "before you offer."),
            ("Do Windsor's new-construction homes have extra taxes?",
             "Many newer Windsor neighborhoods sit inside metro districts — special taxing districts that "
             "repay infrastructure bonds through an additional property-tax levy, often for 20-30 years. "
             "The listing's tax figure frequently predates the full levy. Christine checks the parcel's "
             "actual taxing authorities for every buyer before an offer is written."),
        ],
    },
    {
        "slug": "northern-colorado-horse-property",
        "title": "Northern Colorado Horse Property For Sale | Equestrian & Acreage",
        "meta": "Horse property and acreage across Northern Colorado — and the well, water and zoning "
                "homework that decides whether a horse property actually works, from an agent who "
                "specializes in exactly this.",
        "h1": "Northern Colorado Horse Property For Sale",
        "eyebrow": "Equestrian &middot; Acreage &middot; Barns, Shops &amp; Water",
        "intro": "Horse property is its own market with its own rules — the land, the water, the zoning, "
                 "and the outbuildings matter as much as the house. This page carries the homework that "
                 "separates a working horse setup from an expensive disappointment, and a search across the "
                 "towns where the horse properties are.",
        "search": {"cities": "Loveland,Berthoud,Wellington,Fort Collins,Eaton,Ault,Nunn,Pierce",
                   "minPrice": "500000"},
        "search_label": "Search The Horse-Property Towns",
        "search_note": "Christine's home-search site has no horse-property filter, so this opens every home "
                       "from $500K in the towns where the horse properties are — Loveland, Berthoud, "
                       "Wellington, Fort Collins, Eaton, Ault, Nunn and Pierce. Tell her what the horses "
                       "need (arena, pasture for two, boarding income) and she will send the real list, "
                       "including properties whose listings never mention horses.",
        "videos_heading": "Ag &amp; Acreage, Straight Talk On Video",
        "videos": [
            ("NBR-GFs9y8c", "Christine on why livestock and business-use land is never quite what the listing "
                            "suggests — the zoning and use questions to ask first."),
            ("N57_J3llZCQ", "How Christine markets an acreage listing — a real tour she filmed for a 45-acre "
                            "ranch with a heated shop and no HOA."),
            ("kAr4BH8C-JA", "A 4,200 sq ft home on 4+ acres in Nunn — the Weld County acreage market the "
                            "paragraph below names, in a real tour."),
        ],
        "paragraphs": [
            "The Three Questions That Decide Every Horse Property",
            "First, the well: nearly every rural well operates under a state permit that says exactly what "
            "it may legally be used for, and two identical wells can carry completely different rights — one "
            "allowing livestock watering, the other restricted to household use only. Second, the water: "
            "irrigation rights convey separately from the land, and a ditch crossing the property proves "
            "nothing. Third, the zoning: what the county allows decides whether you can board horses, build "
            "the arena, or add the second dwelling — not the listing description. The full homework is in "
            "[the acreage guide: wells, water, and septic](/blog/buying-acreage-in-northern-colorado-wells-water-septic.html).",
            "Where The Horse Properties Are",
            "West of the towns: the Masonville and [Buckhorn corridor](/communities/loveland/buckhorn-subdivisions-loveland.html) "
            "foothills carry acreage with views minutes from Loveland. North and east: [Berthoud]"
            "(/communities/larimer/berthoud.html) quietly holds some of the region's best equestrian "
            "inventory, Wellington and north Fort Collins offer working acreage, and Weld County — Eaton, "
            "Ault, Nunn, Pierce — is where the serious land is, at prices Larimer can't match.",
            "How To Search For Horse Property",
            "No home-search site filters for horse property well: listings describe arenas, pasture and "
            "water rights in their remarks, not in a field a search can read, and a property the listing "
            "agent never described as horse-ready won't show up as one even if it is. That is why the best "
            "horse properties often come through an agent who knows what a listing actually is, not just "
            "what it says. Tell Christine what you're after — arena, boarding income, pasture for two "
            "horses — and she'll search it directly.",
        ],
        "faq": [
            ("What should I check before buying horse property in Colorado?",
             "Three things decide most rural deals: the well permit (its permitted uses are a legal matter "
             "of record — livestock watering is not automatic), the water rights (they convey separately "
             "from the land and must be named in the contract), and county zoning (which decides boarding, "
             "arenas, and outbuildings). A septic inspection at transfer is part of closing in this region."),
            ("Where are the horse properties in Northern Colorado?",
             "The foothills west of Loveland (Masonville, the Buckhorn corridor), Berthoud's acreage "
             "properties, Wellington and north Fort Collins, and the Weld County towns — Eaton, Ault, Nunn, "
             "and Pierce — where larger parcels trade at prices Larimer County can't match."),
            ("Can I search for horse property directly?",
             "Not reliably, on any site: horse facilities are described in listing remarks rather than in a "
             "field a search can filter, so a horse-ready property the listing agent didn't describe that "
             "way won't appear. The search on this page covers the horse-property towns; for a real list, "
             "tell Christine what the horses need and she'll pull it directly."),
        ],
    },
    {
        "slug": "northern-colorado-riverfront-homes",
        "title": "Northern Colorado Riverfront & Waterfront Homes For Sale",
        "meta": "Riverfront and waterfront homes across Northern Colorado — from an agent who lives on "
                "riverfront property herself and knows what river ownership actually involves: the water "
                "rights, the floodplain questions, and the mornings that make it worth it.",
        "h1": "Riverfront & Waterfront Homes In Northern Colorado",
        "eyebrow": "Big Thompson &middot; Poudre &middot; Lakes &amp; Water Frontage",
        "intro": "I live on riverfront property myself — so this page isn't theory. Riverfront ownership "
                 "in Colorado is a specific kind of wonderful with a specific set of homework, and both "
                 "halves belong in the open: the questions I'd ask before buying on the water, and a search "
                 "across the river and lake towns.",
        "search": {"cities": "Loveland,Fort Collins,Windsor,Estes Park", "minPrice": "500000"},
        "search_label": "Search The River & Lake Towns",
        "search_note": "Christine's home-search site has no riverfront filter, so this opens every home from "
                       "$500K in Loveland, Fort Collins, Windsor and Estes Park. \"Waterfront\" in a listing "
                       "can mean anything from true river frontage to a pond view — tell her what you want "
                       "from the water and she'll tell you which listings deliver it.",
        "paragraphs": [
            "What Living On The River Is Actually Like",
            "The honest version, from someone who does it: mornings on the water change how a house feels "
            "to live in, and no photo captures it. The Big Thompson west of Loveland, the Poudre corridor "
            "toward Fort Collins, and the lake communities in between each offer a different version — "
            "canyon-mouth river frontage, cottonwood-lined stretches in town, or [true lakefront at Boyd "
            "Lake](/communities/loveland/waterfront-at-boyd-lake-loveland.html). The Big Thompson's "
            "quieter west side has its own guide: [West Loveland & Big Thompson river frontage]"
            "(/communities/loveland/west-loveland-riverfront-homes.html).",
            "The Homework Water Demands",
            "Three things to settle before you fall in love. Floodplain status: river parcels often carry "
            "flood-zone designations that shape insurance costs and what you can build — the FEMA map for "
            "the specific parcel is a five-minute check that changes offers. Water rights: owning land "
            "along a river does not mean owning rights to its water — in Colorado those convey separately, "
            "and the contract has to name them. And the riverbank itself: maintenance, erosion, and what "
            "the county allows you to do at the water's edge vary by parcel. The broader rural checklist "
            "is in [the acreage guide](/blog/buying-acreage-in-northern-colorado-wells-water-septic.html).",
            "How To Search For Riverfront Property",
            "\"Waterfront\" in a listing can mean anything from true river frontage to a seasonal ditch "
            "view, and no search filter tells the two apart. I read these listings differently because I "
            "live this — tell me what you actually want from the water, and I'll tell you which listings "
            "deliver it and which just photographed well.",
        ],
        "faq": [
            ("What should I check before buying riverfront property in Colorado?",
             "Three things: the parcel's FEMA floodplain status (it shapes insurance and building rules), "
             "the water rights (in Colorado they convey separately from the land — riverfront ownership "
             "does not automatically include rights to the water), and the practical riverbank questions: "
             "erosion, maintenance, and what the county permits at the water's edge."),
            ("Where are the riverfront homes in Northern Colorado?",
             "The Big Thompson River corridor west of Loveland and up the canyon toward Estes Park, the "
             "Cache la Poudre corridor through and west of Fort Collins, and the lake communities — Boyd "
             "Lake in east Loveland, Water Valley and Pelican Lakes in Windsor — for true lakefront."),
            ("Does 'waterfront' in a listing always mean river frontage?",
             "No — in MLS listings it can mean anything from genuine river frontage to a pond view or "
             "irrigation ditch. Christine lives on riverfront property herself and reads these listings "
             "accordingly; ask her which ones deliver the real thing."),
        ],
    },
    {
        "slug": "northern-colorado-golf-course-homes",
        "title": "Northern Colorado Golf Course Homes For Sale | TPC To Olde Course",
        "meta": "Golf community living across Northern Colorado — TPC Colorado in Berthoud, RainDance and "
                "Pelican Lakes in Windsor, Mariana Butte and the Olde Course in Loveland, Harmony Club in "
                "Timnath, Colorado National in Erie — with real video tours.",
        "h1": "Golf Course Homes In Northern Colorado",
        "eyebrow": "TPC Colorado &middot; RainDance &middot; Mariana Butte &middot; The Olde Course",
        "intro": "Northern Colorado quietly holds one of the state's best collections of golf communities — "
                 "from TPC Colorado's tournament pedigree in Berthoud to Loveland's beloved municipal "
                 "courses with real neighborhoods wrapped around them. Here's the course-by-course tour, "
                 "with a $950K+ search across the golf towns.",
        "search": {"cities": "Loveland,Windsor,Berthoud,Timnath,Erie,Fort Collins"},
        "search_label": "Search The Golf Towns From $950K",
        "search_note": "No home search filters for golf frontage — listings describe it in their remarks — so "
                       "this opens every home from $950K in the golf towns. For course-specific inventory, "
                       "tell Christine which course and which side of it.",
        "videos_heading": "Golf-Course Living, On Video",
        "videos": [
            ("2WJPuQvlhxM", "Christine tours a home on The Olde Course — what golf-course living in Loveland "
                            "actually looks like from the back patio."),
            ("Jz4kQHtpfzM", "The Olde Course at Loveland and the neighborhood around it, in under a minute."),
            ("JFfx8G9OxP0", "Erie — home of Colorado National Golf Club — and why buyers keep landing there."),
        ],
        "paragraphs": [
            "The Course-By-Course Tour",
            "Berthoud: TPC Colorado is the region's marquee name — a tournament course with newer custom "
            "and semi-custom neighborhoods around it, in a small town that kept its main street. Start with "
            "[living in Berthoud](/communities/larimer/berthoud.html). Windsor: RainDance National and "
            "Pelican Lakes at Water Valley anchor two master-planned communities where the golf, the lakes, "
            "and the newest construction come as a package — the full picture is on the "
            f"[Windsor luxury page]({_p('windsor-luxury-homes')}), including the metro-district homework newer "
            "builds deserve. Timnath: Harmony Club wraps a private course with custom homes minutes from "
            "Fort Collins — see [living in Timnath](/communities/larimer/timnath.html).",
            "Loveland's Two Courses, And Why Locals Love Them",
            "Loveland's golf living is municipal and proud of it. [Mariana Butte]"
            "(/communities/loveland/mariana-butte-loveland.html) wraps homes, patio homes, and condos "
            "around the city-owned course above the Big Thompson on the west side. The Olde Course in "
            "northwest Loveland is the mature-trees classic, with a neighborhood that holds its value — "
            "Christine's video tours of it are below. Fort Collins adds Ptarmigan's championship course on "
            "the city's south side, and Erie rounds out the region with Colorado National — "
            "[living in Erie](/communities/weld/erie.html) covers the town.",
            "How To Shop Golf Property Here",
            "One honest note about searching: MLS listings describe golf frontage in their remarks, not in "
            "a clean filter — so no website's 'golf homes' search is truly complete, including this one. "
            "For course-specific inventory — fairway frontage versus a course community versus a view of "
            "the green — tell Christine which course and which side of it, and she'll pull the real list, "
            "including homes whose listings never mention the course at all.",
        ],
        "faq": [
            ("Which golf communities are in Northern Colorado?",
             "TPC Colorado in Berthoud, RainDance National and Pelican Lakes at Water Valley in Windsor, "
             "Harmony Club in Timnath, Mariana Butte and The Olde Course in Loveland, Ptarmigan in south "
             "Fort Collins, and Colorado National in Erie — each with residential neighborhoods around or "
             "beside the course."),
            ("Do golf course homes cost more in Northern Colorado?",
             "Course frontage generally carries a premium over the same floor plan off the course, and the "
             "newer master-planned golf communities often sit inside metro districts that affect the real "
             "property-tax bill. Christine checks both — the premium and the parcel's taxing authorities — "
             "before her buyers write an offer."),
            ("Can I search golf course homes directly?",
             "Partially — MLS listings describe golf frontage in their remarks rather than a filterable "
             "field, so no automated search is complete. The search on this page covers the golf towns "
             "from $950K; for true course-specific inventory, contact Christine and she'll pull it "
             "directly."),
        ],
    },
    {
        "slug": "estes-park-luxury-homes",
        "title": "Estes Park CO Luxury Homes For Sale | Mountain & River Estates",
        "meta": "Estes Park homes from $950K — view estates above town, Fall River and Big Thompson river "
                "frontage, and homes at the doorstep of Rocky Mountain National Park, with a Larimer County "
                "luxury specialist.",
        "h1": "Estes Park CO Luxury Homes For Sale",
        "eyebrow": "RMNP Gateway &middot; River Frontage &middot; View Estates At 7,500 Feet",
        "intro": "Estes Park luxury is its own market: view homes perched above town, river frontage "
                 "along Fall River and the Big Thompson, and mountain estates minutes from the Rocky "
                 "Mountain National Park entrance. The search below opens every active $950K+ Estes Park "
                 "listing, already filtered.",
        "search": {"cities": "Estes Park"},
        "search_label": "Search Estes Park Homes From $950K",
        "search_note": "Mountain inventory is thinner than the valley towns', so a short list is normal — ask "
                       "Christine what's coming rather than waiting for a listing.",
        "paragraphs": [
            "What Luxury Means At 7,500 Feet",
            "Estes Park's top of the market isn't about square footage — it's about position. The homes "
            "that command luxury prices here have one of three things: a protected view of the Continental "
            "Divide or Longs Peak, real river frontage on Fall River or the Big Thompson, or land that "
            "backs to public forest. A home with all three is the rarest property type in Larimer County, "
            "and when one lists, it moves on relationships as much as marketing.",
            "The Micro-Markets That Matter",
            "West of downtown, the Fall River corridor toward the national park entrance carries riverfront "
            "homes and lodges-turned-residences. Windcliff and the slopes off Highway 66 hold the "
            "dramatic view estates. Prospect Mountain rises straight out of downtown with homes that look "
            "down on the whole valley. Carriage Hills and the Marys Lake area trade a little drama for "
            "sun and easier winter driving — worth understanding before you fall for a north-facing "
            "driveway at this elevation. And around downtown itself there's a quiet market of condos and "
            "townhomes that let second-home owners lock-and-leave. For the full picture of living here "
            "year-round, start with my [Estes Park guide](/communities/larimer/estes-park.html).",
            "Second Homes, Short-Term Rentals, And The Honest Answer",
            "A large share of Estes buyers intend to rent their home when they're not using it — and "
            "Estes Park regulates vacation rentals with a licensing system that has real limits and, at "
            "times, a waitlist. The rules differ inside and outside town limits and they change by "
            "ordinance, so I won't quote you a number that could be wrong by the time you read it: before "
            "you write an offer that depends on rental income, we verify the property's licensing "
            "position directly with the Town of Estes Park and Larimer County. That one phone call has "
            "saved my buyers from expensive assumptions more than once.",
            "Mountain Ownership, Eyes Open",
            "Buying at elevation comes with questions the valley towns never ask: wildfire insurance and "
            "defensible space, wells and septic outside town limits, winter access on a steep grade, and "
            "what a Highway 34 or 36 closure means for your commute down the canyon. None of these are "
            "reasons not to buy — they're reasons to buy with someone who asks about them before the "
            "inspection, not after. If you're weighing Estes against the foothills towns lower down, "
            "read [the honest town-by-town comparison](/blog/moving-to-northern-colorado-which-town-actually-fits.html) "
            "first, or [explore the whole map](/explore.html?town=Estes%20Park) with my videos and "
            "local spots on it.",
        ],
        "faq": [
            ("What price range counts as a luxury home in Estes Park?",
             "The search on this page uses the Collection's $950,000 floor, and Estes Park's top tier runs "
             "well past that for true view estates and river frontage. What sets the tier apart here is "
             "position — Continental Divide views, Fall River or Big Thompson frontage, or land backing "
             "to public forest — more than finish level."),
            ("Can I rent out an Estes Park home as a short-term rental?",
             "Sometimes — Estes Park licenses vacation rentals, the rules differ inside and outside town "
             "limits, and licenses have been capped with waitlists at times. Christine verifies a "
             "specific property's licensing position with the Town and Larimer County before her buyers "
             "make an offer that depends on rental income."),
            ("Is Estes Park livable year-round?",
             "Yes — thousands of people do it happily — but winter matters when choosing the property: "
             "driveway aspect and grade, plowing access, and canyon-highway closures are real "
             "considerations. South-facing and in-town properties winter easiest; Christine walks "
             "buyers through exactly this on showings."),
        ],
    },
]

# Mountain buyer-representation pages (Signature, 2026-08-20). Colorado licenses
# are statewide, so representing buyers in Vail or Breckenridge is simply true;
# what these pages never claim is membership in the mountain MLSs or any market
# statistic. Resort listings are on those MLSs, not IRES, so the search here is
# her RealScout search plus a direct request, not the IRES-based home search.
RESORT_NOTE = ("Resort-market listings are on the mountain MLSs rather than IRES, so they are not on "
               "Christine's IRES-based home search. Search them with her on RealScout, or ask her "
               "directly — she works these searches herself.")
RESORT_PAGES = [
    {
        "slug": "vail-co-buyers-agent",
        "title": "Buying A Home In Vail CO | Buyer's Agent & Front Range Sequencing",
        "meta": "Buyer representation for Vail and the Eagle County resort corridor from a Colorado "
                "luxury broker — offer strategy, short-term-rental diligence, and sequencing the sale "
                "of your Front Range home to buy in the mountains.",
        "h1": "Buying In Vail, With Someone In Your Corner",
        "eyebrow": "Vail Village &middot; Lionshead &middot; East &amp; West Vail &middot; Eagle County",
        "intro": "Vail's market runs on relationships and speed — the best properties trade quickly and "
                 "quietly, and the buyer who wins is the one whose agent is organized before the listing "
                 "appears. I'm a Colorado-licensed luxury broker: I represent buyers statewide, and for "
                 "many of my Front Range clients the Vail purchase and the sale of their current home "
                 "are one connected move. That sequencing is my specialty.",
        "paragraphs": [
            "How Buying In Vail Actually Works",
            "The resort corridor is a different market culture than the Front Range: more cash, more "
            "second-home and investment intent, more properties that change hands before they're widely "
            "marketed. What a buyer's agent contributes here is preparation — financing or proof of funds "
            "ready, your criteria sharp enough to move in days, and a clear-eyed read on what a property "
            "is worth against what it's listed for. That's the same discipline I bring to $2M+ purchases "
            "on the Front Range, pointed up the hill.",
            "Short-Term Rentals: Verify Before You Offer",
            "If your Vail purchase depends on rental income, know that the Town of Vail and Eagle County "
            "each regulate short-term rentals with their own registration and zoning rules, and they "
            "change. I won't quote a rule here that could be stale by the time you read it — before any "
            "offer, we verify the specific property's rental position with the town or county directly. "
            "An assumption on this point is the most expensive mistake a resort buyer can make.",
            "Selling On The Front Range To Buy In The Mountains",
            "Many of my mountain buyers are funding the purchase with Front Range equity — and that's "
            "where working with one broker for both sides pays off. I sequence the sale and the purchase "
            "so neither holds the other hostage: honest pricing on the home you're leaving, bridge and "
            "HELOC options laid out plainly ([my guide to buying before you sell]"
            "(/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html)), and a timeline "
            "both transactions can actually keep. If you're still weighing mountain towns against each "
            "other, [ask me on the map](/explore.html?ask=commute%20to%20Denver%20in%2060%20min) or "
            f"start with [Estes Park]({_p('estes-park-luxury-homes')}), the mountain market inside my home "
            "county.",
        ],
        "faq": [
            ("Can Christine represent buyers in Vail?",
             "Yes — Colorado real estate licenses are statewide, so she represents buyers anywhere in "
             "Colorado, including Vail and the Eagle County resort corridor, working directly with "
             "listing brokers there."),
            ("Why doesn't Christine's home search show Vail listings?",
             "Her home-search site carries IRES, Northern Colorado's MLS; the resort corridor's listings "
             "are on the mountain MLSs. Search them with her on RealScout or contact her, and she'll pull "
             "what's actually available for your criteria."),
            ("Can I rent out a Vail property short-term?",
             "It depends on the specific property: the Town of Vail and Eagle County each have their "
             "own short-term-rental registration and zoning rules, and they change by ordinance. "
             "Christine verifies a property's rental position with the town or county before her "
             "buyers write an offer that depends on rental income."),
        ],
    },
    {
        "slug": "breckenridge-co-buyers-agent",
        "title": "Buying A Home In Breckenridge CO | Buyer's Agent & Second-Home Strategy",
        "meta": "Buyer representation for Breckenridge and Summit County from a Colorado luxury broker — "
                "second-home strategy, short-term-rental license diligence, and sequencing your Front "
                "Range sale to buy in the mountains.",
        "h1": "Buying In Breckenridge, With Someone In Your Corner",
        "eyebrow": "Breckenridge &middot; Frisco &middot; Silverthorne &middot; Summit County",
        "intro": "Summit County is the Front Range's mountain backyard — close enough for weekends, "
                 "which is exactly why so many of my Northern Colorado clients buy here. I'm a "
                 "Colorado-licensed luxury broker representing buyers statewide, and for most Summit "
                 "purchases the real project is the whole move: what to buy, what it's honestly worth, "
                 "and how the Front Range home you already own funds it.",
        "paragraphs": [
            "The Weekend-Distance Advantage",
            "Summit's defining fact is the drive: for a Fort Collins or Loveland family, a Breckenridge "
            "place gets used forty weekends a year instead of four. That changes what to buy — ski "
            "access matters, but so do parking, storage for the gear, and whether the property works in "
            "July as well as January. I help buyers weigh Breckenridge proper against Frisco, "
            "Silverthorne, Dillon and Keystone, because the right answer is often one town over from "
            "the first idea.",
            "Short-Term Rental Licenses: The Make-Or-Break Question",
            "Breckenridge and Summit County regulate short-term rentals through license systems with "
            "real caps and zones, and the rules differ between the towns and the unincorporated county — "
            "and they keep changing. A property's existing license status, and whether it transfers, can "
            "swing its value substantially. I won't print a rule that might be stale: before any offer, "
            "we verify the specific property's license position with the town or county. This single "
            "check is where I earn my keep in Summit County.",
            "Funding It From The Front Range",
            "Most of my Summit buyers hold their wealth in a Northern Colorado home. Sequencing that "
            "sale against the mountain purchase — contingencies done credibly, bridge and HELOC options "
            "([laid out honestly here](/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html)), "
            "tax questions flagged for your CPA early — is the difference between a smooth move and two "
            "transactions holding each other hostage. Start with a real valuation of the home you'd "
            "sell, and we build the plan from there.",
        ],
        "faq": [
            ("Can Christine represent buyers in Breckenridge and Summit County?",
             "Yes — Colorado licenses are statewide. She represents buyers throughout Summit County, "
             "working directly with the listing brokers there, and handles the Front Range sale that "
             "often funds the purchase."),
            ("Do I need a license to rent my Breckenridge home short-term?",
             "Yes, generally — Breckenridge and Summit County run short-term-rental license systems "
             "with caps and zone rules that differ by jurisdiction and change by ordinance. Christine "
             "verifies a specific property's license position before her buyers offer."),
            ("Which Summit County town should I buy in?",
             "It depends what the place is for: Breckenridge for the town-and-slopes experience, "
             "Frisco for year-round town life on the water, Silverthorne and Dillon for value and "
             "access, Keystone for ski-focused convenience. Christine helps buyers test the choice "
             "against how they'll actually use it."),
        ],
    },
    {
        "slug": "steamboat-springs-co-buyers-agent",
        "title": "Buying A Home In Steamboat Springs CO | Buyer's Agent For Routt County",
        "meta": "Buyer representation for Steamboat Springs and Routt County from a Colorado luxury "
                "broker — ranch and acreage diligence, short-term-rental zones, and sequencing your "
                "Front Range sale.",
        "h1": "Buying In Steamboat, With Someone In Your Corner",
        "eyebrow": "Steamboat Springs &middot; Ranch &amp; Acreage &middot; Routt County",
        "intro": "Steamboat is the mountain town my ranch and acreage clients gravitate to — a real "
                 "working valley with a ski resort in it, not the other way around. I'm a "
                 "Colorado-licensed broker representing buyers statewide, and Routt County purchases "
                 "reward exactly the diligence my Northern Colorado acreage work runs on: water, land "
                 "use, access, and honest value.",
        "paragraphs": [
            "A Ranch Valley With A Ski Resort",
            "Steamboat's character comes from the Yampa Valley's ranching roots, and its property types "
            "reflect it: genuine acreage and ranch parcels minutes from town, in-town neighborhoods "
            "with real community, and the resort-base condo market. My Northern Colorado practice is "
            f"heavy on [horse property and acreage]({_p('northern-colorado-horse-property')}) — wells, "
            "water rights, fencing, access easements, outbuildings — and that exact checklist is what "
            "Routt County land deserves before an offer.",
            "Short-Term Rentals: Zoned, Not Assumed",
            "Steamboat Springs regulates short-term rentals with a zone-based system — where a property "
            "sits on that map materially affects what you may do with it, and the rules evolve. Before "
            "any offer that depends on rental income, we verify the property's zone and license "
            "position with the city directly. Printed summaries go stale; the city's answer doesn't.",
            "The Front Range Connection",
            "Steamboat buyers from my market are usually making a life move, not just a purchase — "
            "selling acreage or a family home in Larimer or Weld County to fund the valley. One broker "
            "handling both ends keeps the timeline honest: [the buy-before-you-sell options]"
            "(/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html) laid out "
            "plainly, and both transactions sequenced so neither forces a bad decision on the other.",
        ],
        "faq": [
            ("Can Christine represent buyers in Steamboat Springs?",
             "Yes — Colorado licenses are statewide. She represents buyers throughout Routt County, "
             "and her Northern Colorado acreage practice (wells, water, access, land use) maps "
             "directly onto Steamboat's ranch and land market."),
            ("Can I short-term rent a Steamboat property?",
             "It depends where it sits: Steamboat Springs uses a zone-based short-term-rental system, "
             "and the answer varies street by street and changes by ordinance. Christine verifies the "
             "specific property's position with the city before her buyers offer."),
            ("Is Steamboat only a ski market?",
             "No — it's a working ranch valley with a resort in it. Acreage, in-town neighborhoods, "
             "and resort-base condos are three genuinely different markets, and the right one depends "
             "on how you'll actually live there."),
        ],
    },
    {
        "slug": "winter-park-co-buyers-agent",
        "title": "Buying A Home In Winter Park CO | Buyer's Agent For Grand County",
        "meta": "Buyer representation for Winter Park, Fraser, Granby and Grand Lake from a Colorado "
                "luxury broker — the closest major ski market to the Front Range, with honest "
                "short-term-rental and access diligence.",
        "h1": "Buying In Winter Park, With Someone In Your Corner",
        "eyebrow": "Winter Park &middot; Fraser &middot; Granby &middot; Grand Lake",
        "intro": "Grand County is the Front Range's closest major ski market — over Berthoud Pass or "
                 "through the Moffat Tunnel corridor, it's the mountain purchase that gets used the "
                 "most because it's the easiest to reach. I'm a Colorado-licensed broker representing "
                 "buyers statewide; for Northern Colorado families, Winter Park is often the "
                 "best-value answer to the second-home question.",
        "paragraphs": [
            "The Closest Real Mountains",
            "For a Fort Collins or Loveland family, Grand County is the mountain market you'll actually "
            "use on ordinary weekends. Winter Park and Fraser carry the ski-centered inventory; Granby "
            "and the Grand Lake side add golf, water, and year-round town life at friendlier prices; "
            "Tabernash sits usefully between. The right choice depends on whether the place is for "
            "skiing, for summers on the water, or for both — and the price difference between those "
            "answers is real.",
            "Rental Rules And Winter Access",
            "Short-term-rental rules in Grand County differ between the towns and the unincorporated "
            "county, and they change; before any offer that depends on rental income we verify the "
            "specific property's position with the relevant jurisdiction. And winter access deserves "
            "the same scrutiny as anywhere at elevation: plowing, driveway grade and aspect, and what "
            "a Berthoud Pass closure does to your drive. These are showing-day questions, and I ask "
            "them so you don't learn them in January.",
            "One Broker, Both Ends Of The Move",
            "As with all my mountain buyers, the purchase usually pairs with a Front Range sale or "
            "refinance. I sequence both — honest valuation on what you own, [the buy-before-you-sell "
            "toolbox](/blog/bridge-loans-helocs-more-creative-ways-to-buy-before-you-sell.html) laid "
            "out plainly, and one timeline that protects you on both sides. Start the conversation "
            "with what you want the mountain place to do for your family, and we work backward from "
            "there.",
        ],
        "faq": [
            ("Can Christine represent buyers in Winter Park and Grand County?",
             "Yes — Colorado licenses are statewide. She represents buyers throughout Grand County, "
             "working directly with listing brokers there, alongside the Front Range sale that often "
             "funds the purchase."),
            ("Winter Park or Granby — how do I choose?",
             "By how you'll use it: Winter Park and Fraser for ski-centered living, Granby and Grand "
             "Lake for golf, water and year-round town life at friendlier prices, Tabernash in "
             "between. Christine helps buyers test the choice against real weekend patterns, not the "
             "brochure."),
            ("Can I rent out a Grand County property short-term?",
             "The rules differ between the towns and unincorporated Grand County and change by "
             "ordinance, so it depends on the specific property. Christine verifies its position with "
             "the relevant jurisdiction before her buyers write an offer that depends on rental "
             "income."),
        ],
    },
]


def build_money_pages(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    for pg in MONEY_PAGES + RESORT_PAGES:
        path = _p(pg["slug"])
        resort = pg in RESORT_PAGES
        faq_html, faq_schema = B._faq_block(pg["faq"])
        if resort:
            search_html = f"""<div class="collection-search">
      <div class="btn-row" style="justify-content:flex-start">
        <a class="btn btn-dark" href="{REALSCOUT_SEARCH_URL}" target="_blank" rel="noopener">Search Mountain Listings With {esc(first)} &rsaquo;</a>
        <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="#start">Ask {esc(first)} Directly</a>
      </div>
      <p class="search-note">{esc(RESORT_NOTE)}</p>
    </div>"""
            search_heading = "Searching The Resort Market"
        else:
            search_html = _search_block(B, pg["search"], pg["search_label"], pg.get("search_note"))
            search_heading = pg["search_label"].replace("Search ", "", 1)
        videos_html, vids = "", [v for v, _ in pg.get("videos", [])]
        if vids:
            cols = 2 if len(vids) <= 2 else 3
            cards = "\n      ".join(_video_card(B, v, cap) for v, cap in pg["videos"])
            videos_html = f"""
<section class="tight">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">From {esc(first)}'s Channel</span>
    <h2 class="section-title">{pg.get("videos_heading", "On Video")}</h2>
    <div class="video-grid" style="grid-template-columns:repeat({cols},1fr)">
      {cards}
    </div>
  </div>
</section>
"""
        if resort:
            form = _form_section(
                B, "signature-resort-buyer-inquiry", f"Talk To {first} About The Mountains",
                "Tell her the town, what the place is for, and what you would sell on the Front Range "
                "to fund it. She answers these herself, usually the same day.",
                "Start The Conversation",
                MESSAGE_FIELD.format("Which town, and what is the place for? (optional)"))
        else:
            form = _form_section(
                B, "signature-buyers-inquiry", f"Tell {first} What You Are Looking For",
                "Price range, must-haves, timeline, and whether you have a home to sell first. "
                f"{esc(first)} follows up personally, usually within one business day.",
                "Get Matched With Homes",
                MESSAGE_FIELD.format("What are you looking for? (optional)"))
        body = f"""
<section class="hero" style="padding:90px 0 60px">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">{pg["eyebrow"]}</span>
    <h1>{esc(pg["h1"])}</h1>
    <p class="lede">{esc(pg["intro"])}</p>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">Search</span>
    <h2 class="section-title">{esc(search_heading)}</h2>
    {search_html}
  </div>
</section>
{videos_html}
<section>
  <div class="wrap" style="max-width:780px">
    {_paras_html(B, pg["paragraphs"])}
    <div class="btn-row" style="justify-content:flex-start;margin-top:40px">
      <a class="btn btn-dark" href="#start">Talk To {esc(first)}</a>
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="{B.COLLECTION_HUB}">The Collection</a>
    </div>
  </div>
</section>
{faq_html}
{form}
{_markets_row(B, path)}
"""
        schema = [faq_schema] + _video_schema(B, vids)
        if pg["slug"] == "loveland-luxury-homes":
            schema.append(_playlist_schema(B))
        _page(B, pg["title"], pg["meta"], path, body, schema)


# ---------------------------------------------------------------- BUYERS ---
BUYERS_FAQ = [
    ("What counts as a luxury home in Northern Colorado?",
     "There is no official line, and anyone who quotes you one precisely is guessing. In practice the "
     "luxury tier starts around $750,000 in Fort Collins, Timnath and Windsor, and nearer $600,000 in "
     "Loveland and Greeley — and above roughly $1M you are in a genuinely different market with fewer "
     "buyers, longer timelines and more negotiating room than the headlines suggest. The Collection's "
     "searches start at $950,000. Acreage and foothills property price on land and views rather than "
     "square footage, so it does not map onto those numbers at all."),
    ("Who pays my agent when I buy a home?",
     "It is negotiated, and it is worth asking about early rather than assuming. Since the industry "
     "rule changes of 2024, buyer-agent compensation is no longer advertised through the MLS and is "
     "agreed in writing between you and your agent before you tour homes — the seller may still "
     "contribute, but that is a term of the deal rather than a given. Christine will put the actual "
     "numbers for your situation in front of you before you sign anything, not after."),
    ("Can I buy a home here before I move to Colorado?",
     "Yes, and many buyers here do. The workable version is a scouting trip to choose the town, then a "
     "focused touring trip, with honest video walkthroughs in between. What you should not do is waive "
     "an inspection to win a bidding war on a house you have only seen on a screen. The free Northern "
     "Colorado Relocation Guide covers the whole sequence."),
    ("What should I know about metro districts and HOA dues in new construction?",
     "This is the most common unpleasant surprise in new builds here, especially in Weld County. Many "
     "master-planned neighbourhoods sit inside a metropolitan district that adds a mill levy to your "
     "property tax to repay infrastructure bonds, on top of any HOA dues — so two similar houses in two "
     "neighbourhoods can carry very different annual costs. It is disclosed and legal, and easy to miss. "
     "Ask for the mill levy and the district's debt service, and read them next to the HOA budget."),
    ("Is buying acreage with a well and septic a bad idea?",
     "No, but it is a different diligence list. Well permits limit what you may use the water for — a "
     "household-use-only permit does not cover irrigating pasture or watering livestock — and septic "
     "systems generally need an inspection when a property changes hands, with a failure running into "
     "five figures. Both are manageable when you know before you are under contract, which is the entire "
     "point of asking early."),
    ("Where do I search the listings?",
     "The search buttons on these pages open Christine's home-search site with the filters already set, "
     "from $950,000 unless you choose another minimum. Her own current listings, with their video tours, "
     "are on this site. For anything a search cannot filter — horse facilities, true river frontage, a "
     "specific street — ask her, and she will pull the list herself."),
]


def build_buyers(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    body = f"""
<section class="hero" style="padding:100px 0 70px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Buying In The Collection</span>
    <h1>Buying An Estate Home In Northern Colorado</h1>
    <p class="lede">Estate homes, acreage, and architecturally significant properties across Larimer,
    Weld and Boulder County &mdash; represented by a RealTrends-verified agent whose focus is Northern
    Colorado&rsquo;s luxury and acreage tier.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="#start">Request A Private Search</a>
      <a class="btn btn-outline" href="{_p('concierge-experience')}">See The Concierge Experience &rarr;</a>
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <span class="eyebrow">Who {esc(first)} Represents</span>
    <h2 class="section-title">Four Kinds Of Luxury Buyer, One Approach</h2>
    <p class="lede">A luxury search is not one profile. Most buyers at this level fall into one of four
    situations &mdash; the approach adjusts to yours.</p>
    <div class="grid-2" style="gap:32px">
      <div class="card"><h3>Executive Relocation</h3><p>Corporate relocation packages, jumbo lender
      coordination, and a search that stays quiet until you decide it should not. The
      <a href="/relocation.html">relocation page</a> walks through the full process.</p></div>
      <div class="card"><h3>Out-Of-State &amp; Remote</h3><p>Live video walkthroughs on the property and
      through the neighborhood, remote writing and negotiating, and a full inspection package waiting
      when you arrive.</p></div>
      <div class="card"><h3>Land, Acreage &amp; Water Rights</h3><p>Well permits, augmentation plans,
      ditch-company rules, septic diligence &mdash; the specialist work rural and equestrian properties
      in Larimer and Weld County need before an offer.</p></div>
      <div class="card"><h3>Private &amp; Discreet</h3><p>For buyers who need the search itself to stay
      confidential &mdash; off-market homes when they exist, and showings that never appear on a public
      calendar.</p></div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">The Process</span>
    <h2 class="section-title">Six Steps From Introduction To Keys</h2>
    <div class="grid-3">
      <div class="card"><h3>01 &middot; Confidential Consultation</h3><p>What you are looking for, what
      needs to stay private, and what timeline the search actually has.</p></div>
      <div class="card"><h3>02 &middot; Jumbo &amp; Private-Bank Pre-Approval</h3><p>Introductions to
      local jumbo lenders who write in the estate tier regularly, if you do not already have one.</p></div>
      <div class="card"><h3>03 &middot; Beyond The Public Search</h3><p>Pre-market and off-market homes
      when they exist, through {esc(first)}&rsquo;s broker network, alongside every public IRES
      listing.</p></div>
      <div class="card"><h3>04 &middot; Private Showings</h3><p>Live virtual tours for out-of-state
      buyers, and in-person showings scheduled around the property &mdash; not the other way
      around.</p></div>
      <div class="card"><h3>05 &middot; Diligence &amp; Discreet Negotiation</h3><p>Well and septic
      inspection, radon, wildfire and insurance review, and an offer written with the leverage the
      market actually gives you.</p></div>
      <div class="card"><h3>06 &middot; Concierge Close</h3><p>Final walkthrough, closing, and local
      introductions on your terms once you have the keys.</p></div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Search</span>
    <h2 class="section-title">Northern Colorado Homes From $950K</h2>
    {_search_block(B, {}, "Search Homes From $950K")}
  </div>
</section>
{_form_section(B, "signature-buyers-inquiry", "Ready To Start Your Search?",
    f"Tell {esc(first)} what you&rsquo;re looking for &mdash; price range, must-haves, timeline &mdash; "
    "and she will follow up personally, usually within one business day.",
    "Get Matched With Homes", MESSAGE_FIELD.format("What are you looking for? (optional)"))}
"""
    faq_html, faq_schema = B._faq_block(BUYERS_FAQ)
    _page(B, "Buying A Luxury Home In Northern Colorado | Signature Collection",
          "Buy an estate home, acreage or architecturally significant property from $950K in Loveland, "
          "Fort Collins, Windsor, Berthoud or across the Larimer, Weld and Boulder County Front Range.",
          _p("buyers"), body + faq_html, [faq_schema])


# --------------------------------------------------------------- SELLERS ---
SELLERS_FAQ = [
    ("How is a luxury listing marketed differently from a standard one?",
     "The audience is smaller and more deliberate, so the marketing has to reach the right thirty people "
     "rather than the closest three hundred. That means editorial photography and cinematic video shot for "
     "the home specifically, printed brochures and a luxury magazine placement, targeted outreach through "
     "the luxury broker network, and private showings by appointment instead of open-house foot traffic. "
     "The public MLS listing is the last step, not the first."),
    ("Will my listing be kept discreet if we ask for that?",
     "Yes. Some sellers want the full public launch — syndication, open house, every portal. Others want "
     "the property shown quietly, by appointment, to a short list of buyers before anything appears "
     "online. Both work at this level, and the lane is set at the strategy meeting, before a single photo "
     "is taken."),
    ("What is the Platinum marketing package, and is it standard?",
     "Platinum is the Collection's standard — not an upgrade you have to ask for. It includes editorial "
     "photography, drone imagery, property naming when appropriate, professional staging where needed, a "
     "printed luxury brochure and magazine placement, a pre-listing inspection, billboards, targeted luxury "
     "buyer outreach, a broker event, private showings by appointment, and concierge-level service through "
     "closing. Every Collection listing at $900,000 and above gets it."),
    ("How long does a luxury home usually take to sell in Northern Colorado?",
     "Longer than a mid-market home, and that is normal rather than a warning. In the $1M+ tier the "
     "qualified buyer pool is a fraction of the size, and those buyers take their time — they tour, they "
     "think, they come back. Precision on price at launch is what decides whether a luxury home trades "
     "inside sixty days or sits for six months."),
    ("Is a pre-listing inspection worth it on a luxury home?",
     "On a home at this price, almost always. A pre-inspection is included in the Platinum package for a "
     "reason — it moves the discovery of any real issue from the middle of your contract, where it becomes "
     "a renegotiation you are losing, to before the property goes live, where it is a repair you chose to "
     "make on your timeline."),
]
# Christine's "Selected Property Results" (the Signature Listing Strategy
# brochure). Only the sales that are also on her own sold list
# (build/data/sold_homes.json) are shown: the brochure was the duo's, and two of
# its four results -- 50842 County Road 33, Nunn, and the buyer side of 9522
# Yucca Way, Arvada -- are not on it. Add them back here once she confirms they
# were hers.
RESULTS = [
    ("3016 Glendevey Drive", "Loveland (Olde Course)", "$599,999", "February 2026",
     "4 bed | 1,928 sq ft", "Closed in 21 days. Both sides represented — buyer sourced through Christine's community network."),
    ("913 Green Mountain Drive", "Erie, Colorado", "$1,200,000", "September 2025",
     "6 bed | 6 bath | 7,096 sq ft", "Erie's top-tier luxury market — positioned, marketed, and closed."),
]


def build_sellers(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    package = ["Editorial-quality photography (30&ndash;40 images) &amp; drone imagery",
               "Cinematic listing video shot on the property",
               "Property naming, when the home warrants it",
               "Full professional staging, where needed",
               "Printed luxury brochure &amp; magazine placement",
               "Pre-listing inspection",
               "Billboards on high-traffic Northern Colorado corridors",
               "Targeted luxury broker &amp; buyer outreach",
               "Private broker event on the property",
               "Private showings by appointment",
               "Concierge-level service through closing",
               "The Collection&rsquo;s print and digital branding"]
    package_html = "\n      ".join(f'<div class="card"><h3>{x}</h3></div>' for x in package)
    results_html = "\n      ".join(
        f"""<div class="card"><h3>{esc(addr)}</h3><p style="color:var(--dusty-rose);font-weight:600;margin-bottom:4px">{esc(loc)}</p>
        <p>Sold: {esc(price)} &middot; {esc(when)}<br>{esc(spec)}<br>{esc(strategy)}</p></div>"""
        for addr, loc, price, when, spec, strategy in RESULTS)
    body = f"""
<section class="hero" style="padding:100px 0 70px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Selling In The Collection</span>
    <h1>Selling An Estate Home In Northern Colorado</h1>
    <p class="lede">A quieter, more deliberate launch &mdash; editorial photography, a printed brochure and
    luxury magazine placement, private showings by appointment, and a marketing plan built for the buyer
    pool a $1M+ home actually sells to.</p>
    <div class="btn-row"><a class="btn btn-primary" href="#start">Request A Confidential Valuation</a></div>
  </div>
</section>
<section>
  <div class="wrap">
    <span class="eyebrow">One Agent, Start To Finish</span>
    <h2 class="section-title">{esc(B.SITE['agent'])}, On Your Property</h2>
    <p class="lede">Every Collection listing is handled by {esc(first)} herself &mdash; not handed to an
    assistant or a rotating team &mdash; from the pricing conversation to the closing table.</p>
    <div class="grid-2" style="gap:40px;align-items:stretch">
      <div class="card"><h3>Editorial Photography &amp; Video</h3><p>Museum-quality stills (30&ndash;40
      images), cinematic video, and drone shot for your home specifically &mdash; not a template applied
      to it.</p></div>
      <div class="card"><h3>Printed Brochure &amp; Luxury Magazine</h3><p>A physical brochure that
      photographs and reads at the level of the home, plus placement in a luxury magazine reaching the
      buyer pool that actually transacts at this tier.</p></div>
      <div class="card"><h3>Private Showings By Appointment</h3><p>Qualified buyers, shown quietly. Open
      houses only when they serve the strategy for the specific property &mdash; not because it is the
      default.</p></div>
      <div class="card"><h3>Pre-Inspection &amp; Property Naming</h3><p>A pre-listing inspection is
      standard, not an upgrade, and where the home warrants it the property gets a name that carries into
      the marketing.</p></div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">The Platinum Standard</span>
    <h2 class="section-title">What Every Collection Listing Includes</h2>
    <p class="lede">Platinum is the default for every Collection listing at $900,000 and above &mdash;
    not an upgraded package you have to negotiate into. Everything below is included:</p>
    <div class="grid-3" style="gap:24px">
      {package_html}
    </div>
    <p class="lede" style="margin-top:24px;font-size:.9em"><em>Packages are for Listing Brokerage and
    Listing Agent Fee Only.</em></p>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Specific Results Matter</span>
    <h2 class="section-title">Selected Property Results</h2>
    <div class="grid-2" style="gap:32px">
      {results_html}
    </div>
    <div class="btn-row" style="justify-content:flex-start;margin-top:32px">
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="{_p('luxury-home-tours')}">See The Listing Videos &rarr;</a>
    </div>
  </div>
</section>
{_form_section(B, "signature-sellers-inquiry", "What's Your Home Worth?",
    f"A confidential, no-obligation valuation from {esc(B.SITE['agent'])} &mdash; grounded in real "
    "comparable sales, not an automated estimate.", "Get My Confidential Valuation", ADDRESS_FIELD)}
<section class="tight">
  <div class="wrap center">
    <span class="eyebrow" style="color:var(--dusty-rose)">Before You Pick An Agent</span>
    <h2 class="section-title">See What Your Neighborhood Is Already Worth To You</h2>
    <p class="lede">Every agent says they will market your home. This shows you, with real numbers, how
    many people have already watched or read {esc(B.SITE['agent'])}'s content about your town.</p>
    <div class="btn-row">
      <a class="btn btn-dark" href="/seller-local-proof.html">Show Me My Local Proof &rarr;</a>
    </div>
  </div>
</section>
"""
    faq_html, faq_schema = B._faq_block(SELLERS_FAQ)
    _page(B, "Selling A Luxury Home In Northern Colorado | Signature Collection",
          "Sell an estate home or luxury property in Loveland, Fort Collins, Windsor or across the "
          "Larimer, Weld and Boulder County Front Range, with cinematic marketing built for the $1M+ "
          "buyer.", _p("sellers"), body + faq_html, [faq_schema])


# ------------------------------------------------------------- CONCIERGE ---
def build_concierge(B):
    esc = B.esc
    body = f"""
<section class="hero" style="padding:100px 0 70px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">White-Glove, By Design</span>
    <h1>The Concierge Experience</h1>
    <p class="lede">Estate homes, acreage, and architecturally significant properties deserve a process
    built for them &mdash; not a generic transaction. Here's what that actually looks like.</p>
  </div>
</section>
<section>
  <div class="wrap">
    <span class="eyebrow">What Sets It Apart</span>
    <h2 class="section-title">Three Things Every Client Gets</h2>
    <div class="grid-3">
      <div class="card">
        <h3>Private Showings &amp; Off-Market Access</h3>
        <p>A focused, private search &mdash; including off-market and pre-public homes when they exist
        &mdash; instead of the same public listings every buyer sees on Zillow.</p>
      </div>
      <div class="card">
        <h3>Luxury Marketing &amp; Staging</h3>
        <p>Cinematic video, drone footage, and print campaigns built for $1M+ listings, paired with
        professional staging so the home photographs the way it actually lives.</p>
      </div>
      <div class="card">
        <h3>One Point Of Contact</h3>
        <p>Relocation and out-of-state logistics, trusted local vendors, and a single person &mdash; not a
        rotating cast &mdash; from first call to closing.</p>
      </div>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">The Process</span>
    <h2 class="section-title">What Working Together Looks Like</h2>
    <div class="grid-3">
      <div class="card"><h3>01 &middot; Discovery</h3><p>A real conversation about what you're looking for
      (or what your home is worth) &mdash; no cookie-cutter questionnaire.</p></div>
      <div class="card"><h3>02 &middot; Strategy</h3><p>Pricing, positioning, and marketing built around
      your specific property or search, informed by Certified Negotiation Specialist and Luxury Home
      Marketing Expert training.</p></div>
      <div class="card"><h3>03 &middot; Showings &amp; Offers</h3><p>Private tours or showings, and a
      well-crafted offer or listing strategy &mdash; including VA loan expertise for veteran buyers.</p></div>
      <div class="card"><h3>04 &middot; Negotiation</h3><p>Earnest money, inspection, and negotiation
      handled directly &mdash; not handed off.</p></div>
      <div class="card"><h3>05 &middot; Closing</h3><p>Radon testing, final walkthrough, and a coordinated
      path to closing day.</p></div>
      <div class="card"><h3>06 &middot; After The Close</h3><p>The relationship doesn't end at closing
      &mdash; ask any of the clients in the reviews.</p></div>
    </div>
    <div class="btn-row" style="justify-content:flex-start;margin-top:36px">
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/press-recognition.html">See The Credentials Behind It &rarr;</a>
    </div>
  </div>
</section>
{_form_section(B, "signature-concierge-inquiry", "Start The Conversation",
    f"Tell {esc(B.SITE['agent'].split()[0])} what you are looking for, or what your home is worth to "
    "you. She answers these herself, usually the same day.", "Start The Conversation",
    MESSAGE_FIELD.format("Tell Christine what you are looking for (optional)"))}
"""
    _page(B, "The Concierge Experience | Signature Collection",
          f"What working with {B.SITE['agent']} actually looks like — private showings, off-market "
          f"access when it exists, luxury marketing, and a single point of contact from first call to "
          f"closing.", _p("concierge-experience"), body)


# ------------------------------------------------------------ $1M MARKET ---
def build_luxury_market(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    buyers = [
        ("Relocating from Denver, Boulder, or out of state",
         "The single most common call I get at this price. Someone sells in Boulder or Denver, looks at "
         "what the same money buys an hour north, and realizes it's a different house entirely — more "
         "land, newer build, mountain views, and a commute they actually chose. They are rarely in a hurry "
         "and almost always doing it for the lifestyle rather than the spreadsheet."),
        ("Move-up buyers using equity from their first Northern Colorado home",
         "People who bought here years ago, watched their equity build, and are now trading up rather than "
         "leaving. They know the towns already, so the conversation is about specific streets and specific "
         "builders, not an introduction to the region."),
        ("Acreage, horse, and ranch buyers",
         "Land is the whole point for this group — fenced pasture, an arena, outbuildings, water, and the "
         "room to keep animals. What they want sits outside town limits, which means well and septic, "
         "access, zoning, and water rights matter as much as the house does. This is the part of the market "
         "with the fewest agents who genuinely know it."),
        ("Buyers who want new construction in a premier community",
         "Golf-course and lakefront communities, and the master-planned neighborhoods around Centerra and "
         "Windsor. They want finish quality and amenities without a renovation, and they need someone who "
         "will read a builder contract properly before they sign it."),
        ("Privacy-first buyers",
         "Executives, physicians, and business owners who care more about a long driveway and a discreet "
         "process than about a marketing campaign. Private showings, no sign in the yard where possible, and "
         "as few people in the transaction as it can be run with."),
    ]
    sellers = [
        ("Empty nesters right-sizing and releasing equity",
         "The biggest seller group at this level, and the one where timing genuinely matters. The house did "
         "its job for twenty years, the equity in it is now a retirement asset, and the decision is financial "
         "as much as it is emotional. Most of them are not leaving Northern Colorado — they are moving four "
         "miles into something single-level with less roof to maintain."),
        ("Owners of large acreage who no longer want the upkeep",
         "Twenty acres is wonderful at fifty and a lot of work at seventy. These sales need a buyer who wants "
         "the land for what it is, which is a narrower pool and a different marketing approach than an "
         "in-town listing."),
        ("Relocating professionals and job transfers",
         "Usually on somebody else's timeline, which changes the strategy — pricing has to be right the first "
         "time because there isn't room for a long correction."),
        ("Families settling an estate or a trust",
         "Often several people in different states making one decision together, sometimes a property that "
         "hasn't been updated in decades. The work here is as much coordination and patience as it is real "
         "estate."),
        ("Sellers who tried already and didn't sell",
         "An expired luxury listing is almost never a bad house. It is usually pricing, photography, or a "
         "marketing plan built for a $400,000 home and applied to a $1.4M one."),
    ]
    searches = [
        ("&ldquo;Homes over $1,000,000&rdquo; and &ldquo;luxury homes for sale&rdquo; in a specific town",
         "Search by price the way you actually think about it — this search starts at your number, so "
         "you'll see everything above it.", _search_href({"minPrice": "1000000"})),
        ("&ldquo;Horse property&rdquo; and &ldquo;acreage for sale&rdquo;",
         "This is the highest-intent search in Northern Colorado and the one generic sites handle worst, "
         "because acreage doesn't reduce to beds and baths. Ask me about a specific parcel and you'll get "
         "water, zoning, and access, not a photo gallery.", _p("northern-colorado-horse-property")),
        ("&ldquo;Real estate agent who negotiates well&rdquo;",
         "A fair thing to look for, and hard to verify from a website. I'm a Certified Real Estate "
         "Negotiator (CREN), and the more useful proof is the track record and what past sellers said "
         "about how their deal was handled.", "/testimonials.html"),
        ("&ldquo;What is my home worth&rdquo; at the top of the market",
         "Automated estimates are least reliable exactly where homes are most unusual — custom builds and "
         "acreage are what they get most wrong. At this price the number needs a person who has walked "
         "comparable properties.", _p("sellers") + "#start"),
        ("&ldquo;Homes with a view&rdquo;, &ldquo;lakefront&rdquo;, and &ldquo;golf course homes&rdquo;",
         "Lifestyle-first searches, and the ones where local knowledge shows up fastest — which streets "
         "actually hold the mountain view, and which back to a fairway you'd rather not back to.",
         _p("northern-colorado-golf-course-homes")),
    ]

    def block(items):
        return "\n".join(f'''      <div class="profile-row">
        <h3>{t}</h3>
        <p>{b}</p>
      </div>''' for t, b in items)

    search_rows = "\n".join(f'''      <div class="profile-row">
        <h3>{q}</h3>
        <p>{a} <a href="{href}" class="cta" style="display:inline-block;margin-top:6px">Start there &rarr;</a></p>
      </div>''' for q, a, href in searches)
    faq_html, faq_schema = B._faq_block([
        ("What counts as a luxury home in Northern Colorado?",
         "There is no single number, and the honest answer is that it moves by town — the line sits "
         "meaningfully lower in Greeley or Loveland than in Fort Collins or Windsor. What matters more for a "
         "buyer coming from Denver or Boulder is that $1,000,000 here is not the same house it is there: it "
         "usually means more land, a newer build, or a view that would cost double an hour south."),
        ("Who is buying homes over $1 million in Northern Colorado?",
         "Mostly people relocating from Denver, Boulder, or out of state; local move-up buyers using equity "
         "from a first home here; acreage and horse property buyers; and buyers who want new construction in "
         "a golf-course, lakefront, or master-planned community. Privacy is a recurring theme across all of "
         "them."),
        ("Who is selling homes at this price point?",
         "Most often empty nesters right-sizing and turning home equity into a retirement asset, owners of "
         "large acreage who no longer want the upkeep, relocating professionals on a set timeline, families "
         "settling an estate, and sellers whose luxury listing already expired once with another agent."),
        (f"Does {B.SITE['agent']} handle acreage and horse properties?",
         "Yes — farm, ranch, and acreage work is a specific part of the practice rather than an occasional "
         "exception, which matters because these transactions turn on well and septic, zoning, access, and "
         "water rights rather than on square footage."),
    ])
    vids = ["e-_3Qs3liQ0", "2WJPuQvlhxM", "kAr4BH8C-JA"]
    body = f"""
<section class="hero" style="padding:150px 0 110px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Over A Million</span>
    <h1>Northern Colorado Homes Over $1 Million</h1>
    <p class="lede" style="margin-left:auto;margin-right:auto">A million dollars here is not the same house
    it is in Boulder or Denver. It usually means land, or a view, or a build quality you would pay double
    for an hour south. Here is who is buying at this level, who is selling, and what they type into Google
    before they ever call me.</p>
    <div class="btn-row" style="justify-content:center">
      <a class="btn btn-primary" href="{esc(_search_href({'minPrice': '1000000'}))}">Search Homes Over $1M</a>
      <a class="btn btn-outline" href="#start">Talk To {esc(first)}</a>
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">The Buyers</span>
    <h2 class="section-title">Who Is Buying At This Price</h2>
    <p class="lede">Five groups, and they want genuinely different things. Knowing which one you are is
    most of what makes the search efficient.</p>
    <div class="profile-list">
{block(buyers)}
    </div>
  </div>
</section>

<section class="section-dark tight">
  <div class="wrap">
    <span class="eyebrow">The Sellers</span>
    <h2 class="section-title">Who Is Selling At This Price</h2>
    <p class="lede">Almost every seller above a million is solving a problem that isn't really about the
    house. The strategy follows the problem.</p>
    <div class="profile-list profile-list-dark">
{block(sellers)}
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">The Searches</span>
    <h2 class="section-title">What People Actually Search For</h2>
    <p class="lede">These are the searches that bring people to a page like this one, and what I'd tell
    you about each if you asked me directly.</p>
    <div class="profile-list">
{search_rows}
    </div>
  </div>
</section>

<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">Acreage &amp; Equestrian</span>
    <h2 class="section-title">The Land Market, In Numbers</h2>
    <p class="lede">Equestrian and acreage property is where this market gets specific. As a rough sense of
    scale: equestrian listings around Fort Collins have recently averaged about 24 acres, with a median
    asking price near $1.28M and an average closer to $1.57M
    <span class="fine-note">(aggregated listing data, LandSearch, August 2026 &mdash; a snapshot of what is
    listed, not what closed)</span>. Land pricing swings hard on water, zoning, and access, so treat any
    average as a starting point and ask about the actual parcel.</p>
    <div class="btn-row" style="justify-content:flex-start">
      <a class="btn btn-dark" href="#start">Ask About A Parcel</a>
      <a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/sold-homes-map.html">See The Track Record</a>
    </div>
  </div>
</section>

{faq_html}

<section class="tight section-dark">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">From {esc(first)}'s Channel</span>
    <h2 class="section-title" style="color:#fff">The Luxury Market, On Video</h2>
    <p class="lede" style="color:#e8e5e0;max-width:780px">A cross-section of the $1M+ market across
    Northern Colorado: a small-town estate, a golf-course home, and a Weld County acreage tour — three
    distinct slices of the same tier, filmed by {esc(first)}.</p>
    <div class="video-grid" style="margin-top:24px">
      {_video_card(B, "e-_3Qs3liQ0", "A $1.35M home in a small Northern Colorado town, toured top to bottom.", dark=True)}
      {_video_card(B, "2WJPuQvlhxM", "The Olde Course — what golf-course luxury looks like in Loveland.", dark=True)}
      {_video_card(B, "kAr4BH8C-JA", "Weld County acreage — 4,200 sq ft on 4+ acres in Nunn.", dark=True)}
    </div>
    <div class="btn-row" style="margin-top:28px">
      <a class="btn" style="background:#E57373;color:#141415" href="{_p('luxury-home-tours')}">See Every Luxury Tour &rsaquo;</a>
      <a class="btn btn-outline" style="border-color:#e8e5e0;color:#e8e5e0" href="{B.LUXURY_PLAYLIST_URL}"
         target="_blank" rel="noopener">Watch On YouTube</a>
    </div>
  </div>
</section>
{_form_section(B, "signature-luxury-market", "Start A Private Conversation",
    "Whether you are two years out or two weeks out. Nothing here is a hard sell, and I would rather tell "
    "you to wait than list something that isn't ready.", "Start A Private Conversation",
    MESSAGE_FIELD.format("Buying, selling, or both? (optional)"))}
"""
    _page(B, "Northern Colorado Homes Over $1 Million | Signature Collection",
          f"Who buys and who sells homes over $1 million in Northern Colorado, what they search for, and "
          f"how {B.SITE['agent']} handles luxury, acreage, and equestrian property across Larimer, Weld, and "
          f"Boulder counties.", _p("luxury-market"), body,
          [faq_schema, _playlist_schema(B)] + _video_schema(B, vids))


# ------------------------------------------------------------ HOME TOURS ---
def build_luxury_home_tours(B):
    """Signature's build_luxury_home_tours() (2026-08-23), on the site's own
    components instead of a page-specific stylesheet, and with the playlist as a
    link rather than a live player (click-to-play everywhere)."""
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    groups = [
        ("Christine's Luxury Listings",
         "Homes Christine represented, filmed at listing time and presented the way buyers want to see them "
         "before they schedule a showing.",
         [("e-_3Qs3liQ0", "A $1.35M home in a small Northern Colorado town, toured top to bottom."),
          ("PxB2iHNqT74", "Filmed for the buyer who wants to see the full space before flying in."),
          ("dqPsEqR55Wk", "An address-specific tour — the kind of video buyers watch three times before "
                          "scheduling a showing."),
          ("K2XYDr2cgYU", "Christine walks through the finishes, layout, and lot decisions that separate a "
                          "$700K home from a luxury one.")]),
        ("Featured Property Tours",
         "Homes filmed for context — what a specific price band, layout, or community actually looks like in "
         "Northern Colorado.",
         [("2WJPuQvlhxM", "The Olde Course, Loveland — golf-course living from the back patio."),
          ("Dr5RN8_VfbU", "A single-level ranch on acreage — the layout most Northern Colorado luxury buyers "
                          "ask for by name."),
          ("kAr4BH8C-JA", "The acreage tour that shows what room to breathe looks like north of Fort Collins."),
          ("-i3DOTQ5zN4", "An open-house walkthrough in MillCreek, filmed the day of the event.")]),
        ("The Northern Colorado Lifestyle",
         "The towns, trails, and reasons people move here — the context that makes the property tours make "
         "sense to a buyer coming in from out of state.",
         [("Jz4kQHtpfzM", "Community context for the golf-course tour — the neighborhood behind the property."),
          ("JFfx8G9OxP0", "The town-scale story behind the Erie tours."),
          ("YvIPzWebofA", "The amenities luxury buyers actually use, not just the ones on brochures."),
          ("nqPzw2QUjzA", "Christine's own 'why here' story, filmed on location."),
          ("2mr0--sAM7s", "The trailhead every Loveland buyer eventually asks about."),
          ("2jNGXw5lzAM", "Why Christine left Loveland, and why she came back.")]),
    ]
    sections, vids = [], []
    for i, (heading, blurb, items) in enumerate(groups):
        vids += [v for v, _ in items]
        dark = i == 1
        cards = "\n      ".join(_video_card(B, v, cap, dark=dark) for v, cap in items)
        sections.append(f"""
<section class="tight{' section-dark' if dark else ''}">
  <div class="wrap">
    <h2 class="section-title"{' style="color:#fff"' if dark else ''}>{esc(heading)}</h2>
    <p class="lede"{' style="color:#e8e5e0"' if dark else ''}>{esc(blurb)}</p>
    <div class="video-grid">
      {cards}
    </div>
  </div>
</section>""")
    tours_url = B.SITE["domain"] + _p("luxury-home-tours")
    itemlist = json.dumps({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": f"{tours_url}#itemlist",
        "name": f"Northern Colorado Luxury Home Tours by {B.SITE['agent']}",
        "description": ("Curated video portfolio of luxury home tours, community context, and lifestyle "
                        "content covering Loveland, Fort Collins, Erie, Windsor, Nunn, Berthoud, and the "
                        "Northern Colorado luxury market."),
        "numberOfItems": len(vids),
        "itemListOrder": "https://schema.org/ItemListOrderAscending",
        "url": tours_url,
        "provider": {"@id": B.COLLECTION_ID},
        "creator": {"@id": B.AGENT_ID},
        "itemListElement": [{"@type": "ListItem", "position": i, "name": VIDEOS[v],
                             "url": f"https://www.youtube.com/watch?v={v}"}
                            for i, v in enumerate(vids, start=1)],
    }, indent=None)
    body = f"""
<section class="hero" style="padding:100px 0 60px">
  <div class="wrap">
    <span class="eyebrow eyebrow-clear" style="color:var(--dusty-rose)">Video Library</span>
    <h1>Every Luxury Home Tour {esc(first)} Has Published</h1>
    <p class="lede">Real video work from {esc(B.SITE['agent'])}&rsquo;s own YouTube channel &mdash; the
    property tours, community walk-throughs, and lifestyle pieces behind the Collection. Filmed by
    {esc(first)} herself, not by a marketing agency guessing at what a Larimer or Weld County luxury buyer
    wants to see.</p>
    <div class="btn-row">
      <a class="btn btn-outline" href="{B.LUXURY_PLAYLIST_URL}" target="_blank" rel="noopener">Watch The Full Playlist On YouTube &rsaquo;</a>
    </div>
  </div>
</section>
{''.join(sections)}
{_form_section(B, "signature-sellers-inquiry", "Want A Tour Like This For Your Listing?",
    "Professional video is standard on every Collection listing &mdash; filmed by "
    f"{esc(first)} herself and published to her YouTube channel.", "Request A Listing Consultation",
    ADDRESS_FIELD)}
"""
    _page(B, "Northern Colorado Luxury Home Tours | Signature Collection",
          f"Every luxury home tour, community walk-through, and Northern Colorado lifestyle video "
          f"{B.SITE['agent']} has published — filmed by Christine herself in Loveland, Fort Collins, Erie, "
          f"Windsor, and beyond.", _p("luxury-home-tours"), body,
          [itemlist, _playlist_schema(B)] + _video_schema(B, vids))


# ---------------------------------------------------------------- GUIDES ---
GUIDES = [
    {
        # Signature's MARKET_TOPIC_PAGES entry (2026-08-14). The figures come from
        # mid-2026 reporting, now attributed and dated in the copy itself.
        "slug": "selling-a-luxury-home-northern-colorado-2026",
        "title": "Selling A Luxury Home In Northern Colorado: What The 2026 Market Actually Rewards",
        "meta": "The Northern Colorado market shifted in 2026 — what that means for pricing and marketing a "
                "luxury home in Fort Collins, Loveland, or Greeley.",
        "eyebrow": "A Seller's Guide For 2026",
        "form": ("signature-sellers-inquiry", "Start With A Real Conversation",
                 "A comp pull specific to your property, and a straight answer on price and timing.",
                 "Get My Confidential Valuation", ADDRESS_FIELD),
        "intro": "\"List it and wait\" doesn't work anymore — in every price range and every city across "
                 "Northern Colorado, according to 2026 market reporting. Inventory is up, days on market "
                 "are up, and buyers have more to compare against. For a $1M+ estate, that shift matters "
                 "even more than it does for the median home, because there are fewer truly comparable "
                 "sales to lean on and far less room for pricing to be off.",
        "paragraphs": [
            "The Market Has Genuinely Shifted",
            "As of mid-2026 market reporting (North Forty News' Northern Colorado market guide), Fort "
            "Collins single-family homes were averaging 38 days on market, up from 32 a year earlier, even "
            "as the median sale price held around $612,000. Loveland's inventory was up roughly 12% "
            "year-over-year, and Greeley's Weld County closings were still climbing — up about 4.2%. None "
            "of that means the market is soft; it means buyers, including luxury buyers, have options "
            "again and are taking their time to use them. These figures move month to month; ask for the "
            "current ones for your segment.",
            "Pricing Precision Matters More At The Top",
            "Current guidance across the region is to price within 2-3% of recent comparable sales. At the "
            "median that's a few thousand dollars of margin for error. At $1.5M, a 2-3% miss is "
            "$30,000-$45,000 — and luxury properties rarely have five clean comps sitting a mile away the "
            "way a median-priced subdivision home does. Getting the number right takes real comp analysis "
            "specific to estate homes, acreage, and architecturally distinct properties, not a generic "
            "automated valuation.",
            "Timing: Spring Still Wins, But It Doesn't Replace Pricing",
            "Spring (April through June) remains the strongest window for Northern Colorado sellers — more "
            "buyers, more competition per listing, stronger offers. Fall is a real secondary window: fewer "
            "listings competing for attention, and the buyers still shopping in September and October tend "
            "to be genuinely motivated. But the core finding holds at every price point: an accurately "
            "priced home sells in any season, while an overpriced one sits regardless of when it lists. "
            "Timing amplifies good pricing — it doesn't fix bad pricing.",
            "What Actually Moves A Luxury Listing",
            "With buyers taking more time to compare, presentation is doing more work than it used to. That "
            "means professional staging that photographs the way the home actually lives, cinematic video "
            "and drone coverage instead of a standard MLS photo set, and genuine curb appeal — all things "
            "that matter at every price point but carry outsized weight once a buyer has a dozen "
            "estate-tier listings open in other tabs. Sellers willing to offer reasonable concessions, like "
            "a rate buydown or closing cost credit, have also been seeing stronger results in the 2026 rate "
            "environment.",
            "Start With A Real Conversation, Not A Guess",
            "Every one of these numbers changes month to month, and a luxury property's correct price "
            "depends on specifics no article can capture — the lot, the finishes, what's actually closed "
            "nearby recently. The first real step is a conversation and a comp pull specific to your "
            "property, not a generic online estimate.",
        ],
        "faq": [
            ("Is it still a good time to sell a luxury home in Northern Colorado?",
             "Yes, but the market rewards precision now more than it did a year or two ago. Well-priced, "
             "well-presented homes are still selling — including well above the median — but overpriced "
             "listings are sitting longer than they used to across every price range."),
            ("How much does pricing accuracy really matter on a $1M+ home?",
             "More than it does on a median-priced home, not less. A 2-3% pricing miss is a much larger "
             "dollar amount at the luxury tier, and there are typically fewer truly comparable recent sales "
             "to price against, so accurate, property-specific comp analysis matters even more."),
        ],
    },
    {
        # Signature's "Best Luxury Real Estate Agent in Northern Colorado" (2026-08),
        # retitled (CLAUDE.md: no self-nominating "best agent" copy). The
        # evaluation checklist is kept; the self-nominating FAQ and the duo
        # figures are not.
        "slug": "how-to-choose-a-luxury-real-estate-agent",
        "title": "How To Choose A Luxury Real Estate Agent In Northern Colorado",
        "meta": "How to evaluate a luxury real estate agent in Larimer, Weld and Boulder County — the "
                "credentials you can verify, the questions to ask, and what NoCo luxury actually requires.",
        "eyebrow": "A Buyer's &amp; Seller's Guide",
        "form": ("signature-concierge-inquiry", "Ask Christine The Four Questions",
                 "Put the questions in this guide to her directly, before you decide anything.",
                 "Start The Conversation", MESSAGE_FIELD.format("What would you like to ask? (optional)")),
        "intro": "Every agent's website says they are the top luxury agent in town; almost none of them show "
                 "their work. This guide is the opposite — how to actually evaluate a luxury agent here, "
                 "which credentials can be independently verified, the questions that separate a genuine "
                 "estate specialist from a general-practice agent with a nice website, and the specific "
                 "things NoCo luxury demands that most agents have never had to handle.",
        "paragraphs": [
            "First, Know What \"Luxury\" Actually Means Here",
            "Luxury is a local threshold, not a national one. In Northern Colorado the luxury segment "
            "generally begins around $750,000 in Fort Collins and Windsor and around $600,000 in Loveland "
            "and Greeley — well below coastal definitions, and well above the regional median. That matters "
            "because an agent who calls a $450,000 sale \"luxury\" is describing a different job than the "
            "one you are hiring for.",
            "It also means the buyer pool is different. Regional wages do not, on their own, support the "
            "top of this market. Northern Colorado luxury is overwhelmingly equity-driven — buyers arriving "
            "from Boulder, Denver, California and Texas, or moving proceeds from a business sale or "
            "retirement. A luxury agent here is really an equity-transfer specialist, and should be able to "
            "talk fluently about sequencing two sales, bridge financing and contingency risk.",
            "Credentials You Can Independently Verify",
            "Most agent claims cannot be checked. A few can, and those are the ones worth weighting:",
            "RealTrends Verified is the useful one. It audits an agent's actual closed transaction sides and "
            "volume against MLS records rather than taking self-reported numbers, and publishes national "
            "percentile rankings. Christine Gwinnup is RealTrends Verified for 2025 in the top 0.5% of "
            "agents nationally. You can look that up independently.",
            "A real Colorado license, displayed. Christine's is CO License #100090441, with LPT Realty. "
            "Colorado's DORA database lets you confirm any agent's license status and disciplinary history "
            "in about a minute; it is worth the minute.",
            "Reviews on a platform the agent does not control. Christine is rated five stars on her Google "
            "Business Profile, and BBB lists her as A+ accredited. Testimonials printed on an agent's own "
            "website are marketing; reviews on Google and BBB are not.",
            "Closed volume, stated precisely. Christine has sold 150+ homes personally. Ask any agent for "
            "the figure, then ask whether it is individual or team, career or annual — the vaguer the "
            "answer, the more the number is doing work it has not earned.",
            "The Questions That Actually Separate Agents",
            "Ask how they price an estate home with no true comparables. Below about $1M there are usually "
            "enough recent sales to triangulate. Above it, especially on acreage, there often are not — and "
            "the honest answer involves adjusting from imperfect comps, reading absorption in the price "
            "band, and being candid about the range of uncertainty. An agent who answers with a confident "
            "single number is guessing.",
            "Ask what they do about wildfire insurance. In Larimer County this is now one of the most common "
            "reasons a foothills or acreage deal collapses. Carriers have non-renewed policies across the "
            "county, and a buyer who cannot obtain coverage cannot close. An agent working this market should "
            "know which carriers are still writing, what the Colorado FAIR Plan does, and how mitigation "
            "work affects both premium and timeline.",
            "Ask about wells, septic and water rights. Colorado water is governed by prior appropriation, "
            "well permits limit use in ways buyers routinely misunderstand, and septic inspection "
            "requirements vary. On rural acreage around Masonville, Berthoud or the Buckhorn corridor, this "
            "is not an edge case — it is the deal.",
            "Ask what a metro district will cost you. Newer master-planned communities around Centerra, "
            "Timnath and the Weld corridor frequently layer a metropolitan district on top of an HOA. It "
            "shows up on the tax bill, not the listing, and it can materially change a monthly payment. "
            "Competing listings in this market now advertise \"no metro district\" as a feature — which "
            "tells you buyers have learned this the hard way.",
            "Ask to see the marketing, not hear about it. Every agent says \"cinematic video\" and "
            f"\"professional photography.\" Ask to watch an actual listing video they produced and look at an "
            f"actual print piece. The gap between the claim and the artifact is usually the whole story "
            f"(Christine's are on the [luxury home tours page]({_p('luxury-home-tours')})).",
            "What Northern Colorado Luxury Specifically Requires",
            "This market is not one market. Fort Collins luxury concentrates in Fossil Lake, Harmony Club "
            "and Old Town, and behaves like a competitive suburban market. Loveland runs from Mariana "
            "Butte's golf-course and river views to the lakefront at Boyd Lake to the foothills at Namaqua "
            "Hills. Berthoud and Masonville are acreage and equestrian country, where a 40-acre parcel in "
            "Redstone Canyon has almost nothing in common with a subdivision listing three miles away. "
            "Boulder County is its own ultra-premium market with entrenched specialists.",
            "An agent who is genuinely strong in one of those is not automatically strong in the others, and "
            "the honest ones will tell you which is which.",
            "The Short Version",
            "Weight verifiable credentials over adjectives. Check the license, check RealTrends, read reviews "
            "on platforms the agent does not control, and ask for closed volume stated precisely. Then ask "
            "the four questions above — pricing without comps, wildfire insurance, water and septic, metro "
            "districts. Any agent genuinely working Northern Colorado luxury will have real answers. The "
            "rest will change the subject.",
        ],
        "faq": [
            ("What price point counts as luxury real estate in Northern Colorado?",
             "The luxury segment generally starts around $750,000 in Fort Collins and Windsor and around "
             "$600,000 in Loveland and Greeley, with the estate and acreage market extending well above $1M. "
             "Thresholds are local: what reads as luxury in Greeley is mid-market in Boulder."),
            ("How do I verify a real estate agent's credentials in Colorado?",
             "Check three sources. Colorado DORA confirms license status and any disciplinary history. "
             "RealTrends Verified audits closed transaction sides and volume against MLS records rather than "
             "self-reported figures. Google Business Profile and BBB show reviews the agent does not control. "
             "Testimonials on an agent's own website are marketing, not verification."),
            ("What should a luxury agent in Larimer County know that others might not?",
             "Four things that routinely decide deals here: pricing an estate home when there are no true "
             "comparables; wildfire insurance availability and non-renewals, which can stop a foothills "
             "purchase outright; well permits, septic requirements and Colorado's prior-appropriation water "
             "law on rural acreage; and metropolitan district taxes layered on top of HOA dues in newer "
             "master-planned communities."),
        ],
    },
]


def build_guides(B):
    esc = B.esc
    for g in GUIDES:
        faq_html, faq_schema = B._faq_block(g["faq"])
        form_name, heading, lede, button, extra = g["form"]
        body = f"""
<section class="hero" style="padding:100px 0 60px">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">{g["eyebrow"]}</span>
    <h1>{esc(g["title"])}</h1>
    <p class="lede">{esc(g["intro"])}</p>
  </div>
</section>
<section>
  <div class="wrap" style="max-width:780px">
    {_paras_html(B, g["paragraphs"])}
  </div>
</section>
{faq_html}
{_form_section(B, form_name, heading, esc(lede), button, extra)}
"""
        _page(B, g["title"], g["meta"], _p(g["slug"]), body, [faq_schema])


# --------------------------------------------------- THE BOOK LANDING PAGE ---
# The page printed books, letters and QR codes reach. About 20 luxury expired
# books, and every Expired Elite letter for a $1M+ home, send people to
# signaturepropertycollection.com/expiredlisting/ (which 301s to Signature's
# /expired-listings.html), directly or through expired-elite-finder's /api/track.
# This is its equivalent here, for phase (e)/(f) to point that address at:
# - Christine only: her phone from SITE, her name, no second agent (the printed
#   brochure carried one; this page does not), no Bold Collective sub-brand;
# - it keeps the Signature name ("The Little Lady's Signature Property
#   Collection") so it still matches the brand printed on the piece, and says so;
# - it keeps every tracking parameter a printed piece can carry. The legacy QR
#   format (expired-luxury lib/attribution.ts generateTrackingUrl) adds
#   src=book&mid=<id>&gap=<tag> plus utm_source=expiredbook, utm_campaign=
#   expiredelite, utm_medium=print. The UTMs are captured by the site's
#   attribution client like on every page; src, mid and gap go into three
#   static hidden fields of this page's form (print_source, print_mid,
#   print_gap), and are remembered for the visit, so the lead that reaches
#   Lofty says which printed piece produced it. Nothing is sent to analytics.
# - its canonical is the Signature URL for now (COLLECTION_CANONICAL_TO_SIGNATURE).
PRINT_PARAMS = (("src", "print_source"), ("mid", "print_mid"), ("gap", "print_gap"))


def build_expired_landing(B):
    esc = B.esc
    first = B.SITE["agent"].split()[0]
    digits = "".join(ch for ch in B.SITE["phone"] if ch.isdigit())
    signals = ["Strong online interest, weak showings", "Showings without second visits",
               "High traffic, zero offers", "Price reductions without conversion",
               "Agent previews without follow-up", "Extended days on market"]
    signals_html = "\n      ".join(
        f'<div class="card" style="padding:32px 28px"><span style="color:var(--dusty-rose);'
        f'font-family:var(--font-serif);font-size:15px">{i + 1:02d}</span><p style="margin:10px 0 0;'
        f'color:#3a3a3c;font-size:15.5px;line-height:1.6">{esc(s)}</p></div>'
        for i, s in enumerate(signals))
    diagnostic = "".join(f"<li>{esc(p)}</li>" for p in [
        "Competitive tier", "Absorption rate", "Psychological price thresholds",
        "Showing-to-offer ratio", "Objection themes", "Exposure gaps", "Risk positioning"])
    relaunch = "".join(f"<li>{esc(p)}</li>" for p in [
        "A short pre-market positioning window", "Professional staging and presentation review",
        "Cinematic media standards", "Strategic price-band recalibration",
        "Private agent preview sequence", "Expanded digital and YouTube distribution",
        "Structured buyer pathway control"])
    photos = "".join(
        f'<img src="/assets/img/expired/{f}.jpg" alt="{esc(a)}" loading="lazy" decoding="async" '
        f'width="600" height="400" style="width:100%;height:220px;object-fit:cover;border-radius:2px">'
        for f, a in [("farmhouse_exterior", "Northern Colorado luxury home exterior"),
                     ("living_room", "Staged luxury living room"),
                     ("kitchen_island", "Modern luxury kitchen"),
                     ("dining_living_combo", "Open-concept dining and living space"),
                     ("dining_table", "Styled luxury dining room"),
                     ("kitchen_bar", "Custom kitchen bar detail")])
    hidden = "".join(f'<input type="hidden" name="{field}" value="">' for _, field in PRINT_PARAMS)
    keep_params = json.dumps({q: f for q, f in PRINT_PARAMS})
    form_html = _form_section(
        B, "signature-expired-inquiry", "Request A Confidential Second Opinion",
        f"Most listings don&rsquo;t fail loudly. They fade quietly. If a private second opinion on your "
        f"property would be valuable, {esc(first)} will review it herself &mdash; no pressure, just "
        f'clarity. Prefer to talk? Call or text <a href="tel:+1{digits}" data-contact="call">'
        f"{esc(B.SITE['phone'])}</a>.",
        "Request My Second Opinion", ADDRESS_FIELD + hidden, anchor="relaunch")
    body = f"""
<section class="hero" style="padding:110px 0 80px;background-image:linear-gradient(rgba(20,20,21,.6),rgba(20,20,21,.6)),url('/assets/img/expired/pine_mountain_hero.jpg');background-size:cover;background-position:center">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">A Private Advisory</span>
    <h1 style="color:var(--white)">When A Luxury Home Deserves<br>A Second Strategy</h1>
    <p class="lede" style="color:rgba(255,255,255,.88)">When a luxury listing expires, it&rsquo;s rarely
    the market &mdash; it&rsquo;s the marketing. {esc(B.SITE['agent'])} runs a relaunch program for a
    limited number of Northern Colorado luxury homes each year: positioning, pricing, and distribution
    rebuilt from the ground up to reach the buyers who are actually in the market for a home like
    yours.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="#relaunch">Request A Confidential Second Opinion</a>
      <a class="btn btn-outline" href="tel:+1{digits}" data-contact="call">Call {esc(first)}: {esc(B.SITE['phone'])}</a>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap" style="max-width:760px">
    <p class="lede">If a printed book or letter from Signature Property Collection brought you here, this is
    the same program: {esc(first)}&rsquo;s relaunch advisory, now part of {esc(B.COLLECTION_NAME)} at
    {esc(B.SITE['name'])}. Same agent, same number, same confidential first conversation.</p>
  </div>
</section>
<section class="section-dark tight">
  <div class="wrap" style="max-width:760px">
    <span class="eyebrow">A More Useful Way To Look At It</span>
    <h2 class="section-title">An Unsold Listing Is Data</h2>
    <p class="lede">An unsold listing is not failure. It is feedback. The market responded &mdash; before
    recommending a relaunch, {esc(first)} first diagnoses what the market was actually signaling. The
    response can be measured. Ambition leaves signals; signals reveal where leverage was softened.</p>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <span class="eyebrow" style="color:var(--dusty-rose)">What She Watches</span>
    <h2 class="section-title">The Signals Worth Reading</h2>
    <div class="grid-3" style="margin-top:36px">
      {signals_html}
    </div>
    <p class="lede" style="margin-top:32px;font-style:italic">These signals are not random. They are
    readable &mdash; and every one points toward a specific, fixable cause.</p>
  </div>
</section>
<section class="tight">
  <div class="wrap">
    <div class="grid-3" style="margin-top:0">
      {photos}
    </div>
  </div>
</section>
<section class="section-dark tight">
  <div class="wrap">
    <span class="eyebrow">Before Anything Is Recommended</span>
    <h2 class="section-title">The Signature Diagnostic</h2>
    <p class="lede">This is not a listing presentation. It is a strategic diagnostic. Before recommending a
    relaunch, {esc(first)} evaluates:</p>
    <ul style="columns:2;gap:40px;max-width:640px;margin:28px 0;padding-left:20px;line-height:2.1;color:rgba(255,255,255,.85)">
      {diagnostic}
    </ul>
  </div>
</section>
<section class="tight">
  <div class="wrap grid-3">
    <div class="card">
      <h3>Positioning Precedes Price</h3>
      <p>Positioning determines who notices, who tours, who hesitates, and who acts. When positioning is
      precise, price aligns. When positioning is unclear, price becomes resistance.</p>
    </div>
    <div class="card">
      <h3>Pricing Is Architecture</h3>
      <p>Price communicates structure: competitive inventory, buyer search thresholds, appraisal exposure,
      inspection risk, and net proceeds. The objective is leverage, not visibility alone.</p>
    </div>
    <div class="card">
      <h3>Strategic Distribution</h3>
      <p>Luxury buyers rarely discover properties by accident. They appear where a property is
      intentionally placed &mdash; cinematic property films, YouTube audience targeting, relocation
      networks, agent-to-agent introductions, and luxury publication placement.</p>
    </div>
  </div>
</section>
<section class="tight">
  <div class="wrap" style="max-width:720px">
    <span class="eyebrow" style="color:var(--dusty-rose)">Recalibration, Not Repetition</span>
    <h2 class="section-title">What Changes In A Strategic Relaunch</h2>
    <p class="lede">A relaunch is not repetition. It is recalibration. Depending on the property, this may
    include:</p>
    <ul style="columns:2;gap:40px;margin:28px 0;padding-left:20px;line-height:2.1;color:#3a3a3c">
      {relaunch}
    </ul>
    <p class="lede">Each element serves a single objective: restoring leverage before re-entry.</p>
  </div>
</section>
<section class="section-dark tight">
  <div class="wrap" style="max-width:720px">
    <h2 class="section-title">Negotiation Protects Value</h2>
    <p class="lede">Luxury negotiations are disciplined: buyer financial strength, probability of closing,
    contingency structure, timeline control, and privacy. In luxury, the strongest offer is the one that
    closes cleanly while protecting your leverage and position.</p>
  </div>
</section>
{form_html}
<script>
(function () {{
  // Printed books and letters can carry src, mid and gap (lib/attribution.ts in
  // expired-luxury). Kept for this visit and written into the form's static
  // hidden fields, so the lead in Lofty says which printed piece produced it.
  // Never sent to analytics.
  var map = {keep_params}, key = 'tll_print_params', saved = {{}};
  try {{ saved = JSON.parse(sessionStorage.getItem(key) || '{{}}') || {{}}; }} catch (e) {{}}
  var q = new URLSearchParams(location.search);
  Object.keys(map).forEach(function (p) {{
    var v = q.get(p);
    if (v) saved[p] = String(v).slice(0, 80);
  }});
  try {{ sessionStorage.setItem(key, JSON.stringify(saved)); }} catch (e) {{}}
  document.querySelectorAll('form[name="signature-expired-inquiry"]').forEach(function (form) {{
    Object.keys(map).forEach(function (p) {{
      var input = form.querySelector('input[name="' + map[p] + '"]');
      if (input && saved[p]) input.value = saved[p];
    }});
  }});
}})();
</script>
"""
    _page(B, "When A Luxury Home Deserves A Second Strategy | Signature Collection",
          f"A relaunch program for expired Northern Colorado luxury listings — {B.SITE['agent']} rebuilds "
          f"the positioning, pricing and marketing to reach the buyers actually shopping at your price.",
          _p("expired-listings"), body)


# ------------------------------------------ OLD SIGNATURE FORM NAMES (hidden) ---
# Netlify Forms only accepts a submission for a form name it found in this
# deploy's static HTML, and keeps only the fields it found there. After phase
# (f), a Signature page still open in someone's browser posts to this site (the
# domain becomes an alias). So each form name the Signature site used is
# registered here, with every field its markup sent, and each has a label in
# submission-created.js. Hidden, noindex, linked from nowhere.
OLD_SIGNATURE_FORMS = {
    # name: extra fields beyond name/email/phone (from Signature's built pages, 2026-09-30)
    "buyers-guide": [], "sellers-guide": [], "relocation-guide": [], "lifestyle-search": [],
    "buyers-page-inquiry": ["message"], "concierge-page-inquiry": ["message"], "contact": ["message"],
    "testimonials-page-inquiry": ["message"], "luxury-market": [],
    "free-home-valuation": ["address"], "sellers-page-inquiry": ["address"],
    "seller-local-proof": ["address", "local_proof_town"], "relocation": ["moving_from"],
    "listing-alert-request": ["alert_criteria", "alert_query", "message"],
    "listing-inquiry": ["inquiry_type", "listing_address", "listing_mls", "message"],
    "neighborhood-quiz": ["quiz_answers", "quiz_match"],
}


def build_form_definitions(B):
    forms = []
    for name, extra in sorted(OLD_SIGNATURE_FORMS.items()):
        fields = "".join(f'<input type="hidden" name="{f}" aria-label="{f}">' for f in extra)
        forms.append(B._tool_lead_form(name, "Send", fields))
    body = f"""
<section class="tight">
  <div class="wrap" style="max-width:720px">
    <h1 class="section-title">Form Definitions</h1>
    <p class="lede">This page is not meant to be visited. It registers the form names of the retired
    Signature Property Collection website, so a form sent from one of its pages still reaches
    {B.esc(B.SITE['agent'])}. To get in touch, use the <a href="/contact.html">contact page</a>.</p>
  </div>
</section>
<div hidden>
{''.join(forms)}
</div>
"""
    B.page("Form Definitions", "Form definitions for the retired Signature Property Collection site.",
           f"{DIR}/form-definitions.html", None, body)
