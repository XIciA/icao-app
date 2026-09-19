import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('apply_proposal', Path(__file__).with_name('apply-study-scope-proposal.py'))
apply = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apply)


class ApplyIdentityTests(unittest.TestCase):
    def test_reordered_and_moved_cards_keep_their_own_text_review(self):
        old = {'old.json': {'cards': [{'id': 'a'}, {'id': 'b', 'choices': ['yes', 'no']}]}}
        new = {'new.json': {'cards': [{'id': 'b', 'choices': ['yes', 'no']}]}}
        entry = {'file': 'old.json', 'pointer': '/cards/1/choices/1', 'bankId': 'listening', 'cardId': 'b'}
        moved = apply.relocate_entry(entry, old, new, {('listening', 'b'): ('new.json', 0, 'category', 'topic')})
        self.assertEqual(moved['pointer'], '/cards/0/choices/1')
        self.assertEqual(moved['file'], 'new.json')
        self.assertEqual(apply.value_at(new[moved['file']], moved['pointer']), 'no')
        self.assertEqual(entry['pointer'], '/cards/1/choices/1')

    def test_a_stale_pointer_cannot_be_used_to_rewrite_another_question(self):
        entry = {'file': 'old.json', 'pointer': '/cards/0/audioText', 'bankId': 'listening', 'cardId': 'b'}
        with self.assertRaisesRegex(ValueError, 'does not match'):
            apply.relocate_entry(entry, {'old.json': {'cards': [{'id': 'a'}]}}, {}, {})

    def test_removal_does_not_reassign_a_review_to_the_same_array_index(self):
        entry = {'file': 'old.json', 'pointer': '/cards/0/audioText', 'bankId': 'listening', 'cardId': 'a'}
        result = apply.relocate_entry(entry, {'old.json': {'cards': [{'id': 'a'}]}},
                                     {'old.json': {'cards': [{'id': 'b'}]}}, {('listening', 'b'): ('old.json', 0, 'category', 'topic')})
        self.assertIsNone(result)

    def test_rejects_escaping_asset_paths(self):
        with self.assertRaisesRegex(ValueError, 'escapes'):
            apply.under(Path('/safe/assets'), '../../elsewhere')


if __name__ == '__main__':
    unittest.main()
