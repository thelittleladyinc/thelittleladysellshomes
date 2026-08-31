#!/usr/bin/env python3
"""Production wrapper for the ROI conversion layer.

The first pass correctly built the funnels and attribution client, but its final
validator treated the mere string ``lead-form`` anywhere in an HTML document as
proof that a static attribution input had to exist on that page. Hundreds of
legacy/generated pages contain that string in shared scripts/markup and were
therefore false positives.

The browser attribution client already injects attribution values into every
actual ``form.lead-form`` at submit time. Only the five new Netlify funnel forms
need their fields declared statically in generated HTML, and those are validated
strictly here. This keeps the change surgical instead of rewriting hundreds of
legacy pages just to satisfy a validator.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE_PATH = HERE / "postprocess_roi_conversion.py"

spec = importlib.util.spec_from_file_location("roi_engine", ENGINE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load ROI engine: {ENGINE_PATH}")
roi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(roi)


def instrument_site(src: str) -> None:
    """Load the privacy-safe attribution/CTA client on every HTML page.

    Existing forms are intentionally left structurally untouched. The client
    adds hidden attribution fields at submit time. New ROI forms already carry
    static ATTR_INPUTS through form_shell(), which Netlify can discover at build
    time and which this wrapper validates below.
    """
    for path in roi.SITE.rglob("*.html"):
        roi.write_if_changed(path, roi.add_asset(roi.read(path), src))


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

    # Every generated page receives the same content-hashed client once. This
    # is the durable coverage for old forms without touching their HTML schema.
    for path in roi.SITE.rglob("*.html"):
        html = roi.read(path)
        if html.count(src) != 1:
            errors.append(f"{path.relative_to(roi.SITE)}: ROI JS not exactly once")

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


# Patch the engine's module globals. roi.main() resolves these names at runtime,
# so the engine still owns form generation/backend patching while this wrapper
# narrows only the instrumentation and validation behavior.
roi.instrument_site = instrument_site
roi.validate = validate


if __name__ == "__main__":
    try:
        raise SystemExit(roi.main())
    except Exception as exc:
        print(f"ROI conversion layer FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
