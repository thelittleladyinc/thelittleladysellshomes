# MLS reads through the hub (this site's half)

Written 2026-10-24. Christine: "it's very important that we don't lose anything at all since everything is
completely integrated." **Nothing here switches itself on.** With the settings below unset the site behaves exactly
as before.

This site has never had an MLS Grid token (`MLSGRID_API_TOKEN` is deliberately not set; keep it that way). Every
MLS figure or verdict it shows came from the Signature site's MLS Grid job, read three ways. Each now has a hub path:

| What | Today | With the hub | Switch (name=value, where) |
|---|---|---|---|
| **Town figures** (`build/data/town_market.json`: town pages, market report, town market pages) | `.github/workflows/town-market.yml` copies the Signature repo's file from raw GitHub (Mon/Thu 14:50 UTC) | the hub's `GET /v1/market/towns` (same schema, the hub computes it from its one copy with Signature's rules; `docs/HUB-TOWN-STATS.md`) | `TOWN_STATS_SOURCE=hub` as a **GitHub repository variable** (the workflow), with variable `HUB_API_URL` and secret `HUB_APP_KEY`; and `TOWN_STATS_SOURCE=hub` in **Netlify** (the production build fetches them before `build.py`, using `HUB_APP_KEY`, else the site's `HUB_API_KEY`) |
| **"Is her Lofty listing really on the market?"** for a refresh started here (`refresh-my-listings.js`, `lib/_mls-onmarket.js`) | the Signature site's stored copy (`mine-listings.json`) and 24-hour verdicts; anything else "unknown" (kept), never an MLS Grid call | the same order, then one hub question for a listing the store does not settle: `POST /v1/mls/search {listing_ids:[id], limit:1}` (shared `lib/_mls-hub.js`, byte-identical in both sites); the Signature hub run's memory of her removed listings answers "off the market" where MLS Grid's week-long hidden record did | `MLS_SOURCE=hub` in **Netlify** (needs `HUB_API_URL` + `HUB_API_KEY` with scope `mls:read`) |
| **Listing pages** (`/listing/<id>`, her listings from Lofty) | rendered here (`BACKEND_MODE` local) or by the Signature site (proxy), from the Lofty copy; no MLS Grid data | unchanged (Lofty, not MLS) | none |

What the store it reads holds is the Signature site's: with `MLS_SOURCE=hub` there, its market-data copy and
verdicts come from the hub too, and `/status` here says "Market data from the hub refreshing".

## Rules, as on the Signature site

- **Only exactly `hub`** (trimmed) switches `MLS_SOURCE`; anything else keeps today's path and is noted once in
  the log (the value is never printed). `MLSGRID_MARKET_DATA=off` still switches the check off (no one is asked).
- **Fail closed.** A hub that is not set up, unreachable, refusing (a key without `mls:read` gets 403), switched off,
  not ready (`503 not_ready`) or answering something malformed is "unknown": the listing stays as Lofty shows it and
  the reason is logged. Never "not found", never a fallback to MLS Grid. At most two hub lookups a refresh, 1.5 s
  apart; a verdict is kept a day.
- **Town figures**: a hub answer is written only after every check in `docs/HUB-TOWN-STATS.md`; otherwise the
  committed file stays and the pages keep their last good figures until build.py's 21-day limit.
- The key travels only in the `x-hub-key` header (the vendored toolkit client: https only, redirects refused).

## Listing pages are dated by their listing (2026-10-24)

The listing shells are written by `build.py` at build time, so every `/listing/<id>` page carried the deploy's date
in `og:updated_time`, `last-modified` and the agent entity's `dateModified` (the static pages' guard never sees
these shells). `listing-page.js` now uses the listing's own `modificationTimestamp` (Lofty's or the MLS's change
time), claims no date when there is none, and drops the agent entity's date, as `build/postprocess_audit_fixes.py`
does on every static page. It also stops nesting the listing schema in a second `<script>` inside the shell's own
`<script type="application/ld+json">` (search engines could not read it). `tests/test-listing-page-dates.js`.

## Tests

`tests/test-mls-via-hub.js` (the switch, every hub answer and failure, the order and cap, the refresh end to end,
`/status`, `lib/_mls-hub.js` identical to the Signature copy), `tests/test-townmarket-hub.js` (the town figures,
including the `HUB_API_KEY` fallback), `tests/test-listing-page-dates.js`.
