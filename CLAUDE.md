# CLAUDE.md — Production Guardrails for The Little Lady Sells Homes

This repository is the production website for **The Little Lady Sells Homes**. Treat it as an established site with accumulated Google history, working redirects, live lead capture, and a large recent migration — not as a greenfield website.

## The rule above every other rule

**Do not make broad architectural or SEO changes because a generic audit says they are best practice. Measure this site first, preserve what is already working, and change the smallest layer that fixes the verified problem.**

The August 2026 rebuild/migration moved hundreds of legacy URLs, rebuilt internal linking, added MLS-backed pages, hardened performance, and created regression tests specifically to prevent silent SEO losses. A second unnecessary migration can erase the benefit of the first.

## URL and canonical policy

1. The current canonical convention is the real `.html` URL served with HTTP 200. This is intentional.
2. **Do not convert the site back to extensionless URLs.**
3. **Do not change `/index.html` vs `/` without explicit human approval and a measured migration plan.** The homepage decision is intentionally frozen while Google settles the larger migration.
4. Never remove a legacy 301 merely because the old URL looks ugly. Old URLs can hold backlinks, printed QR codes, bookmarks, and Search Console history.
5. Before adding or changing a redirect:
   - identify the old URL from real evidence;
   - map it to the closest honest destination;
   - never redirect unrelated content to the homepage just to avoid a 404;
   - avoid redirect chains.
6. Internal links should point directly at their final 200/canonical destination, not through our own 301s. The post-build audit gate enforces this.
7. A URL migration requires explicit approval, a complete redirect map, canonical/sitemap changes, internal-link changes, and a rollback plan.

## Search Console and SEO behavior

1. Do not treat old and new URL appearances during a recent migration as proof of a duplicate-content problem without checking redirects/canonicals and crawl dates.
2. Never bulk rewrite ranking pages. Preserve URL, search intent, useful facts, and the parts Google is already rewarding.
3. Do not create hundreds of new pages simply to increase page count. Existing pages should earn their place through unique local utility.
4. Internal linking is already guarded by `tests/test-internal-links.js`. Do not replace that architecture casually.
5. Do not publish self-nominating FAQ copy such as:
   - “Who is the best real estate agent in …?”
   - “Who is a top female real estate agent …?”
   Consumer FAQs should answer actual buyer/seller questions.
6. Do not display private/internal Search Console metrics such as “413 clicks from Google search” to public visitors. Search Console data may determine ordering behind the scenes, but not appear as vanity copy.

## Freshness and `lastmod`

A build date is **not** a content modification date.

1. `sitemap.xml <lastmod>`, `meta[name=last-modified]`, `og:updated_time`, and article `dateModified` must represent a meaningful content/data update.
2. A CSS, font, analytics, deployment, or infrastructure-only change must not make hundreds of pages look newly edited.
3. Blog articles should retain their real publication/modification dates unless their article content actually changes.
4. MLS/market pages should use the date of the underlying data snapshot, not the deploy date.
5. Do not put a daily `dateModified` on the sitewide `RealEstateAgent` entity simply because the generator ran.
6. `build/postprocess_audit_fixes.py` is the current output-level guardrail for these rules. If freshness logic is later moved into `build.py`, preserve the same behavior and update the postprocessor/tests rather than deleting the protection first.

## Market-report truthfulness

“Live,” “right now,” and similar language are claims about data freshness.

1. If the IRES/MLS snapshot is more than a few days old, label it as a dated **MLS snapshot**, not “Live From IRES MLS.”
2. Titles/descriptions/body copy must not imply today’s inventory when the numbers were refreshed days or weeks earlier.
3. Always display the exact data refresh date.
4. Do not invent or extrapolate current market numbers from an old snapshot.

## Lead capture: conversion truth is sacred

The site has many lead forms. A browser `submit` event is **not** proof of a lead.

1. `form_submit` or `lead_form_attempt` = diagnostic attempt only.
2. `generate_lead` / Meta `Lead` = confirmed successful form completion only.
3. A confirmed website lead reaches `/thank-you.html?from=<form-name>` after successful submission. Conversion events belong there, guarded so a direct visit to the thank-you page without `from` is not counted as a lead.
4. Never fire Meta `Lead` from a delegated form-submit listener.
5. Preserve the form-name contract with `netlify/functions/submission-created.js`, Lofty source labels, and `tests/test-thankyou.js`.
6. Do not include form field values, names, emails, phone numbers, addresses, or other PII in analytics events.
7. When changing lead flow, verify the entire chain where possible: browser success → Netlify submission → submission-created function → Lofty handoff → notification → analytics confirmation.

## Analytics events

Business funnel events should be privacy-safe and useful, not noisy.

