import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('merge', Path(__file__).with_name('merge-study-scope-content.py'))
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class MergeSafetyTests(unittest.TestCase):
    def test_listening_reference_uses_display_position_instead_of_source_option_label(self):
        worker = merge.Merge.__new__(merge.Merge)
        worker.report, worker.text_corrections = {'warnings': []}, []
        worker.resource = lambda *_args: '/question-bank-assets/test.mp3'
        question = {'exercise_id': 1, 'required': True,
                    'stem': {'text': 'Question?', 'translate': '问题？'},
                    'single_choice': {'answer': 'C', 'options': [
                        {'index': 'B', 'content': 'Wrong', 'translate': '错'},
                        {'index': 'C', 'content': 'Correct', 'translate': '对'},
                        {'index': 'D', 'content': 'Another', 'translate': '其他'},
                        {'index': 'A', 'content': 'Last', 'translate': '最后'}]}}
        card = worker.normalize({'module': 'listening', 'name': '听力'}, question, 0)
        self.assertEqual(card['correctChoiceIndex'], 1)
        self.assertEqual(card['referenceText'], '正确答案：B. Correct')

    def test_reviewed_translation_can_fill_absent_field_but_not_replace_changed_source(self):
        worker = merge.Merge.__new__(merge.Merge)
        worker.report = {'warnings': []}
        worker.text_corrections = [{'sourceExerciseId': 42, 'field': 'referenceTextZh',
                                    'before': '', 'after': '已核实的翻译'}]
        section = {'module': 'opi', 'name': '样例'}
        question = {'exercise_id': 42, 'required': True,
                    'stem': {'text': 'Describe the picture.', 'translate': '描述图片。'},
                    'essay': {'answer': {'text': 'A plane.'}}}
        self.assertEqual(worker.normalize(section, question, 0)['referenceTextZh'], '已核实的翻译')
        question['essay']['answer']['translate'] = '源站新增了不同的翻译'
        with self.assertRaisesRegex(ValueError, 'Source wording changed'):
            worker.normalize(section, question, 0)

    def test_source_image_cannot_be_published_without_reviewed_redraw(self):
        url = 'https://resource.feizhiyi.com/source.png'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'capture'
            image_path = root / 'content/question-banks/resources/files/images/redrawn.png'
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b'reviewed-image')
            worker = merge.Merge.__new__(merge.Merge)
            worker.source, worker.media, worker.media_files = source, {}, {}
            worker.redraws, worker.resources, worker.report = {}, {'files': []}, {'warnings': []}
            worker.resource('opi', url, 'image')
            self.assertTrue(any(item['kind'] == 'image_redraw_required' for item in worker.report['warnings']))
            worker.media.clear()
            worker.redraws[url] = {'path': str(image_path.relative_to(root)), 'reviewed': False,
                                   'sha256': merge.hashlib.sha256(image_path.read_bytes()).hexdigest()}
            with patch.object(merge, 'ROOT', root), patch.object(merge, 'CONTENT', root / 'content/question-banks'):
                with self.assertRaisesRegex(ValueError, 'Unreviewed'):
                    worker.resource('opi', url, 'image')
                worker.redraws[url]['reviewed'] = True
                path = worker.resource('opi', url, 'image')
                self.assertEqual(path, '/question-bank-assets/images/redrawn.png')
                worker.media.clear()
                image_path.write_bytes(b'changed-after-review')
                with self.assertRaisesRegex(ValueError, 'changed after visual review'):
                    worker.resource('opi', url, 'image')

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

    def test_required_radio_answer_survives_later_ordinary_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            worker = merge.Merge(Path(temp), Path(temp) / 'out')
            worker.by_bank = {'radiotelephony': {'id': 'radiotelephony', 'categories': []}}
            worker.resource = lambda *_args: '/question-bank-assets/test.mp3'
            for required in [True, False]:
                worker.add_section({'module': 'radiotelephony', 'section_id': 1 if required else 2,
                    'name': 'UAL805 [改航]', 'all_count': 1, 'completeAll': True, 'requiredSection': required,
                    'questions': [{'exercise_id': 11 if required else 12, 'required': required,
                        'stem': {'text': 'UAL805, turn right heading 130.', 'translate': '右转航向130。', 'audios': 'ignored'},
                        'essay': {'answer': {'text': 'Required reference' if required else 'Ordinary reference', 'translate': '参考'}}}]})
            cards = merge.all_cards(worker.by_bank['radiotelephony'])
            self.assertEqual(len(cards), 1)
            self.assertEqual(cards[0][2]['referenceText'], 'Required reference')
            self.assertEqual(cards[0][1]['studyTier'], 1)

    def test_alternate_source_image_urls_resolve_to_one_picture(self):
        worker = merge.Merge.__new__(merge.Merge)
        worker.source = Path('/nonexistent-local-reference')
        worker.resource = lambda *_args: '/question-bank-assets/images/one-redraw.png'
        questions = [{'section_img': 'https://resource.feizhiyi.com/full.png',
                      'stem': {'images': ['https://resource.feizhiyi.com/other.png']}}]
        self.assertEqual(worker.opi_images(questions), ['/question-bank-assets/images/one-redraw.png'])


if __name__ == '__main__':
    unittest.main()
