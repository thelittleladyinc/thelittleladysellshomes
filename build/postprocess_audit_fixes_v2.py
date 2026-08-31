#!/usr/bin/env python3
"""Execution wrapper for postprocess_audit_fixes with honest change dating.

The engine contains the individual fixes.  This wrapper deliberately computes a
page's meaningful modification date BEFORE adding analytics/routing infrastructure,
so a tracking or internal-link normalization change does not make every URL look
fresh to Google.
"""
from postprocess_audit_fixes import (
    SITE,
    _analytics_asset,
    _fix_eaton,
    _fix_homepage_faq,
    _fix_meta_lead_tracking,
    _fix_rent_to_own,
    _fix_stale_market,
    _html_files,
    _inject_analytics_asset,
    _meaningful_date,
    _read,
    _redirect_map,
    _rewrite_internal_redirect_links,
    _set_freshness,
    _strip_public_gsc_counts,
    _ensure_confirmed_meta_lead,
    _update_sitemap_dates,
    _validate,
    _write,
)
import sys


def _content_level_fixes(rel: str, text: str) -> str:
    """Changes a reader/crawler could reasonably call page-content changes."""
    text = _strip_public_gsc_counts(text)
    if rel == "index.html":
        text = _fix_homepage_faq(text)
    if rel == "discovering-eaton-colorado-on-the-northern-plains.html":
        text = _fix_eaton(text)
    if rel == "rent-to-own.html":
        text = _fix_rent_to_own(text)
    text, _ = _fix_stale_market(text)
    return text


def main() -> int:
    if not SITE.is_dir():
        print("postprocess: site/ not found", file=sys.stderr)
        return 2

    redirects = _redirect_map()
    analytics_rel = _analytics_asset()
    total_redirect_links = 0
    changed_pages = 0

    for path in _html_files():
        original = _read(path)
        rel = path.relative_to(SITE).as_posix()

        # First decide whether the actual page CONTENT changed.  Do not let a
        # Pixel fix, event script, asset hash, or href cleanup create fake SEO
        # freshness across the whole site.
        content_basis = _content_level_fixes(rel, original)
        page_date = _meaningful_date(path, content_basis)

        # Now apply output/infrastructure fixes.  These are real improvements,
        # but not a reason to tell Google that the article itself was rewritten.
        text = _fix_meta_lead_tracking(content_basis)
        if rel == "thank-you.html":
            text = _ensure_confirmed_meta_lead(text)

        text, nlinks = _rewrite_internal_redirect_links(text, redirects)
        total_redirect_links += nlinks
        text = _inject_analytics_asset(text, analytics_rel)
        text = _set_freshness(
            text,
            page_date,
            homepage=(rel == "index.html"),
            rent_to_own=(rel == "rent-to-own.html"),
        )

        if text != original:
            _write(path, text)
            changed_pages += 1

    _update_sitemap_dates()
    errors = _validate(redirects, analytics_rel)
    if errors:
        print("!! postprocess audit gate FAILED", file=sys.stderr)
        for e in errors[:50]:
            print(f"   - {e}", file=sys.stderr)
        if len(errors) > 50:
            print(f"   ... and {len(errors) - 50} more", file=sys.stderr)
        return 1

    print(f"--- postprocess audit gate OK: {changed_pages} HTML files normalized")
    print(f"--- internal redirect hops removed: {total_redirect_links}")
    print(f"--- analytics asset: {analytics_rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
