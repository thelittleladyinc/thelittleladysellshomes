# Signature move, part 1: the backend functions (off until switched on)

Written 2026-09-30. Christine is retiring Signature Property Collection as a
separate site; everything moves into The Little Lady Sells Homes, and the luxury
tier becomes "The Little Lady's Signature Property Collection" (part 2 builds
those pages). This part moves the **backend**: every function this site used to
pass through to on signaturepropertycollection.com now also lives here, under the
same name.

**Merging it changes nothing a visitor sees.** Each moved function keeps passing
the request through to Signature, exactly as before, until the switch below is
turned on. This document lists the settings the site needs, the exact switch-on
steps with checks and rollback, and what still lives on Signature afterwards.

---

## 1. What moved, and how it decides where to answer

| Function (same name as on Signature) | What it serves here | Needs, to answer here |
|---|---|---|
| `listings-search` | her listings on ~100 pages, current listings, the home page spotlight; public searches get a link to her Lofty search | `BLOBS_SITE_ID`, `BLOBS_TOKEN`, `IDX_DISPLAY`, Lofty listings, shared store |
| `listing-page` | `/listing/<id>` (the `netlify.toml` rule now points here) | same |
| `listing-photo` | photo links by listing id (map cards, shared links) | same |
| `my-listings-geo` | her listing pins on the explore map | same + `MAPBOX_PUBLIC_TOKEN`, `GOOGLE_MAPS_API_KEY` |
| `home-search` | `/search-homes.html` -> her Lofty search, filters kept | nothing (the switch only) |
| `nearby-places` | "What's nearby" on listing pages | `BLOBS_SITE_ID`, `BLOBS_TOKEN`, `GOOGLE_MAPS_API_KEY`, shared store |
| `walkability` | town-page walkability | same |
| `local-spots` | her filmed/reviewed spots on the maps (this site's own spot list) | `BLOBS_*`, `MAPBOX_PUBLIC_TOKEN`, `GOOGLE_MAPS_API_KEY`, shared store |
| `sold-homes-geocode` | the sold-homes map (**this site's data: no 294 Gila Trail**) | same |
| `mapbox-token` | the explore map's public token | `MAPBOX_PUBLIC_TOKEN` (a `pk.` token) |
| `site-health` | `/status` and `/site-health` (lead details redacted) | `BLOBS_*`, `LOFTY_API_KEY`, Lofty listings, shared store |
| `mls-usage` | the MLS Grid usage meter (read only) | `BLOBS_*`, shared store |
| `refresh-my-listings` | POST: refresh her Lofty listings now (at most once a minute) | `BLOBS_*`, `LOFTY_API_KEY`, Lofty listings, shared store |
| `area-alerts` | old area-alert unsubscribe links; new sign-ups get her Lofty search | `BLOBS_*`, Lofty listings, shared store |

`recent-activity` was already this site's own; it now has the same exports as
Signature's copy (the moved `/status` reads it).

A moved function **answers here only when all three are true** (the rule lives in
`netlify/functions/lib/_backend-mode.js`):

1. `BACKEND_MODE` names it: `local` for all of them, or a comma-separated list of
   function names (for example `mapbox-token,home-search`) to switch some.
   Unset, or `proxy`, means today's pass-through. A deliberate switch is required
   because this site **already** has `BLOBS_SITE_ID`, `BLOBS_TOKEN`,
   `LOFTY_API_KEY` and `GOOGLE_MAPS_API_KEY` set for other jobs.
2. The settings in the table above are present, listings come from Lofty
   (`LISTINGS_SOURCE` unset or `lofty`), and `MAPBOX_PUBLIC_TOKEN` is a `pk.` token.
3. For every function marked "shared store": the Blobs store that
   `BLOBS_SITE_ID` / `BLOBS_TOKEN` open holds her Lofty listing copy
   (`lofty-sync-state.json`). That proves `BLOBS_SITE_ID` is the **Signature**
   project, so the moved code reads the live data: one store, one MLS usage meter,
   no second crawl. Pointed at this site's own (empty) project, the function keeps
   passing through instead of showing no listings.

Anything missing: the request passes through to Signature as before, and the
function log says why once (variable names only). Every response carries an
`X-Backend: local` or `X-Backend: proxy` header, so each endpoint can be checked
with `curl -sI`. Once switched on, `/status` has a row "Backend functions
answering on this site" listing which answer here and why any do not.

### Things that are different when a function answers here

- **Listing pages** render in this site's own template, which `build.py`
  regenerates on every deploy (`write_listing_page_shell`), so they carry this
  site's **GA4 and Meta Pixel** (production builds), header and footer. Canonical
  and `og:url` are `https://www.thelittleladysellshomes.com/listing/<id>` (they were
  on the Signature domain). The Signature-rendered copy had neither tag.
- **Home-search hand-offs and listing-page search links** credit this site
  (`utm_source=thelittleladysellshomes.com`), as the pass-through already did.
- **`/status`** is this site's own page ("The Little Lady Sells Homes — Site
  Health"), reading the shared store. No lead names, emails or phones appear on it.
- **No MLS Grid calls.** The copied `listing-photo`, `listings-search` and
  `site-health` carry only their Lofty half; the MLS Grid photo resolver, the
  photo prewarm and the MLS Grid photo probe stay on Signature, and nothing is
  scheduled. The only code here that can call MLS Grid is the off-market check
  (`lib/_mls-onmarket.js`, copied from Signature's `sync-listings.js`), used by
  `refresh-my-listings` and gated exactly as on Signature: an `MLSGRID_API_TOKEN`
  **and** `MLSGRID_MARKET_DATA` not `off` (then `MLS_DISABLED` and the quota
  guard). **This site has no `MLSGRID_API_TOKEN`; leave it that way.** Without it,
  the check never calls MLS Grid and answers from the hide list and what the
  Signature sync already stored, so a refresh started here cannot bring back a
  listing the Signature sync hid.

### The "never show" list: `HIDE_LISTING_IDS`

Comma-separated MLS numbers Christine has confirmed are off the market, for
example `IRE1043314` (212 N 54th, Greeley, expired November 2025, still Active in
Lofty's copy of the feed). A bare number works too: `1043314` means `IRE1043314`. Works without MLS Grid and in **both** modes, so it can
be set before the switch:

- listing widgets and current listings: hidden before paging, so counts are right;
- `/listing/<id>`: a 404 "no longer on the market" page (noindex);
- map pins, listing photos (grey placeholder);
- a refresh started here leaves it out of the stored copy;
- `/status` names the hidden ids.

Unset, nothing changes. To show a listing again, remove its id and redeploy.

---

## 2. Environment variables (names only)

Set these on **this** Netlify site (The Little Lady Sells Homes). "Copy from
Signature" means: open the Signature site's environment variables and use the
same value. Every variable must include the **Functions** scope. Netlify reads
them at deploy time, so each change needs a deploy.

| Name | Used by | On this site today? | Value |
|---|---|---|---|
| `BACKEND_MODE` | the switch | no (new) | `local` to switch everything on, a list of function names for some, unset / `proxy` for today's pass-through |
| `BLOBS_SITE_ID` | every moved function | yes, value unknown | **the Signature site's Project ID** (Signature > Project configuration > General > Project information; it should equal Signature's own `BLOBS_SITE_ID`) |
| `BLOBS_TOKEN` | every moved function | yes | a Netlify personal access token that can reach the Signature site; copy Signature's `BLOBS_TOKEN` or create a new one |
| `IDX_DISPLAY` | listing functions | probably (recent-activity reads it) | copy from Signature (it only has to be set; the copied code fails closed on anything but `on`) |
| `MAPBOX_PUBLIC_TOKEN` | mapbox-token, local-spots, sold-homes-geocode, my-listings-geo | no (new) | copy from Signature (a `pk.` token; its URL restrictions already list this domain) |
| `GOOGLE_MAPS_API_KEY` | nearby-places, walkability, geocoding, `/status` | yes | keep, **after confirming** Geocoding, Places and Distance Matrix are enabled on it (or copy Signature's key) |
| `LOFTY_API_KEY` | site-health, refresh-my-listings | yes | keep (same Lofty account) |
| `HIDE_LISTING_IDS` | listing functions | no (new) | e.g. `IRE1043314` (or `1043314`); Christine's call |
| `IDX_SEARCH_URL`, `HOME_SEARCH_COUNTIES` | home-search, listing links | no | copy from Signature **only if set there** (the defaults are the same: `https://thelittleladyhomesearch.com/listing`, Larimer + Weld) |
| `OPERATING_COUNTIES`, `LISTING_AGENT_SURNAME` | shared listing rules | no | copy from Signature only if set there |
| `LISTINGS_SOURCE` | everything | no | leave unset (or `lofty`). `mlsgrid` keeps everything passing through |
| `MLS_DISABLED` | MLS Grid kill switch | no | `true` recommended (belt and braces; `/.netlify/functions/mls-usage` then says MLS Grid is switched off here) |
| `MLSGRID_MARKET_DATA` | MLS Grid gate | no | `off` recommended (same reason) |
| `RESEND_API_KEY`, `LEAD_ALERT_TO`, `LEAD_ALERT_FROM` | lead alerts, `/status` rows | yes | keep |
| `LISTING_FEED_KEY`, `LISTING_ENGINE_URL`, `RECENT_ACTIVITY_DISPLAY` | recent-activity, `/status` row | yes | keep |
| `GA_MEASUREMENT_ID`, `META_PIXEL_ID` | build (listing page tags) | yes | keep |

**Do not set:** `MLSGRID_API_TOKEN` (the MLS Grid job stays on Signature until it
moves once, to the shared Seller Intelligence copy), `MLS_QUOTA_*`,
`CLOUDINARY_URL` / `CLOUDINARY_*` (nothing here uploads photos),
`ALERT_MAILING_ADDRESS` (area-alerts-run does not move).

---

## 3. Switching on

### Before you start

1. This change is merged and deployed, and nothing changed:
   `curl -sI "https://www.thelittleladysellshomes.com/.netlify/functions/listings-search?mine=true" | grep -i x-backend`
   says `proxy`.
2. **Which store does this site use today?** Compare this site's `BLOBS_SITE_ID`
   with the Signature Project ID in the Netlify UI (look, don't copy anywhere).
   - Same: nothing to do.
   - Different: this site's failed-lead queue lives in its own store. The
     `lofty-queue-drain` function (every :15 and :45) replays it; in Netlify >
     Functions > `lofty-queue-drain`, the log must show no "still queued" leads for
     the last few runs before you change `BLOBS_SITE_ID`, or those leads would be
     left behind in the old store.
3. In Google Cloud, confirm the key in this site's `GOOGLE_MAPS_API_KEY` has
   Geocoding, Places and Distance Matrix enabled. Otherwise use Signature's key,
   or leave `nearby-places` and `walkability` out of `BACKEND_MODE` for now.

### Step 1: a deploy preview first

1. Netlify > this site > Environment variables: set the variables in section 2
   for the **Deploy Previews** context only, with `BACKEND_MODE=local`.
2. Open any pull request (or push a branch) to get a preview, then check on the
   preview URL (`$P` below):
   - `curl -sI "$P/.netlify/functions/listings-search?mine=true&top=12" | grep -i x-backend` -> `local`
     (repeat for each function in section 1 as needed).
   - The same listing ids as Signature:
     `curl -s "$P/.netlify/functions/listings-search?mine=true&top=12" | jq '[.listings[].listingId]'` and
     `curl -s "https://signaturepropertycollection.com/.netlify/functions/listings-search?mine=true&top=12" | jq '[.listings[].listingId]'`
     (minus anything in `HIDE_LISTING_IDS`).
   - `/listing/<an active id>`: view source shows
     `<link rel="canonical" href="https://www.thelittleladysellshomes.com/listing/<id>">`,
     `googletagmanager.com/gtag/js`, `fbevents.js`, and `"@type":"RealEstateListing"`.
   - `/listing/IRE1043314` (if hidden): 404, "no longer on the market".
   - `/.netlify/functions/sold-homes-geocode`: no "294 Gila Trail".
   - `nearby-places?address=<a listing address as the page sends it>`,
     `walkability?place=Loveland%2C%20CO`, `local-spots`, `my-listings-geo`,
     `mapbox-token`: all return data.
   - `/status`: titled "The Little Lady Sells Homes — Site Health"; the row
     "Backend functions answering on this site" says 14 of 14; no lead names,
     emails or phones anywhere (also check `/status?format=json`).
   - `/.netlify/functions/mls-usage`: says MLS Grid is switched off here (with
     `MLS_DISABLED=true`); the hourly numbers are Signature's normal ~7 requests
     per half hour, because the meter is shared.
   - `/search-homes.html?cities=Loveland`: a 302 to
     `thelittleladyhomesearch.com/listing?...utm_source=thelittleladysellshomes.com`.
   - Forms on a preview are real: a test submission creates a real Lofty lead.
     Use an obvious "TEST - delete" name if you submit one.
3. If a function passes through when it should not, the function log says why
   (for example "not set on this site: MAPBOX_PUBLIC_TOKEN", or "the Blobs store
   BLOBS_SITE_ID names has no lofty-sync-state.json").

### Step 2: production

1. Set the same variables for the **Production** context, including
   `BACKEND_MODE=local` (or a list, to switch in stages).
2. Deploys > Trigger deploy > Deploy site.
3. Check on `https://www.thelittleladysellshomes.com` (same list as step 1), plus:
   - `curl -s "https://www.thelittleladysellshomes.com/.netlify/functions/listings-search?mine=true" | jq '.listings|length'` is above 0.
   - The explore map (listing pins, sold map, spots) and a town page's
     walkability panel load.
   - Signature's function logs stop showing requests with
     `x-forwarded-host: thelittleladysellshomes.com`.
   - GA4 Realtime shows a `page_view` on a `/listing/` page (it never could before).

### Rollback (any time)

- Everything: set `BACKEND_MODE=proxy` (or delete it) and deploy. Every function
  passes through to Signature again, exactly as before this change.
- One function: set `BACKEND_MODE` to the list of the others and deploy.
- Fastest: Deploys > the previous production deploy > "Publish deploy". This
  should also restore that deploy's function settings; confirm once on a harmless
  variable before relying on it.

### Afterwards (a follow-up change, not a setting)

After 7 stable days: delete `lib/_sig-proxy.js` and the pass-through branches of
`lib/_backend-mode.js`, make `explore-map.js`'s `ALERTS_ENDPOINT` relative, and
check `git grep "signaturepropertycollection.com/.netlify"` returns nothing.
**Only then** may the Signature domain become an alias of this site (phase f):
while any pass-through remains, an alias would make each one call itself.

---

## 4. What still lives on Signature after this change

- **The 30-minute `sync-listings` schedule**, which does three jobs: refreshes her
  Lofty listings into the shared store, retries queued Lofty leads, and runs the
  MLS Grid market copy for the town figures (plus the off-market check). This
  site's moved functions only read what it writes, so if that schedule stops,
  her listings age out of the 12-hour IDX rule **on both sites**. It moves once,
  to the shared Seller Intelligence copy; not to this site.
- `area-alerts-run` (paused under Lofty) and the overnight photo backfill.
- **The Blobs stores** (`mls-listings` with the market copy, her Lofty listings,
  the lead queue, the MLS meter and verdicts; the geocode and Google caches;
  `area-alerts`). This site reads them through `BLOBS_SITE_ID`. Copy them before
  the Signature site is ever deleted (phase g).
- Cloudinary re-hosting (`spc-listings/`) and the MLS Grid photo path.
- `town-market.yml` in the Signature repo, which regenerates the town figures from
  the market copy; this site's own workflow takes that file.
- Signature's own pages, forms (and their Netlify Forms inbox), domain, email
  (MX), GA4 stream and Search Console property.
- Callers that still use the Signature domain: noco-newsletter (`my-listings-geo`,
  `local-spots`), Expired Luxury letters and QR codes (`/expiredlisting/`),
  Bold Collective Command Center (uptime check, GA4 reporting), Listing Engine
  (luxury brand URL), bold-collective and firsttimehomebuyer links.
- In this repo, still pointing at Signature: `lib/_sig-proxy.js` (the fallback),
  `build/assets/js/explore-map.js` `ALERTS_ENDPOINT` (only used when listings come
  from MLS Grid), the "Reproduce this search" link written into Lofty notes by
  `submission-created.js` (Signature's search applies its $950K floor), and the
  page-level links, schema `sameAs`, cross-domain canonicals and redirects that
  part 2 and the redirect phases handle.

---

# Signature move, part 2: The Little Lady's Signature Property Collection

Written 2026-09-30. The luxury tier's pages, built here under
`/signature-property-collection/` by `build/collection_pages.py` (called from
`build.py` `main()`), plus what they need around them. **Nothing a visitor of
this site sees changes yet**: no existing page links to the Collection, and every
Collection page is canonical to the Signature URL it stands in for, so none is in
the sitemap. Phase (e) points Signature's URLs here, with Christine's OK.

## What is where

| Thing | Where |
| --- | --- |
| The pages (hub, 7 market pages, 4 resort pages, buyers, sellers, concierge, homes over $1M, home tours, two guides, the book landing, the hidden form page) | `build/collection_pages.py` |
| Canonical → Signature URL for each page and moved post | `COLLECTION_CANONICAL_TO_SIGNATURE` in `build.py` |
| The look: `body.tier-signature` tokens, the sub-header | `build/assets/css/collection.css`, inlined on tier pages only |
| Fonts (Libre Baskerville 400/400i/700, Poppins 300–700, Corinthia; latin subsets, 117 KB) | `build/assets/fonts/`, declared and preloaded on tier pages only (`_collection_head`) |
| Share card and logo, the Collection's and this site's own | `build/assets/img/signature-collection/`, `og-card-little-lady.png`, `logo-little-lady.png`; templates in `build/tools/share-cards/` (render the HTML at the size in its `body` rule) |
| The three moved posts | `build/data/blog.json`, rendered on tier pages, left out of the blog index, RSS and llms.txt (`_listed_blog`) until phase (e) |
| Listing pages from $950K | `_listing-page-shell-collection.html` (written by `write_listing_page_shell`), chosen in `listing-page.js` |

## Forms (Lofty labels in `submission-created.js`)

New names, each tagged **Signature Collection**: `signature-buyers-inquiry`,
`signature-sellers-inquiry`, `signature-concierge-inquiry`,
`signature-luxury-market`, `signature-resort-buyer-inquiry`,
`signature-expired-inquiry` (the book landing; its note also carries the printed
piece's `src`/`mid`/`gap`).

Every form name the Signature site used (16) is registered on the noindex
`/signature-property-collection/form-definitions.html` with the fields its markup
sent, so a Signature page still open in a browser after phase (f) posts here
instead of being dropped. `luxury-market` and `concierge-page-inquiry` exist only
there, so their labels now say they came from the Signature site.

## Search

`/signature-property-collection/search-homes.html` is a forced rewrite to
`home-search?tier=signature-collection`: it keeps the $950K floor and is tagged
`utm_campaign=signature-collection` (also when the answer comes from Signature,
whose Location is re-tagged). The site's own search is unchanged (no floor,
`utm_campaign=home-search`).

Filters the Lofty search cannot apply (horse property, waterfront, a named
neighbourhood, land and farm types) are no longer dropped silently: the hand-off
says what will and won't be applied (`homeSearchNote`), on a one-screen note page
for a `/search-homes.html` link and under the button in a live-listing widget.
When a Lofty condition key for one of them is confirmed on her Lofty site, map it
in `conditionFor()` and drop it from `unappliedFilters()`.

## Analytics and schema

- GA4 `content_group: 'signature-collection'` on tier pages and the Collection
  listing shell; `view_item` (MLS number, price, town; never the address) on
  every listing page; `collection_click` for a click into the Collection, here or
  on the Signature domain (replaces `brand_site_click` for that domain).
- One Christine (`AGENT_ID`); a `Brand` node for the Collection (`#collection`)
  that her node and the Organization carry. Collection pages' VideoObjects join
  `sitemap-videos.xml` when their canonicals move here (phase e).

## Merged into existing pages (no links to the Collection yet)

- `/relocation.html`: an executive & luxury relocation section.
- `/northern-colorado-market-report.html`: the $1M+ tier, from
  `build/data/market_report.json` (`luxury`), shown as the dated June 2026 snapshot
  it is, with source and window. Delete that block to retire it.
- `/expired-listings.html`: a "$1M+ homes" block.
- `/guides/buyers-guide.html`, `/guides/sellers-guide.html`: an "above $950K"
  chapter each.
- The about-page partnership section was **not** merged: Christine is a solo agent
  on this site. `tests/test-no-kendra.js` fails the build on the second agent's
  name or number anywhere in the output.

## Phase (e) checklist (with Christine's OK)

1. Point each Signature URL to its Collection page (page-by-page redirects on the
   Signature site), then change that page's entry in
   `COLLECTION_CANONICAL_TO_SIGNATURE` so its canonical is its own URL. The
   sitemap, video sitemap, blog index and RSS pick it up automatically.
2. Link the Collection from this site: navigation, the market report's
   "Luxury?" button and the home page callout (both still point at the Signature
   domain), and the merged sections above.
3. Point printed-piece traffic (`/expiredlisting/` on the Signature domain) at
   `/signature-property-collection/expired-listings.html`.
