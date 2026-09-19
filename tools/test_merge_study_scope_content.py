import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('merge', Path(__file__).with_name('merge-study-scope-content.py'))
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class MergeSafetyTests(unittest.TestCase):
    def make_complete_capture(self, directory):
        ranges = []
        for bank_index, bank in enumerate(['listening', 'radiotelephony', 'storytelling', 'opi'], 1):
            scopes = ['all' if bank in ('listening', 'storytelling') else 'base', 'required']
            for scope in scopes:
                ranges.append({'module': bank, 'scope': scope, 'directoryComplete': True, 'sections': [
                    {'section_id': bank_index, 'response_total': 1, 'collected_count': 1, 'complete': True, 'exercise_ids': [bank_index]},
                ]})
            merge.write(directory / f'section-{bank_index}-complete.json', {
                'module': bank, 'section_id': bank_index, 'completeAll': True, 'all_count': 1,
                'required_count': 1, 'missing': [], 'missingCount': 0,
                'questions': [{'exercise_id': bank_index, 'required': True}],
                'sourceRanges': [{'scope': scope, 'expectedIds': [bank_index]} for scope in scopes],
            })
        coverage = {'completeAll': True, 'uniqueSectionCount': 4, 'ranges': ranges}
        merge.write(directory / 'coverage.json', coverage)
        return coverage

    def test_complete_label_cannot_hide_missing_scope_or_question_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            coverage = self.make_complete_capture(directory)
            self.assertEqual(merge.source_coverage_errors(directory), [])
            coverage['ranges'].pop()
            merge.write(directory / 'coverage.json', coverage)
            self.assertTrue(merge.source_coverage_errors(directory))
            self.make_complete_capture(directory)
            section = merge.read(directory / 'section-4-complete.json')
            section['questions'][0]['exercise_id'] = 99
            merge.write(directory / 'section-4-complete.json', section)
            self.assertTrue(merge.source_coverage_errors(directory))

    def test_per_question_scope_required_even_when_section_is_complete(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            self.make_complete_capture(directory)
            section = merge.read(directory / 'section-4-complete.json')
            section['questions'][0]['required'] = False
            merge.write(directory / 'section-4-complete.json', section)
            self.assertTrue(any('required' in error for error in merge.source_coverage_errors(directory)))

    def test_correct_counts_cannot_hide_wrong_required_membership(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            self.make_complete_capture(directory)
            section = merge.read(directory / 'section-4-complete.json')
            section['questions'] = [{'exercise_id': 4, 'required': False}, {'exercise_id': 44, 'required': True}]
            section['all_count'] = 2
            section['sourceRanges'][0]['expectedIds'] = [4, 44]
            merge.write(directory / 'section-4-complete.json', section)
            self.assertTrue(any('required' in error and 'identities' in error for error in merge.source_coverage_errors(directory)))

    def test_base_and_required_drills_share_the_scoring_point_category(self):
        self.assertEqual(merge.scoring_point_name('【练习版】ATC clearance放行许可'), '放行许可')
        self.assertEqual(merge.scoring_point_name('采分点练习-放行许可'), '放行许可')
        self.assertEqual(merge.scoring_point_name('【练习版】Panpan&Mayday特情'), 'Panpan与Mayday')
        self.assertIsNone(merge.scoring_point_name('1-UAL805 [偏置，改航]'))

    def test_punctuation_and_question_prefix_are_not_new_questions(self):
        self.assertTrue(merge.same_question('Runway 36. Question: What happened?', 'Runway 36! Q: what happened?'))

    def test_changed_numbers_or_negation_are_not_duplicates(self):
        prefix = 'Maintain the assigned heading and report when reaching the designated reporting point. '
        for a, b in [('Mach .75', 'Mach 75'), ('3.5 miles', '35 miles'), ('FL330', 'FL340'), ('cleared', 'not cleared'), ('can accept', "can't accept")]:
            self.assertFalse(merge.same_question(prefix + a, prefix + b))

    def test_long_scenario_cannot_hide_an_operational_reversal(self):
        prefix = 'The controller issues the clearance after checking all traffic in the area. ' * 8
        for first, second in [('left', 'right'), ('climb', 'descend'), ('before', 'after'), ('above', 'below'), ('red', 'green')]:
            self.assertFalse(merge.same_question(prefix + first, prefix + second))

    def test_required_version_and_its_listening_group_survive_either_import_order(self):
        with tempfile.TemporaryDirectory() as temp:
            for source_order in [(467, 468), (468, 467)]:
                worker = merge.Merge(Path(temp), Path(temp) / 'out')
                old_card = {'id': 'old-card', 'audioText': 'Hong Kong Approach, cancel distress. What should the pilot do?'}
                topics = [{'id': topic, 'cards': [old_card] if topic == 'listening-topic-04' else []} for topic in merge.LISTENING_SECTIONS.values()]
                bank = {'id': 'listening', 'categories': [{'id': 'main', 'topics': topics}]}
                worker.by_bank = {'listening': bank}
                worker.excluded_texts = []
                worker.resource = lambda *_args: '/question-bank-assets/test.mp3'
                for section_id in source_order:
                    required = section_id == 467
                    worker.add_section({
                        'module': 'listening', 'section_id': section_id, 'name': str(section_id), 'all_count': 1, 'completeAll': True,
                        'questions': [{
                            'exercise_id': section_id, 'required': required,
                            'stem': {'text': old_card['audioText'], 'translate': '试题', 'audios': 'ignored'},
                            'single_choice': {'answer': 'A', 'options': [{'index': 'A', 'content': 'Required answer' if required else 'Ordinary answer', 'translate': '答案'}]},
                        }],
                    })
                cards = merge.all_cards(bank)
                self.assertEqual(len(cards), 1)
                self.assertEqual(cards[0][1]['id'], 'listening-topic-01')
                self.assertEqual(cards[0][2]['id'], 'old-card')
                self.assertEqual(cards[0][2]['choices'], ['Required answer'])
                self.assertEqual(cards[0][2]['studyTier'], 1)

    def test_same_callsign_and_partial_overlap_preserve_both_scenarios(self):
        first = {'cards': [{'audioText': 'UAL805, maintain 11000 meters.'}, {'audioText': 'Turn heading 130.'}]}
        partial = {'cards': first['cards'] + [{'audioText': 'Request diversion.'}]}
        different = {'cards': [first['cards'][0], {'audioText': 'Request descent.'}]}
        self.assertFalse(merge.same_scenario(first, partial))
        self.assertFalse(merge.same_scenario(first, different))
        self.assertTrue(merge.same_scenario(first, first))


if __name__ == '__main__':
    unittest.main()
