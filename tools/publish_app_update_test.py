import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-app-update.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ManifestIsolationTest(unittest.TestCase):
    def test_manual_preview_preserves_every_installed_app_channel(self):
        previous = {'schemaVersion': 1, 'releases': [
            {'channel': channel, 'build': 100} for channel in
            ['android-apk', 'android-test', 'ios-app-store', 'ios-testflight']]}
        preview = {'channel': 'android-test', 'build': 200}
        result = publisher.updated_manifest(previous, preview, True)
        self.assertEqual(result['releases'], previous['releases'])
        self.assertEqual(result['manualAndroidPreview'], preview)
        self.assertNotIn('manualAndroidPreview', previous)

    def test_later_testflight_publication_preserves_manual_preview_and_other_channels(self):
        previous = {'schemaVersion': 1, 'manualAndroidPreview': {'build': 200},
                    'releases': [{'channel': 'android-test', 'build': 100},
                                 {'channel': 'ios-testflight', 'build': 100}]}
        result = publisher.updated_manifest(previous, {'channel': 'ios-testflight', 'build': 201})
        self.assertEqual(result['manualAndroidPreview'], previous['manualAndroidPreview'])
        self.assertEqual(result['releases'][0], previous['releases'][0])
        self.assertEqual(result['releases'][1]['build'], 201)

    def test_manual_publication_rejects_non_android_release(self):
        with self.assertRaises(ValueError):
            publisher.updated_manifest({'releases': []}, {'channel': 'ios-testflight'}, True)


if __name__ == '__main__':
    unittest.main()
