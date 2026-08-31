#!/usr/bin/env python3
"""Fast source-level checks for the ROI conversion layer.

The production Netlify build runs the stronger built-output validation inside
postprocess_roi_conversion.py; this file catches accidental deletion/renaming in
ordinary repository test runs too.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
roi = (ROOT / "build" / "postprocess_roi_conversion.py").read_text(encoding="utf-8")
build = (ROOT / "scripts" / "netlify-build.sh").read_text(encoding="utf-8")

required = [
    "rent-to-own-options",
    "multigenerational-search",
    "land-property-review",
    "land-due-diligence-checklist",
    "loveland-market-seller",
    "attribution_first_page",
    "attribution_form_page",
    "attribution_source",
    "roi_cta_click",
    "ROI_ATTRIBUTION_PATCH_V1",
    "WEBSITE JOURNEY",
]
for needle in required:
    assert needle in roi, f"ROI layer missing {needle}"

assert "generate_lead" not in roi.split("CLIENT_JS =", 1)[1].split("def create_asset", 1)[0]
assert "fbq(" not in roi.split("CLIENT_JS =", 1)[1].split("def create_asset", 1)[0]
assert "postprocess_roi_conversion.py" in build
assert build.index("postprocess_audit_fixes_v2.py") < build.index("postprocess_roi_conversion.py")

print("ROI conversion source checks: PASS")
