# Traffic Growth Guardrails

This file documents the final traffic-consolidation layer added after the August 2026 migration and conversion audit. The goal is to concentrate existing Google authority, not start another migration.

## Protected historical winners

The following established URLs remain the canonical ranking targets:

- `/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html`
- `/whats-the-real-cost-to-develop-raw-land-in-colorado.html`
- `/the-best-places-to-retire-in-northern-colorado.html`

The newer rebuild guides below are intentionally consolidated with permanent redirects and must not be restored as competing indexable pages without measured evidence and an explicit migration plan:

- `/guides/multi-generational-homes-northern-colorado.html` → historical multigenerational winner
- `/guides/cost-to-develop-raw-land-colorado.html` → historical raw-land winner
- `/guides/best-places-to-retire-in-northern-colorado.html` → historical retirement winner

Internal links must point directly to the winners and the duplicate URLs must not appear in `sitemap.xml`.

The old generated `/dream-home-finder.html` output is also an explicit redirect source to `/lifestyle-search.html`, matching the pre-existing extensionless legacy route. It is not an additional indexable search page.

## Community market truthfulness

Static MLS aggregate copy on community pages is a dated snapshot. If its source date is more than three days old, it must not say `right now`, `live inventory`, or otherwise imply the aggregate count/median is current. The dynamic live listing search is separate and may describe itself as current when the feed is genuinely current.

The production wrapper handles both community-market sentence shapes: pages with a price-per-square-foot sentence and smaller markets such as Laporte where that sentence is absent.

## Local FAQs

Community FAQs should answer buyer/seller questions, not nominate Christine as the `best` or `top` real-estate agent in a town. Both visible copy and FAQPage JSON-LD are protected by the traffic gate.

## Video sitemap

For third-party YouTube-hosted videos, keep the embeddable URL in `video:player_loc`. Do not put a YouTube watch page in `video:content_loc`; that field is for the actual media file.

## High-value legacy support pages

The Fort Collins rent-to-own URL is historical and must stay in place. Keep the page current, qualified, and linked to the main `Show Me My Options` funnel rather than creating another Fort Collins rent-to-own article.

The ILC/survey page should keep answering cost intent, but do not publish undated precise dollar ranges as if they are current. Explain the factors that change a surveyor's quote and tell the reader to obtain a current property-specific quote.

## Production build

`scripts/netlify-build.sh` must run, in order:

1. `build/build.py`
2. `build/postprocess_audit_fixes_v2.py`
3. `build/postprocess_roi_conversion_v2.py`
4. `build/postprocess_traffic_growth_v2.py` (wrapper; uses `build/postprocess_traffic_growth.py` as the base engine)
5. publish only if every stage passes

Missing Python, a missing generator, a missing gate, or any gate failure is a hard deployment failure. Netlify should keep the previous atomic production deploy rather than publish a stale committed fallback.

`tests/run-all.sh` runs the same production build before the regression suites. `.github/workflows/site-tests.yml` runs that suite for pull requests and pushes to `main`.
