#!/usr/bin/env python3
"""Production wrapper for the ROI conversion layer.

Netlify Forms discovers form schemas from static HTML at deploy time. Fields
created only in the browser can be submitted by JavaScript, but Netlify will not
reliably retain them unless those field names were present in the deployed HTML
schema first. Therefore every real ``form.lead-form`` gets the attribution field
names statically during the post-build step, while the browser client fills their
values immediately before submit.

The first ROI validator failed because it treated the mere string ``lead-form``
anywhere in an HTML document as proof that a form existed. Shared CSS and scripts
contain that string on hundreds of pages. This wrapper only inspects actual
<form class="... lead-form ..."> elements outside <script>/<style> blocks, so the
coverage is broad without repeating the false-positive bug.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE_PATH = HERE / "postprocess_roi_conversion.py"

spec = importlib.util.spec_from_file_location("roi_engine", ENGINE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load ROI engine: {ENGINE_PATH}")
roi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(roi)

# Split out executable/style text before looking for form markup. A literal
# "<form ...>" inside a JavaScript string must not be rewritten or validated as
# deployed HTML markup.
SCRIPT_STYLE_RE = re.compile(
    r'(<(?:script|style)\b[^>]*>.*?</(?:script|style)\s*>)',
    re.I | re.S,
)
LEAD_FORM_RE = re.compile(
    r'<form\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\blead-form\b[^"\']*["\'])[^>]*>.*?</form>',
    re.I | re.S,
)


def markup_parts(html: str):
    """Yield (is_markup, chunk), excluding script/style contents from form scans."""
    for part in SCRIPT_STYLE_RE.split(html):
        if not part:
            continue
        is_script_or_style = bool(re.match(r'^<(?:script|style)\b', part, re.I))
        yield (not is_script_or_style), part


def add_static_attribution_fields(html: str) -> str:
    """Add ATTR_FIELDS to actual lead-form markup without touching JS/CSS text."""
    out: list[str] = []
    for is_markup, part in markup_parts(html):
        out.append(roi.add_attr_fields(part) if is_markup else part)
    return "".join(out)


def actual_lead_forms(html: str) -> list[str]:
    forms: list[str] = []
    for is_markup, part in markup_parts(html):
        if is_markup:
            forms.extend(match.group(0) for match in LEAD_FORM_RE.finditer(part))
    return forms


def instrument_site(src: str) -> None:
    """Statically declare attribution fields and load the privacy-safe client."""
    for path in roi.SITE.rglob("*.html"):
        html = add_static_attribution_fields(roi.read(path))
        html = roi.add_asset(html, src)
        roi.write_if_changed(path, html)


def validate(src: str) -> None:
    errors: list[str] = []
    expected = {
        roi.TARGETS["rent"]: ("roi-rto-funnel", "rent-to-own-options"),
        roi.TARGETS["multi"]: ("roi-multigen-funnel", "multigenerational-search"),
        roi.TARGETS["land"]: ("roi-land-funnel", "land-property-review"),
        roi.TARGETS["ilc"]: ("roi-ilc-funnel", "land-due-diligence-checklist"),
        roi.TARGETS["loveland"]: ("roi-loveland-market-funnel", "loveland-market-seller"),
    }

    # The new money pages must have exactly one funnel, a correct Netlify
    # success path, static attribution declarations, consent, and the client.
    for path, (marker, form_name) in expected.items():
        html = roi.read(path)
        if html.count(f'id="{marker}"') != 1:
            errors.append(f"{path.name}: expected one {marker}")
        if f'name="{form_name}"' not in html:
            errors.append(f"{path.name}: missing {form_name}")
        if f'action="/thank-you.html?from={form_name}"' not in html:
            errors.append(f"{path.name}: wrong thank-you action")
        for field in roi.ATTR_FIELDS:
            if f'name="{field}"' not in html:
                errors.append(f"{path.name}: static attribution field missing: {field}")
        if 'name="consent"' not in html:
            errors.append(f"{path.name}: consent missing")
        if html.count(src) != 1:
            errors.append(f"{path.name}: ROI JS not exactly once")

    # Freeze the search assets we explicitly promised not to migrate/rewrite.
    land = roi.read(roi.TARGETS["land"])
    if '<link rel="canonical" href="https://www.thelittleladysellshomes.com/whats-the-real-cost-to-develop-raw-land-in-colorado.html">' not in land:
        errors.append("raw-land canonical changed")
    if '<title>How Much Does It Cost To Develop Raw Land in Colorado? Water, Power, Septic &amp; Access</title>' not in land:
        errors.append("raw-land title changed unexpectedly")

    multi = roi.read(roi.TARGETS["multi"])
    if '<link rel="canonical" href="https://www.thelittleladysellshomes.com/multi-generational-homes-for-sale-in-northern-colorado-find-your-familys-fit.html">' not in multi:
        errors.append("multigenerational canonical changed")

    thanks = roi.read(roi.TARGETS["thanks"])
    if 'id="land-checklist"' not in thanks or "land-due-diligence-checklist" not in thanks:
        errors.append("thank-you checklist missing")

    # Client analytics may measure CTA interaction, but it must never declare
    # a successful lead or invoke Meta. Successful conversion stays thank-you-only.
    asset = roi.read(roi.SITE / src.lstrip("/"))
    if "generate_lead" in asset or "fbq(" in asset:
        errors.append("ROI JS must not fire lead conversions")
    if "roi_cta_click" not in asset:
        errors.append("ROI CTA event missing")
    if "attribution_first_page" not in asset or "attribution_form_page" not in asset:
        errors.append("ROI attribution client incomplete")

    # Every actual lead form must expose every attribution field in static HTML
    # so Netlify's build-time form parser knows the schema. Also require exactly
    # one ROI client per generated page. This deliberately ignores CSS/JS strings.
    lead_form_count = 0
    for path in roi.SITE.rglob("*.html"):
        html = roi.read(path)
        if html.count(src) != 1:
            errors.append(f"{path.relative_to(roi.SITE)}: ROI JS not exactly once")
        for index, form in enumerate(actual_lead_forms(html), start=1):
            lead_form_count += 1
            for field in roi.ATTR_FIELDS:
                count = form.count(f'name="{field}"')
                if count != 1:
                    errors.append(
                        f"{path.relative_to(roi.SITE)} lead form #{index}: "
                        f"expected one static {field}, found {count}"
                    )

    if lead_form_count == 0:
        errors.append("no actual lead forms found during ROI validation")

    backend = roi.read(roi.BACKEND)
    for needle in (
        "ROI_ATTRIBUTION_PATCH_V1",
        "WEBSITE JOURNEY",
        "WHAT THEY NEED",
        '"rent-to-own-options"',
        '"multigenerational-search"',
        '"land-property-review"',
        '"land-due-diligence-checklist"',
        '"loveland-market-seller"',
    ):
        if needle not in backend:
            errors.append(f"backend attribution patch missing: {needle}")

    if errors:
        raise RuntimeError("ROI conversion gate failed:\n- " + "\n- ".join(errors))

    print(f"--- ROI static form schema: {lead_form_count} lead form(s) carry attribution fields")


# Patch the engine's module globals. roi.main() resolves these names at runtime,
# so the engine still owns form generation/backend patching while this wrapper
# owns the production instrumentation and validation policy.
roi.instrument_site = instrument_site
roi.validate = validate


if __name__ == "__main__":
    try:
        raise SystemExit(roi.main())
    except Exception as exc:
        print(f"ROI conversion layer FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
