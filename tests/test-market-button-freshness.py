import ast
import pathlib
import re
import unittest

local_source = pathlib.Path(__file__).with_name('postprocess_audit_fixes.py')
source_path = local_source if local_source.exists() else pathlib.Path(__file__).resolve().parents[1] / 'build' / 'postprocess_audit_fixes.py'
source = source_path.read_text()
tree = ast.parse(source)
helper = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_normalize_market_search_button_style')
namespace = {'re': re}
exec(compile(ast.Module(body=[helper], type_ignores=[]), '<production-helper>', 'exec'), namespace)
normalize = namespace['_normalize_market_search_button_style']


class FreshnessTests(unittest.TestCase):
    old = '<a class="btn btn-outline" style="border-color:#141415;color:#141415" href="/search.html">Search Loveland Homes</a>'
    new = '<a class="btn btn-outline" href="/search.html">Search Loveland Homes</a>'

    def test_style_only_equal(self):
        self.assertEqual(normalize(self.old), normalize(self.new))

    def test_copy_change_remains(self):
        self.assertNotEqual(normalize(self.old), normalize(self.new.replace('Loveland', 'Windsor')))

    def test_link_change_remains(self):
        self.assertNotEqual(normalize(self.old), normalize(self.new.replace('/search.html', '/different.html')))

    def test_unrelated_styles_and_buttons_remain(self):
        for variant in [self.old.replace('#141415', '#ffffff'), self.old.replace('Search Loveland Homes', 'Ask a Question'), self.old.replace('btn-outline', 'btn-primary')]:
            self.assertEqual(normalize(variant), variant)

    def test_production_pipeline_calls_helper(self):
        pipeline = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_normalize_for_change_detection')
        self.assertTrue(any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == '_normalize_market_search_button_style' for node in ast.walk(pipeline)))


if __name__ == '__main__':
    unittest.main()
