#!/usr/bin/env python3
"""Fast source-level checks for the ROI conversion layer.

The production Netlify build runs stronger built-output validation through the
v2 wrapper; this file catches accidental deletion/renaming in ordinary repo test
runs too.
"""
from pathlib import Path
import importlib.util

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

spec = importlib.util.spec_from_file_location("roi_optional_consent", ROOT / "build" / "postprocess_roi_conversion_v2.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
roi = module.roi
for make, form_name in [
    (roi.rent_block, "rent-to-own-options"),
    (roi.multi_block, "multigenerational-search"),
    (roi.land_block, "land-property-review"),
    (roi.ilc_block, "land-due-diligence-checklist"),
    (roi.loveland_block, "loveland-market-seller"),
]:
    forms = module.actual_lead_forms(make())
    assert len(forms) == 1, f"{form_name}: one lead form expected"
    assert roi.optional_sms_consent(forms[0]), f"{form_name}: optional SMS yes expected"
    assert roi.required_terms_agree(forms[0]), f"{form_name}: required Terms/Privacy box expected"
    assert roi.consent_pair(forms[0]), f"{form_name}: the consent pair expected"
    assert f'name="{form_name}"' in forms[0]
    assert f'action="/thank-you.html?from={form_name}"' in forms[0]
    for field in roi.ATTR_FIELDS:
        assert forms[0].count(f'name="{field}"') == 1

# 2026-10-07 (10DLC): the funnels carry the same PAIR of boxes as every other lead
# form -- a required Terms/Privacy box and an optional, unchecked SMS box. The exact
# wording is pinned in tests/test-consent-boxes.js; this checks the gate itself.
sms_label, terms_label = roi.CONSENT[roi.CONSENT.index('<label class="consent">', 10):], roi.CONSENT[:roi.CONSENT.index('<label class="consent">', 10)]
for malformed in [
    roi.CONSENT.replace('name="sms_consent" value="yes"', 'name="sms_consent" value="yes" required'),  # SMS box required
    roi.CONSENT.replace('name="sms_consent" value="yes"', 'name="sms_consent" value="yes" checked'),   # SMS box pre-checked
    roi.CONSENT.replace('name="sms_consent"', 'name="consent"'),                                      # wrong SMS field name
    roi.CONSENT.replace('value="yes"', 'value="no"'),                                                 # wrong values
    roi.CONSENT.replace(' required style', ' style'),                                                 # Terms box not required
    roi.CONSENT.replace('name="terms_agree"', 'name="terms"'),                                        # wrong Terms field name
    sms_label,                                                                                       # SMS box without the Terms box
    terms_label,                                                                                     # Terms box without the SMS box
    roi.CONSENT + roi.CONSENT,                                                                       # duplicated
    "",
]:
    assert not roi.consent_pair(malformed), "consent gate must reject required, pre-checked, wrong, duplicated or missing boxes"

print("Five ROI forms: required terms box, optional SMS consent, thank-you routes and attribution: PASS")
print("ROI conversion source checks: PASS")
