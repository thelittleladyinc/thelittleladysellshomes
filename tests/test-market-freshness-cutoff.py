import ast
import datetime
import pathlib
import unittest

local = pathlib.Path(__file__).with_name('build.py')
source = (local if local.exists() else pathlib.Path(__file__).resolve().parents[1] / 'build' / 'build.py').read_text()
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('_town_market_stats', '_live_market_snapshot')]
namespace = {'datetime': datetime, 'BUILD_DATE': '2026-10-04', 'TOWN_MARKET_STALE_DAYS': 3, 'COUNTIES': []}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<actual-market-functions>', 'exec'), namespace)

class MarketFreshnessTests(unittest.TestCase):
    def stats(self, date):
        namespace['TOWN_MARKET'] = {'generated_at': date, 'towns': {'Boulder': {'median_list': 500000, 'active': 2}}}
        return namespace['_town_market_stats']('Boulder')

    def test_two_days_old_is_allowed(self):
        self.assertEqual(self.stats('2026-10-02')['age_days'], 2)

    def test_three_days_and_older_are_held(self):
        for date in ['2026-10-01', '2026-09-13']:
            self.assertIsNone(self.stats(date))
            self.assertIsNone(namespace['_live_market_snapshot']())

    def test_future_date_is_held(self):
        self.assertIsNone(self.stats('2026-10-05'))
        self.assertIsNone(namespace['_live_market_snapshot']())

    def test_invalid_and_missing_are_held(self):
        self.assertIsNone(self.stats('not-a-date'))
        self.assertIsNone(self.stats(None))

    def test_actual_cutoff_constant_is_three(self):
        value = next(n.value.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TOWN_MARKET_STALE_DAYS' for t in n.targets))
        self.assertEqual(value, 3)

if __name__ == '__main__':
    unittest.main()
