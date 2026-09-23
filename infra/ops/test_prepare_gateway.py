import pathlib
import unittest
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('gateway', pathlib.Path(__file__).with_name('prepare-gateway.py'))
module = module_from_spec(spec)
spec.loader.exec_module(module)

class GatewayTest(unittest.TestCase):
    def test_only_api_site_changes_and_repeated_release_is_stable(self):
        source = (pathlib.Path(__file__).parents[1] / 'gateway/Caddyfile').read_text()
        current = '{\n admin 127.0.0.1:2019\n}\napi.readyoufife.com {\n reverse_proxy 127.0.0.1:3101\n}\ncloud.readyoufife.com {\n reverse_proxy 127.0.0.1:8000\n}\n'
        candidate = module.prepare(current, source)
        self.assertIn('handle_path /admin/* {', candidate)
        self.assertTrue(candidate.endswith('cloud.readyoufife.com {\n reverse_proxy 127.0.0.1:8000\n}\n'))
        self.assertEqual(module.prepare(candidate, source), candidate)
        self.assertNotIn('blocked_auth', candidate)
    def test_missing_or_duplicate_site_fails(self):
        for current in ['', 'api.readyoufife.com {\n}\napi.readyoufife.com {\n}\n']:
            with self.assertRaises(ValueError):
                module.prepare(current, '')

if __name__ == '__main__':
    unittest.main()
