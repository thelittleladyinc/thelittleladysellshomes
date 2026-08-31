#!/usr/bin/env python3
"""Production wrapper for the final traffic-growth gate.

The base engine handles the broad final-audit patterns. This wrapper also handles
the smaller community-market variant used by pages such as Laporte, where the
snapshot card/FAQ omits the price-per-square-foot sentence.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys

import postprocess_traffic_growth as engine

SITE = engine.SITE

SIMPLE_CARD_RE = re.compile(
    r'Right now there are (?P<count>[\d,]+) active listings in (?P<city>[^,<]+), '
    r'at a median asking price of (?P<price>\$[\d,]+)\. Straight from the IRES MLS feed as of '
    r'(?P<date>\d{4}-\d{2}-\d{2}) — not a figure typed into this page and left to rot\.',
    re.I,
)

SIMPLE_FAQ_RE = re.compile(
    r'As of (?P<date>\d{4}-\d{2}-\d{2}), the median asking price across the '
    r'(?P<count>[\d,]+) active listings in (?P<city>[^,]+) is (?P<price>\$[\d,]+)\. '
    r'That is live IRES MLS inventory, recomputed as listings change, not a figure typed in once\. '
    r'Asking prices are not sale prices — what homes actually close for is in the monthly Northern Colorado market report\.',
    re.I,
)


def simple_card_replacement(m: re.Match[str]) -> str:
    if not engine.is_stale(m.group("date")):
        return m.group(0)
    d = engine.parse_iso(m.group("date"))
    assert d
    return (
        f'In the IRES MLS snapshot dated {engine.nice_date(d)}, there were {m.group("count")} active '
        f'listings in {m.group("city")}, at a median asking price of {m.group("price")}. '
        'Inventory and asking prices may have changed since that refresh; the live listings below are the current search.'
    )


def simple_faq_replacement(m: re.Match[str]) -> str:
    if not engine.is_stale(m.group("date")):
        return m.group(0)
    d = engine.parse_iso(m.group("date"))
    assert d
    return (
        f'In the IRES MLS snapshot dated {engine.nice_date(d)}, the median asking price across '
        f'{m.group("count")} active listings in {m.group("city")} was {m.group("price")}. '
        'Inventory and asking prices may have changed since that refresh. Asking prices are not sale prices — '
        'what homes actually close for is in the monthly Northern Colorado market report.'
    )


def fix_simple_market(text: str) -> tuple[str, int]:
    changed = 0
    text, n = SIMPLE_CARD_RE.subn(simple_card_replacement, text)
    changed += n
    text, n = SIMPLE_FAQ_RE.subn(simple_faq_replacement, text)
    changed += n

    def fix_jsonld(m: re.Match[str]) -> str:
        nonlocal changed
        raw = m.group(1)
        try:
            obj = json.loads(raw)
        except Exception:
            return m.group(0)

        def walk(x):
            nonlocal changed
            if isinstance(x, list):
                return [walk(v) for v in x]
            if not isinstance(x, dict):
                return x
            out = {k: walk(v) for k, v in x.items()}
            ans = out.get("acceptedAnswer")
            if out.get("@type") == "Question" and isinstance(ans, dict):
                body = ans.get("text")
                if isinstance(body, str):
                    new = SIMPLE_FAQ_RE.sub(simple_faq_replacement, body)
                    if new != body:
                        ans["text"] = new
                        changed += 1
            return out

        fixed = walk(obj)
        return '<script type="application/ld+json">' + json.dumps(
            fixed, ensure_ascii=False, separators=(",", ":")
        ) + '</script>'

    text = re.sub(
        r'<script type="application/ld\+json">([\s\S]*?)</script>', fix_jsonld, text)
    return text, changed


def extra_validate() -> list[str]:
    errors: list[str] = []
    for p in SITE.glob("communities/**/*.html"):
        h = engine.read(p)
        rel = p.relative_to(SITE).as_posix()
        for m in SIMPLE_CARD_RE.finditer(h):
            if engine.is_stale(m.group("date")):
                errors.append(f"stale simple community market card remains: {rel}")
                break
        for m in SIMPLE_FAQ_RE.finditer(h):
            if engine.is_stale(m.group("date")):
                errors.append(f"stale simple community market FAQ remains: {rel}")
                break
    return errors


def main() -> int:
    rc = engine.main()
    if rc:
        return rc

    changed_paths: set[str] = set()
    fixed = 0
    for p in sorted(SITE.glob("communities/**/*.html")):
        original = engine.read(p)
        text, n = fix_simple_market(original)
        fixed += n
        if text != original:
            text = engine.touch_meaningful_freshness(text)
            engine.write_if_changed(p, text)
            changed_paths.add("/" + p.relative_to(SITE).as_posix())

    engine.update_sitemap_dates(changed_paths)
    errors = engine.validate() + extra_validate()
    if errors:
        print("!! traffic-growth v2 gate FAILED", file=sys.stderr)
        for e in errors[:80]:
            print(f"   - {e}", file=sys.stderr)
        return 1

    print(f"--- traffic-growth v2 extras OK: {fixed} simple market claims corrected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