Useful events include:
- `lead_form_attempt` — form name only;
- `generate_lead` — confirmed success only;
- `home_search_submit` — form/control ID, not search text if it could contain personal data;
- `listing_click` / `listing_detail_view` — listing path/ID only;
- `contact_click` — method such as phone/email/text;
- `external_form_click` — destination domain only;
- `brand_site_click` — destination domain for Signature Property Collection / OwnInNoCo.

Do not add cross-domain linker configuration unless you have first verified that the relevant domains use a compatible GA4 setup. Tracking an outbound business event is safer than assuming shared GA configuration.

## Content voice and quality

Write like Christine, not like an SEO template.

Prefer:
- specific Northern Colorado tradeoffs;
- real transaction details;
- plainspoken advice;
- things a local agent knows that a national portal does not;
- honest “this may not be for you” language;
- wells, septic, irrigation, acreage, zoning, metro districts, insurance, commute realities, and other property-specific due diligence when relevant.

Avoid:
- “hidden gem”;
- “nestled”;
- “charming community” as filler;
- “dream home” filler;
- “promising future”;
- “vibrant community” unless substantively supported;
- generic “perfect place to plant your roots” copy;
- unsupported superlatives;
- demographic steering language.

## Fair housing / neighborhood copy

Do not write housing marketing that expresses a preference for protected classes or family status.

Avoid promotional phrases such as:
- “family-friendly”;
- “great place to raise a family”;
- “safe and nurturing”;
- describing who “typically moves here” by age, family composition, religion, race, ethnicity, disability, or other protected traits.

Objective information may be presented neutrally when it is accurate and relevant. For schools, name the district or objective program information and encourage buyers with specific needs to confirm current offerings directly. Do not characterize schools as “excellent,” “best,” or otherwise steer buyers based on school reputation.

## Financial, mortgage, rent-to-own, and legal claims

Do not turn variable lending/program rules into universal promises.

1. Never claim “most renters qualify today” unless supported by current, auditable client data and compliance approval.
2. Do not publish a universal rent-to-own credit-score threshold; seller/program requirements vary and the eventual mortgage has separate underwriting.
3. USDA, VA, FHA, CHFA, DPA and other program eligibility changes by borrower, property, geography, income, lender and current program rules. Say so.
4. Do not call a market or program “$0 down” without the eligibility qualifier.
5. Do not imply a real-estate agent is giving legal advice or performing attorney-level contract review. Real-estate terms can be discussed; legal interpretation belongs with a Colorado attorney.
6. Time-sensitive local lending claims must carry a source/as-of date or be removed when stale.

## High-value pages: edit surgically

The following pages showed unusually strong human engagement in the Aug. 2026 analytics audit and should not be casually rewritten:

- `discovering-eaton-colorado-on-the-northern-plains.html`
- `rent-to-own.html`
- `search-homes.html`
- strong land/acreage/zoning/ILC guides

For a ranking/engaged page:
1. preserve URL;
2. preserve the query intent;
3. preserve useful unique information;
4. remove only the stale, duplicate, unsupported, compliance-risky, or obviously templated portions;
5. compare before/after visible copy;
6. avoid changing title/meta unless the current title is inaccurate or misleading.

## Performance

Recent performance work is measured and heavily regression-tested.

Do not casually undo:
- CSS minification;
- self-hosted/deferred font behavior;
- content-hashed CSS/JS assets;
- deferred Meta Pixel loading;
- lazy map loading;
- avatar optimization;
- YouTube facade/resource-hint behavior;
- immutable static-asset caching.

Read the commit comments and existing tests before changing these areas. If Lighthouse suggests a change, measure it. Diagnostics are not automatically score improvements.

## Build and deployment

Production build path:
1. `scripts/netlify-build.sh`
2. `build/build.py`
3. `build/postprocess_audit_fixes.py`
4. Netlify publishes `site/` only if both generator and audit gate pass.

If the generator or audit gate fails after Python successfully starts, fail the deploy and preserve the previous production deploy. Never publish partially generated output.

The post-build gate is intentionally output-level because that is where prior regressions hid. If you later move one of its fixes upstream into `build.py` or source data, keep the gate until the built-output invariant is still independently tested.

## Before merging any sitewide change

Check, at minimum:
- no canonical URL was unintentionally changed;
- no redirect was removed without evidence;
- no internal link now points through a 301;
- no `noindex` page is in the sitemap;
- no fake deploy-date freshness was introduced;
- stale MLS pages do not say “live/right now”;
- Meta Lead and GA lead conversions require confirmed success;
- no PII is sent to analytics;
- no public Search Console counts are exposed;
- no self-nominating “best Realtor” FAQ was introduced;
- fair-housing-risk wording was not introduced;
- the existing regression suite still passes;
- the Netlify preview/deploy status is green.

## When unsure

Protect the existing URL, ranking signal, and working user path. State the uncertainty in the PR instead of guessing. A smaller correct change is better than a broad “optimization” that takes months for Google to forgive.
