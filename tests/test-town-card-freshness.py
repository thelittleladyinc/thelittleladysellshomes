import datetime
import json
import pathlib
import sys
import unittest

# The 39 community pages carry a town card and a FAQ answer fed by
# build/data/town_market.json, which the town-market workflow refreshes every
# Monday and Thursday without committing site/. Until 2026-10-05 only the
# market report's "last refreshed" wording was read as a data date, so a
# community page fell to the committed-copy comparison and was dated with the
# deploy date on every deploy (committed loveland.html: card as of 2026-09-15
# and dated 2026-09-29, while the data said 2026-10-05). The card dates itself,
# so (CLAUDE.md, Freshness rules 1 and 4): a stamp that moved on its own is not
# an edit, figures that moved with the snapshot date the page by that snapshot,
# and anything else on the page still counts as an edit.
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'build'))
import postprocess_audit_fixes as p  # noqa: E402

PAGE = p.SITE / 'communities' / 'larimer' / 'loveland.html'


def page(asof='2026-09-15', active=624, price='$525,000', ppsf='$285',
         copy='Loveland sits where the plains meet the foothills.'):
    """A community page in the wording build.py emits (the town card, and the
    FAQ answer in the page and in its FAQPage schema), dated 2026-09-29."""
    card = (f'Right now there are {active} active listings in Loveland, at a median asking price of {price}. '
            f'That works out to about {ppsf} per square foot. Straight from the IRES MLS feed as of {asof} '
            '— not a figure typed into this page and left to rot. Search every one of them below.')
    faq = (f'As of {asof}, the median asking price across the {active} active listings in Loveland is {price}, '
           f'or about {ppsf} per square foot. That is live IRES MLS inventory, recomputed as listings change, '
           'not a figure typed in once. Asking prices are not sale prices — what homes actually close for is in '
           'the monthly Northern Colorado market report.')
    schema = json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": "What is the median home price in Loveland, CO?",
         "acceptedAnswer": {"@type": "Answer", "text": faq}}]})
    return ('<!doctype html><html><head><meta property="og:updated_time" content="2026-09-29">\n'
            '<meta name="last-modified" content="2026-09-29">\n</head><body>\n'
            f'<p>{copy}</p>\n<h3>What Homes Cost In Loveland</h3><p>{card}</p>\n<p>{faq}</p>\n'
            f'<script type="application/ld+json">{schema}</script>\n</body></html>\n')


class TownCardFreshnessTests(unittest.TestCase):
    def date_for(self, committed, current):
        original = p._committed_text
        p._committed_text = lambda path: committed
        try:
            return p._meaningful_date(PAGE, current)
        finally:
            p._committed_text = original

    def test_only_the_card_asof_changed_keeps_the_previous_date(self):
        self.assertEqual(self.date_for(page(), page(asof='2026-10-05')), datetime.date(2026, 9, 29))

    def test_unchanged_page_keeps_the_previous_date(self):
        self.assertEqual(self.date_for(page(), page()), datetime.date(2026, 9, 29))

    def test_figures_that_moved_with_the_snapshot_date_the_page_by_the_snapshot(self):
        current = page(asof='2026-10-05', active=773, price='$500,000', ppsf='$288')
        self.assertEqual(self.date_for(page(), current), datetime.date(2026, 10, 5))

    def test_an_edit_elsewhere_on_the_page_still_counts(self):
        current = page(asof='2026-10-05', active=773, price='$500,000', ppsf='$288', copy='Edited copy.')
        self.assertEqual(self.date_for(page(), current), p.TODAY)
        self.assertEqual(self.date_for(page(), page(copy='Edited copy.')), p.TODAY)

    def test_a_page_with_no_committed_copy_is_dated_today(self):
        self.assertEqual(self.date_for(None, page(asof='2026-10-05')), p.TODAY)

    def test_the_committed_community_page_carries_the_recognised_wording(self):
        committed = p._committed_text(PAGE)
        if committed is None:
            self.skipTest('no committed copy of the page (not a git checkout)')
        self.assertIsNotNone(p._town_card_asof(committed))
        normalized = p._normalize_for_change_detection(committed)
        self.assertNotIn('IRES MLS feed as of 20', normalized)
        self.assertNotIn(', the median asking price across the', normalized.replace(
            'As of DATE, the median asking price across the', ''))


if __name__ == '__main__':
    unittest.main()
