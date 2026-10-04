import ast
import datetime
import pathlib
import unittest

# The town figures (build/data/town_market.json) stay on the pages for 21 days
# and are withheld after that, or when dated in the future. Ageing inside that
# window is handled downstream: build/postprocess_traffic_growth.py re-words a
# "Right now ... as of <date>" card more than 3 days old as a dated MLS snapshot,
# so the number stays on the page with its date (CLAUDE.md, Market-report
# truthfulness rule 1) and the page keeps its snapshot date (Freshness rule 4).
# Hiding the figures sooner (tried at 3 days on 2026-10-04) made a Sunday deploy
# drop the card, the FAQ answer and the market report's live block.
local = pathlib.Path(__file__).with_name('build.py')
source = (local if local.exists() else pathlib.Path(__file__).resolve().parents[1] / 'build' / 'build.py').read_text()
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('_town_market_stats', '_live_market_snapshot')]
namespace = {'datetime': datetime, 'BUILD_DATE': '2026-10-04', 'TOWN_MARKET_STALE_DAYS': 21, 'COUNTIES': []}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<actual-market-functions>', 'exec'), namespace)

class MarketFreshnessTests(unittest.TestCase):
    def stats(self, date):
        namespace['TOWN_MARKET'] = {'generated_at': date, 'towns': {'Boulder': {'median_list': 500000, 'active': 2}}}
        return namespace['_town_market_stats']('Boulder')

    def test_recent_figures_are_shown(self):
        self.assertEqual(self.stats('2026-10-02')['age_days'], 2)
        self.assertEqual(self.stats('2026-10-01')['age_days'], 3)

    def test_figures_up_to_21_days_old_are_shown(self):
        self.assertEqual(self.stats('2026-09-13')['age_days'], 21)

    def test_older_figures_are_held(self):
        for date in ['2026-09-12', '2026-08-01']:
            self.assertIsNone(self.stats(date))
            self.assertIsNone(namespace['_live_market_snapshot']())

    def test_future_date_is_held(self):
        self.assertIsNone(self.stats('2026-10-05'))
        self.assertIsNone(namespace['_live_market_snapshot']())

    def test_invalid_and_missing_are_held(self):
        self.assertIsNone(self.stats('not-a-date'))
        self.assertIsNone(self.stats(None))

    def test_actual_cutoff_constant_is_21(self):
        value = next(n.value.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TOWN_MARKET_STALE_DAYS' for t in n.targets))
        self.assertEqual(value, 21)

if __name__ == '__main__':
    unittest.main()
