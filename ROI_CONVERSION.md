# ROI / Conversion Priorities

This site has enough historical SEO surface area. The next phase is to turn proven organic demand into attributable conversations, not to manufacture page count.

## Priority order

1. Preserve and convert rent-to-own traffic.
2. Turn land/acreage, ILC/survey, well, septic and zoning traffic into property-review and due-diligence conversations.
3. Turn multigenerational / Next Gen traffic into feature-specific home-search inquiries.
4. Turn Loveland market-price traffic into either a home search or a property-specific seller inquiry.
5. Attribute every website lead to its first page, form page, source/referrer and UTMs where available.
6. Measure CTA and successful-lead behavior before creating more generic SEO content.

## Permanent rules

- Do not create bulk generic city pages or "best Realtor" pages as a substitute for conversion work.
- Do not rewrite high-performing URLs just to add keywords. Add the smallest useful conversion layer.
- A lead notification should contain the website journey when available, but PII/form values must never be sent to GA4 or Meta.
- `form_submit` / `lead_form_attempt` is not a lead. Confirmed thank-you completion is the conversion.
- Funnel forms must keep the Netlify → `submission-created.js` → Lofty → Resend path.
- Rent-to-own copy may compare options but must not promise financing or universal program eligibility.
- Land/ILC content organizes real-estate due-diligence questions; it must not imply legal, surveying, engineering, lending or environmental advice.
- Multigenerational search should ask about property features, not protected-class characteristics.

## Production implementation

`scripts/netlify-build.sh` runs, in order:

1. `build/build.py`
2. `build/postprocess_audit_fixes_v2.py`
3. `build/postprocess_roi_conversion_v2.py`
4. Netlify publishes `site/` only after all three stages pass.

The v2 ROI wrapper loads `build/postprocess_roi_conversion.py` as its engine. The engine owns the funnel copy, attribution client and backend patch; the v2 wrapper owns the production instrumentation/validation policy. Existing legacy forms are not bulk-rewritten merely to add static hidden fields. The shared attribution client adds those values at submit time, while the five new ROI Netlify forms declare the fields statically and are validated field-by-field.

The ROI layer adds and validates:

- privacy-safe first-touch and form-page attribution;
- Rent-to-Own "Show Me My Options" funnel;
- Raw Land "Send Me the Property" funnel and quick-answer table;
- Multigenerational feature-specific search funnel;
- ILC/Land due-diligence checklist request + successful thank-you checklist;
- Loveland market buyer/seller conversion split;
- conversion bridges among related high-value pages;
- `roi_cta_click` analytics without PII;
- Lofty source labels/tags and Resend/Lofty note context for the new funnels;
- frozen canonicals/titles on the ranking pages explicitly protected by the ROI gate;
- exactly one content-hashed ROI client on every generated HTML page.

Do not remove the ROI engine/wrapper unless its behavior has been moved upstream and the same built-output invariants remain independently tested.