#!/usr/bin/env python3
"""Fast source-level checks for the ROI conversion layer.

The production Netlify build runs stronger built-output validation through the
v2 wrapper; this file catches accidental deletion/renaming in ordinary repo test
runs too.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
engine = (ROOT / "build" / "postprocess_roi_conversion.py").read_text(encoding="utf-8")
wrapper = (ROOT / "build" / "postprocess_roi_conversion_v2.py").read_text(encoding="utf-8")
build = (ROOT / "scripts" / "netlify-build.sh").read_text(encoding="utf-8")

required_engine = [
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
for needle in required_engine:
    assert needle in engine, f"ROI engine missing {needle}"

client = engine.split("CLIENT_JS =", 1)[1].split("def create_asset", 1)[0]
assert "generate_lead" not in client
assert "fbq(" not in client

for needle in [
    "static attribution field missing",
    "raw-land canonical changed",
    "multigenerational canonical changed",
    "ROI JS not exactly once",
    "SCRIPT_STYLE_RE",
    "LEAD_FORM_RE",
    "add_static_attribution_fields",
    "actual_lead_forms",
    "roi.add_attr_fields",
    "expected one static",
    "ROI static form schema",
    "roi.instrument_site = instrument_site",
    "roi.validate = validate",
]:
    assert needle in wrapper, f"ROI production wrapper missing {needle}"

assert "postprocess_roi_conversion_v2.py" in build
assert build.index("postprocess_audit_fixes_v2.py") < build.index("postprocess_roi_conversion_v2.py")
assert "TEMPORARY PREVIEW DIAGNOSTIC" not in build
assert "exit 1" in build

print("ROI conversion source checks: PASS")
