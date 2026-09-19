#!/usr/bin/env python3
"""Prepare a reviewable, deterministic content proposal from sanitized source exports.

Never fetches authenticated pages or mutates the live database. Source exports and
downloaded media stay local; only the canonical proposed bank data is delivered.
Writes a local proposal only. Partial captures remain explicitly partial.
"""
import argparse
import copy
import hashlib
import html
import json
import re
import subprocess
from collections import Counter
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content/question-banks'
REMOVED = {'listening-main-927', 'listening-main-779', 'listening-main-981', 'listening-main-077'}
REMOVED_SOURCE_EXERCISES = {116599}  # Same Hawaii/large-bang question, rewritten transcript.
CRASH_REVIEW_EXCLUSIONS = {
    'listening-main-662': 'Oxygen concentration/partial-pressure wording needs separate clarification.',
    'listening-main-645': 'A single universal ATC frequency is misleading.',
    'listening-main-261': 'Military emergency-frequency detail is not a core first-pass priority.',
    'listening-fzy-116696': 'Garbled localizer transcript is unsuitable for the short core selection.',
    'listening-fzy-116580': 'Garbled localizer transcript is unsuitable for the short core selection.',
    'listening-fzy-116733': 'Garbled flight-director description needs clarification.',
    'listening-fzy-226625': 'Solar-flare mechanism is less useful than core operational listening.',
}
LISTENING_SECTIONS = {467: 'listening-topic-01', 468: 'listening-topic-04', 469: 'listening-topic-03', 470: 'listening-topic-02'}
SOURCE_RANGES = {
    ('listening', 'all'), ('listening', 'required'),
    ('radiotelephony', 'base'), ('radiotelephony', 'required'),
    ('storytelling', 'all'), ('storytelling', 'required'),
    ('opi', 'base'), ('opi', 'required'),
}
FOUNDATIONS = [
    ('气象与天气', r'weather|wind|visibility|fog|icing|ice |turbulence|thunderstorm|rain'),
    ('跑道与滑行', r'runway|taxi|holding point|hold short|pushback|clearance'),
    ('起飞与进近', r'takeoff|take.off|approach|landing|land |go.around|departure'),
    ('通信与管制', r'readback|read.back|communication|frequency|radio|contact|controller|heading|altitude'),
    ('机组与协作', r'crew|fatigue|human|workload|team|stress|pilot|training'),
    ('常见特情', r'emergency|failure|smoke|fire|bird|divert|medical|passenger|fuel'),
    ('飞机基础', r'engine|aircraft|brake|gear|flap|pressur|stall|oxygen'),
]


def foundation_tags(value):
    return [label for label, pattern in FOUNDATIONS if re.search(pattern, value, re.I)] or ['日常航空英语']


def balanced_foundations(candidates, count):
    """Deterministic first pass, followed by the generated human-readable review.

    Prefer common operational themes, readable lengths and topic diversity. This
    is a study-content heuristic, not a statistical claim about exam frequency.
    Each candidate is (stable ID, text, grouping key, payload).
    """
    remaining = list(candidates)
    chosen, tags_used, groups_used = [], Counter(), Counter()
    while remaining and len(chosen) < count:
        def score(item):
            identity, value, group, _ = item
            tags = foundation_tags(value)
            unusual = bool(re.search(r'bernoulli|venturi|coffin corner|gyroscopic|hypersonic|critical mach|anti.missile|terroris', value, re.I))
            words = len(re.findall(r"[A-Za-z]+", value))
            quality = 3 if 15 <= words <= 260 else 1 if words < 15 else -min(6, (words - 260) / 180)
            novelty = sum(1 / (1 + tags_used[tag]) for tag in tags)
            return (novelty * 10 + quality - groups_used[group] * 2 - unusual * 20, identity)
        best = max(remaining, key=score)
        remaining.remove(best)
        chosen.append(best)
        tags_used.update(foundation_tags(best[1]))
        groups_used[best[2]] += 1
    return chosen


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def source_coverage_errors(source):
    """Validate independent directory evidence, not a filename saying complete.

    Source directory counts for radio/picture topics count whole topics, while
    response_total counts cards; those two units must not be compared blindly.
    """
    coverage_path = source / 'coverage.json'
    if not coverage_path.exists():
        return ['Missing coverage.json']
    coverage = read(coverage_path)
    errors, expected = [], {}
    ranges = coverage.get('ranges', [])
    keys = [(item['module'], item['scope']) for item in ranges]
    if set(keys) != SOURCE_RANGES or len(keys) != len(set(keys)):
        errors.append('Source module/scope directories are missing or duplicated')
    if not coverage.get('completeAll'):
        errors.append('Source capture is explicitly incomplete')
    for entry in ranges:
        module, scope = entry['module'], entry['scope']
        if not entry.get('directoryComplete') or not entry.get('sections'):
            errors.append(f'{module}/{scope}: directory incomplete')
        section_ids = set()
        for section in entry.get('sections', []):
            section_id = int(section['section_id'])
            if section_id in section_ids:
                errors.append(f'{module}/{scope}: duplicate section {section_id}')
            section_ids.add(section_id)
            expected.setdefault(section_id, []).append((module, scope, section))
            total = section.get('response_total')
            if not section.get('complete') or not isinstance(total, int) or total <= 0 or section.get('collected_count') != total:
                errors.append(f'{module}/{scope}/{section_id}: cards incomplete')
    files = {int(path.stem.split('-')[1]): path for path in source.glob('section-*-complete.json')}
    if set(files) != set(expected):
        errors.append(f'Section file coverage differs: missing {len(set(expected)-set(files))}, unexpected {len(set(files)-set(expected))}')
    if coverage.get('uniqueSectionCount') != len(expected):
        errors.append('Unique directory section count is inconsistent')
    for section_id, entries in expected.items():
        if section_id not in files:
            continue
        section = read(files[section_id])
        questions = section.get('questions', [])
        ids = {question['exercise_id'] for question in questions}
        if len(ids) != len(questions) or section.get('all_count') != len(ids) or not section.get('completeAll') or section.get('missing') or section.get('missingCount'):
            errors.append(f'{section_id}: normalized union is incomplete or duplicated')
        if any(not isinstance(question.get('required'), bool) for question in questions):
            errors.append(f'{section_id}: missing per-question required membership')
        required_ids = {question['exercise_id'] for question in questions if question.get('required')}
        if len(required_ids) != section.get('required_count'):
            errors.append(f'{section_id}: required count is inconsistent')
        for module, scope, evidence in entries:
            if section.get('module') != module:
                errors.append(f'{section_id}: wrong destination module')
            if scope == 'required' and len(required_ids) != evidence.get('response_total'):
                errors.append(f'{section_id}: required membership differs from source directory')
            declared_ids = evidence.get('exercise_ids')
            if declared_ids is not None and (len(declared_ids) != evidence.get('response_total') or not set(declared_ids).issubset(ids)):
                errors.append(f'{section_id}/{scope}: source question identities are missing')
        # A scope can share question IDs with another scope. Validate the source
        # answer-card IDs where captured, instead of adding scope totals together.
        for entry in section.get('sourceRanges', []):
            known_ids = entry.get('expectedIds', [])
            if known_ids and not set(known_ids).issubset(ids):
                errors.append(f'{section_id}/{entry["scope"]}: answer-card identities are missing')
    return errors


def scoring_point_name(name):
    if '采分点' not in name and '练习版' not in name:
        return None
    for pattern, label in [
        ('放行许可', '放行许可'), ('滑行指令', '滑行指令'), ('初始联系', '初始联系'),
        ('报告情况', '报告情况'), ('陈述意图|说明意图', '陈述意图'), ('位置报', '位置报'),
        ('复杂指令', '复杂指令'), ('panpan|mayday', 'Panpan与Mayday'), ('传话', '传话'),
    ]:
        if re.search(pattern, name, re.I):
            return label
    raise ValueError(f'Unknown scoring-point category: {name}')


def text(value):
    # Strip presentation markup, never words, units, flight numbers or negation.
    value = re.sub(r'<br\s*/?>', '\n', str(value or ''), flags=re.I)
    value = re.sub(r'<[^>]+>', '', value)
    return html.unescape(value).replace('\r\n', '\n').strip()


@lru_cache(maxsize=30000)
def fingerprint(value):
    value = text(value).lower().replace('’', "'")
    value = re.sub(r'\b(?:question|q)\s*:', '', value)
    value = re.sub(r'^[abc]\s*:\s*', '', value)
    return re.sub(r'[^a-z0-9]', '', value)


@lru_cache(maxsize=30000)
def semantic_guard(value):
    numbers = tuple(re.sub(r'(?<=\d),(?=\d{3}(?:\D|$))', '', item) for item in re.findall(r'[+-]?(?:\d+(?:[.,]\d+)*|\.\d+)', value))
    negations = tuple(bool(re.search(r'\b' + word + r'\b', value, re.I)) for word in ['not', 'no', 'unable', 'negative', 'without', "can't", 'cannot', "won't", "isn't", "aren't", "doesn't", "don't", "shouldn't"])
    return numbers, negations


def same_question(left, right):
    """Conservative auto-merge; changed numbers/negation never count as duplicates."""
    a, b = fingerprint(left), fingerprint(right)
    if not a or not b:
        return False
    if semantic_guard(left) != semantic_guard(right):
        return False
    if a == b:
        return True
    if min(len(a), len(b)) < 70 or min(len(a), len(b)) / max(len(a), len(b)) < .965:
        return False
    return SequenceMatcher(None, a, b, autojunk=False).ratio() >= .98


def same_scenario(left, right):
    # Compare every ordered instruction in the entire scenario. A shared callsign
    # or an overlapping prefix does not justify discarding either scenario.
    return len(left['cards']) == len(right['cards']) and all(
        same_question(a.get('audioText', ''), b.get('audioText', ''))
        for a, b in zip(left['cards'], right['cards'])
    )


def banks_from_sources():
    banks = []
    for bank_id in read(CONTENT / 'registry.json')['bankIds']:
        base = CONTENT / 'banks' / bank_id
        bank = read(base / 'bank.json')
        bank['categories'] = []
        for category_id in bank.pop('categoryIds'):
            category = read(base / 'categories' / (category_id + '.json'))
            category['topics'] = []
            for topic_id in category.pop('topicIds'):
                topic = read(base / 'topics' / (topic_id + '.json'))
                topic.pop('categoryId', None)
                category['topics'].append(topic)
            bank['categories'].append(category)
        banks.append(bank)
    return banks


def all_cards(bank):
    return [(category, topic, card) for category in bank['categories'] for topic in category['topics'] for card in topic['cards']]


class Merge:
    def __init__(self, source, output):
        self.source, self.output = source, output
        self.banks = banks_from_sources()
        self.by_bank = {bank['id']: bank for bank in self.banks}
        self.resources = read(CONTENT / 'resources/manifest.source.json')
        self.report = {'merged': [], 'added': [], 'removed': [], 'warnings': [], 'sources': [], 'classification': []}
        self.media = {}
        self.media_files = {}
        self.aliases = {}
        self.baseline = copy.deepcopy(self.banks)
        contract = (ROOT / 'packages/contracts/src/index.ts').read_text()
        self.free_ids = set(re.findall(r"'(?:listening-main-\d+|story-wing-\d+)'", contract))
        self.free_ids = {value.strip("'") for value in self.free_ids}
        self.hotspot_ids = {card_id for brief in read(CONTENT / 'opi-hotspots.json')['briefs'] for topic in brief['topics'] for card_id in topic['cardIds']}
        self.excluded_texts = []
        for _, _, card in all_cards(self.by_bank['listening']):
            if card['id'] in REMOVED:
                self.excluded_texts.append(card['audioText'])
        for bank in self.banks:
            for category in bank['categories']:
                for topic in category['topics']:
                    topic.pop('studyTier', None)
                    for card in topic['cards']:
                        card.pop('studyTier', None)
                    topic['cards'] = [card for card in topic['cards'] if card['id'] not in REMOVED and not (bank['id'] == 'listening' and any(same_question(card.get('audioText', ''), removed) for removed in self.excluded_texts))]
        self.report['removed'] = sorted(REMOVED)
        remaining = {card['id'] for bank in self.banks for _, _, card in all_cards(bank)}
        self.report['removed'] += sorted({card['id'] for bank in self.baseline for _, _, card in all_cards(bank)} - remaining - REMOVED)
        # Canonicalise existing exact duplicates before adding a new source.
        # Scenarios retain their ordered context; individual radio instructions
        # are deliberately not deduplicated across different complete scenes.
        for bank in self.banks:
            if bank['id'] not in ('listening', 'storytelling'):
                continue
            seen = {}
            for _, topic, card in sorted(all_cards(bank), key=lambda row: (row[2]['id'] not in self.free_ids, row[2]['id'])):
                key = fingerprint(card.get('audioText', ''))
                if key and key in seen and same_question(seen[key].get('audioText', ''), card.get('audioText', '')):
                    topic['cards'].remove(card)
                    self.aliases[card['id']] = seen[key]['id']
                    self.report['merged'].append({'bank': bank['id'], 'sourceId': card['id'], 'cardId': seen[key]['id'], 'reason': 'existing-exact-copy'})
                else:
                    seen[key] = card

    def resource(self, bank_id, url, kind='audio'):
        if not isinstance(url, str) or not url.startswith('https://resource.feizhiyi.com/'):
            raise ValueError(f'Unsupported {kind} resource: {url!r}')
        key = (bank_id, url, kind)
        if key in self.media:
            return self.media[key]
        suffix = '.mp3' if kind == 'audio' else ('.png' if '.png' in url.lower() else '.jpg')
        identity = hashlib.sha256(url.encode()).hexdigest()[:20]
        source_path = f'{"audio" if kind == "audio" else "images"}/{bank_id}/fzy/{identity}{suffix}'
        public_path = '/question-bank-assets/' + source_path
        local = self.source / 'media' / (identity + suffix)
        self.media[key] = public_path
        self.media_files[public_path] = {'source': str(local), 'sourceRelativePath': source_path}
        if local.exists():
            body = local.read_bytes()
            digest = hashlib.sha256(body).hexdigest()
            existing = next((item for item in self.resources['files'] if item['checksum'] == digest and item['bankId'] == bank_id), None)
            if existing:
                self.media[key] = existing['publicPath']
                self.media_files.pop(public_path, None)
                return existing['publicPath']
            record = {'objectKey': 'v1/' + source_path, 'bankId': bank_id, 'sourceRelativePath': source_path,
                      'publicPath': public_path, 'sizeBytes': len(body), 'mimeType': 'audio/mpeg' if kind == 'audio' else ('image/png' if suffix == '.png' else 'image/jpeg'),
                      'checksum': digest, 'status': 'ready'}
            if kind == 'audio':
                duration = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(local)], text=True, stderr=subprocess.DEVNULL)
                record['durationSeconds'] = round(float(duration.strip()), 3)
                if record['durationSeconds'] <= 0:
                    raise ValueError('Invalid audio duration')
            if not any(item['publicPath'] == public_path for item in self.resources['files']):
                self.resources['files'].append(record)
        else:
            self.report['warnings'].append({'kind': 'media_missing', 'path': public_path, 'url': url})
        return public_path

    def normalize(self, section, question, index):
        bank_id = section['module']
        stem = question['stem']
        required = question.get('required')
        tier = int(required if isinstance(required, bool) else (section.get('requiredSection') or 2 in question.get('business_tag_ids', [])))
        card = {'id': f'{bank_id}-fzy-{question["exercise_id"]}', 'taskTitle': f'{section["name"]}-{index + 1}',
                'audioText': text(stem.get('text')), 'audioTextZh': text(stem.get('translate')), 'studyTier': tier}
        answer = question.get('essay', {}).get('answer', {})
        for dest, key in [('referenceText', 'text'), ('referenceTextZh', 'translate')]:
            value = re.sub(r'^参考答案\s*[:：]\s*', '', text(answer.get(key)))
            if value:
                card[dest] = value
        if bank_id == 'listening':
            choice = question['single_choice']
            card['choices'] = [text(item['content']) for item in choice['options']]
            card['choicesZh'] = [text(item.get('translate')) for item in choice['options']]
            labels = [item['index'] for item in choice['options']]
            card['correctChoiceIndex'] = labels.index(choice['answer'])
            card['referenceText'] = f'正确答案：{choice["answer"]}. {card["choices"][card["correctChoiceIndex"]]}'
        if bank_id != 'opi':
            card['audio'] = self.resource(bank_id, stem.get('audios'))
        if not card['audioText'] or not card['audioTextZh']:
            self.report['warnings'].append({'kind': 'missing_text', 'id': card['id']})
        return card

    def category(self, bank, category_id, name):
        existing = next((item for item in bank['categories'] if item['id'] == category_id), None)
        if existing:
            return existing
        category = {'id': category_id, 'name': name, 'nameEn': name, 'declaredTopicCount': 0, 'declaredCardCount': 0, 'topics': []}
        bank['categories'].append(category)
        return category

    def opi_category(self, name):
        for pattern, category_id in [('图片|picture|image|figure', 'opi-category-08'), ('气象|天气|weather|lightning|icing|visibility|micro.?burst|cross.?wind|sandstorm|thunderstorm', 'opi-category-01'), ('特情|应急|非正常|emergency|incidents|accidents|bird.strike|ditch|fire', 'opi-category-02'), ('缩略|术语|abbreviation', 'opi-category-03'), ('人为|人的因素|机组|human|health|fatigue', 'opi-category-04'), ('运行|飞行程序|机场|训练|理论学习|operation|airport|flight.manual|pushback|drone', 'opi-category-05'), ('系统|航空器|飞机|驾驶舱|aircraft|cockpit|engine', 'opi-category-06')]:
            if re.search(pattern, name, re.I):
                return category_id
        return 'opi-category-07'

    def opi_images(self, questions):
        images = []
        for question in questions:
            shared = question.get('section_img')
            if shared and shared not in images:
                images.append(shared)
            for url in question['stem'].get('images') or []:
                # Source stem previews may be a 36-pixel thumbnail of section_img.
                # Retain the full shared illustration instead of that thumbnail.
                identity = hashlib.sha256(url.encode()).hexdigest()[:20]
                suffix = '.png' if '.png' in url.lower() else '.jpg'
                local = self.source / 'media' / (identity + suffix)
                if shared and local.exists():
                    dimensions = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', str(local)], text=True, stderr=subprocess.DEVNULL)
                    size = json.loads(dimensions)['streams'][0]
                    if max(size['width'], size['height']) <= 64:
                        continue
                if url not in images:
                    images.append(url)
        return [self.resource('opi', url, 'image') for url in images]

    def add_section(self, section):
        bank = self.by_bank[section['module']]
        section_id = int(section['section_id'])
        # sourceOrder is captured from the visible answer-card sequence. The
        # source's generic sort field is often constant and is not that sequence.
        questions = sorted(section['questions'], key=lambda question: question.get('sourceOrder', 0))
        if len({item['exercise_id'] for item in questions}) != len(questions):
            raise ValueError(f'Duplicate section question {section_id}')
        self.report['sources'].append({key: value for key, value in section.items() if key != 'questions'})
        if section.get('missing') or len(questions) != section.get('all_count') or not section.get('completeAll'):
            self.report['warnings'].append({'kind': 'source_partial', 'section': section_id})
            if bank['id'] == 'radiotelephony':
                return  # Never preview half a scenario as a complete scene.
        cards = [self.normalize(section, question, index) for index, question in enumerate(questions)
                 if not (bank['id'] == 'listening' and int(question['exercise_id']) in REMOVED_SOURCE_EXERCISES)]
        for question in questions:
            if bank['id'] == 'listening' and int(question['exercise_id']) in REMOVED_SOURCE_EXERCISES:
                self.report['removed'].append(f'listening-fzy-{question["exercise_id"]}')
        scoring = scoring_point_name(section['name']) if bank['id'] == 'radiotelephony' else None
        if scoring:
            category = self.category(bank, 'atc-scoring-points', '采分点')
            target = next((topic for topic in category['topics'] if topic['name'] == scoring), None)
            if target is None:
                target = {'id': f'atc-fzy-{section_id}', 'name': scoring, 'declaredCardCount': 0, 'practiceKind': 'scoring-points', 'cards': []}
                category['topics'].append(target)
        elif bank['id'] == 'radiotelephony':
            name = re.sub(r'^\d+[-、.\s]*', '', section['name']).replace('采分点练习-', '').strip()
            callsign = re.search(r'\b([A-Z]{3})\s*\d+', name)
            if not scoring and not callsign:
                raise ValueError(f'Missing callsign for complete scenario {section_id}: {name}')
            code = callsign.group(1) if callsign else ''
            category = self.category(bank, 'atc-' + code.lower(), code)
            tier = 1 if section.get('requiredSection') else 0
            topic = {'id': f'atc-fzy-{section_id}', 'name': name, 'declaredCardCount': len(cards), 'studyTier': tier,
                     'practiceKind': 'scenario', 'cards': cards}
            for card in cards:
                card.pop('studyTier', None)
            duplicate = next((item for cat in bank['categories'] for item in cat['topics'] if item.get('practiceKind') != 'scoring-points' and not scoring and same_scenario(item, topic)), None)
            if duplicate:
                topic['studyTier'] = max(topic['studyTier'], duplicate.get('studyTier', 0))
                for old, new in zip(duplicate['cards'], cards):
                    new['id'] = old['id']
                topic['id'] = duplicate['id']
                duplicate.update(topic)
                self.report['merged'].append({'bank': bank['id'], 'section': section_id, 'topicId': duplicate['id'], 'reason': 'complete-ordered-scene'})
            else:
                category['topics'].append(topic)
                self.report['added'].append({'bank': bank['id'], 'section': section_id, 'topicId': topic['id']})
            return
        if bank['id'] == 'listening':
            target = next(topic for cat in bank['categories'] for topic in cat['topics'] if topic['id'] == LISTENING_SECTIONS[section_id])
        elif bank['id'] == 'storytelling':
            target = next(topic for cat in bank['categories'] for topic in cat['topics'] if topic['id'] == 'story-flight-required')
        elif bank['id'] == 'opi':
            images = self.opi_images(questions)
            category_id = 'opi-category-08' if images else self.opi_category(section['name'])
            category = next(cat for cat in bank['categories'] if cat['id'] == category_id)
            target = {'id': f'opi-fzy-{section_id}', 'name': section['name'].split('/')[-1], 'declaredCardCount': 0, 'cards': []}
            image_tier = max((card['studyTier'] for card in cards), default=0)
            for index, path in enumerate(images):
                target['cards'].append({'id': f'opi-fzy-{section_id}-image-{index+1}', 'kind': 'image', 'taskTitle': f'{target["name"]} · 看图材料',
                                        'image': path, 'imageAlt': f'{target["name"]}，用于本话题的看图描述和问答', 'studyTier': image_tier})
            category['topics'].append(target)
        for card in cards:
            if bank['id'] == 'listening' and any(same_question(card['audioText'], removed) for removed in self.excluded_texts):
                self.report['removed'].append(card['id'])
                continue
            # Search the whole bank, not only the selected target category.
            image_context = {item['image'] for item in target['cards'] if item.get('kind') == 'image'}
            matches = [(old_topic, existing) for _, old_topic, existing in all_cards(bank)
                       if existing.get('kind') != 'image'
                       and (not scoring or old_topic is target)
                       and (bank['id'] != 'opi' or image_context == {item['image'] for item in old_topic['cards'] if item.get('kind') == 'image'})
                       and same_question(existing.get('audioText', ''), card['audioText'])]
            matches.sort(key=lambda row: (row[1]['id'] not in self.free_ids, row[1]['id'] not in self.hotspot_ids, '-fzy-' in row[1]['id'], row[1]['id']))
            duplicate = matches[0][1] if matches else None
            if duplicate:
                source_id = card['id']
                card['id'] = duplicate['id']
                card['studyTier'] = max(card['studyTier'], duplicate.get('studyTier', 0))
                similarity = SequenceMatcher(None, fingerprint(duplicate.get('audioText', '')), fingerprint(card['audioText']), autojunk=False).ratio()
                duplicate.clear()
                duplicate.update(card)
                self.report['merged'].append({'bank': bank['id'], 'sourceId': source_id, 'cardId': card['id'], 'reason': 'same-question', 'similarity': round(similarity, 5)})
                for old_topic, extra in matches[1:]:
                    duplicate['studyTier'] = max(duplicate['studyTier'], extra.get('studyTier', 0))
                    old_topic['cards'].remove(extra)
                    self.aliases[extra['id']] = card['id']
                    self.report['merged'].append({'bank': bank['id'], 'sourceId': extra['id'], 'cardId': card['id'], 'reason': 'same-question-existing-copy'})
            else:
                target['cards'].append(card)
                self.report['added'].append({'bank': bank['id'], 'cardId': card['id'], 'topicId': target['id']})

    def finish(self):
        crash = []
        for bank in self.banks:
            if bank['id'] == 'sentences900':
                continue
            if bank['id'] == 'radiotelephony':
                candidates = []
                for category in bank['categories']:
                    for topic in category['topics']:
                        if topic.get('practiceKind') == 'scoring-points':
                            for card in topic['cards']:
                                if card.get('studyTier', 0) >= 1:
                                    card['studyTier'] = 2
                            continue
                        if topic.get('studyTier', 0) < 1:
                            continue
                        value = '\n'.join(card.get('audioText', '') for card in topic['cards'])
                        candidates.append((topic['id'], value, category['id'], topic))
                groups = [(candidates, 30)]
            else:
                candidates = [(card['id'], card.get('audioText', ''), topic['id'], card) for _, topic, card in all_cards(bank)
                              if card.get('studyTier', 0) >= 1 and card.get('kind') != 'image' and card['id'] not in CRASH_REVIEW_EXCLUSIONS]
                groups = [([item for item in candidates if item[2] == topic_id], 25) for topic_id in LISTENING_SECTIONS.values()] if bank['id'] == 'listening' else [(candidates, 20 if bank['id'] == 'storytelling' else 60)]
            for candidates, count in groups:
                if len(candidates) < count:
                    self.report['warnings'].append({'kind': 'crash_pool_incomplete', 'bank': bank['id'], 'available': len(candidates), 'required': count})
                for identity, value, group, item in balanced_foundations(candidates, count):
                    item['studyTier'] = 2
                    crash.append({'bank': bank['id'], 'id': identity, 'group': group, 'themes': foundation_tags(value), 'text': value})
            if bank['id'] == 'opi':
                for category in bank['categories']:
                    for topic in category['topics']:
                        # Supporting diagrams follow the selected questions and
                        # do not consume one of the 60 spoken-question places.
                        tier = max((card.get('studyTier', 0) for card in topic['cards'] if card.get('kind') != 'image'), default=0)
                        for card in topic['cards']:
                            if card.get('kind') == 'image':
                                card['studyTier'] = tier
        for bank in self.banks:
            for category in bank['categories']:
                category['topics'] = [topic for topic in category['topics'] if topic['cards']]
                for topic in category['topics']:
                    topic['declaredCardCount'] = len(topic['cards'])
                category['declaredTopicCount'] = len(category['topics'])
                category['declaredCardCount'] = sum(topic['declaredCardCount'] for topic in category['topics'])
            bank['categories'] = [cat for cat in bank['categories'] if cat['topics']]
            bank['declaredTopicCount'] = sum(cat['declaredTopicCount'] for cat in bank['categories'])
            bank['declaredCardCount'] = sum(cat['declaredCardCount'] for cat in bank['categories'])
            bank['summary'] = f'{bank["declaredTopicCount"]} {bank["topicUnit"]} / {bank["declaredCardCount"]} {bank["cardUnit"]}'
        self.report['counts'] = {bank['id']: {'all': bank['declaredCardCount'], **{name: sum(topic.get('studyTier', card.get('studyTier', 2 if bank['id'] == 'sentences900' else 0)) >= threshold for _, topic, card in all_cards(bank)) for name, threshold in [('selected', 1), ('crash', 2)]}} for bank in self.banks}
        write(self.output / 'crash-selection-review.json', crash)
        self.report['crashReviewExclusions'] = CRASH_REVIEW_EXCLUSIONS
        write(self.output / 'proposal.json', self.banks)
        write(self.output / 'resources.json', self.resources)
        write(self.output / 'media-files.json', self.media_files)
        write(self.output / 'merge-report.json', self.report)
        write(self.output / 'id-alias-review.json', self.aliases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.generated/feixingzhiyi-full-20260920')
    parser.add_argument('--output', type=Path, default=ROOT / '.generated/study-scope-content-proposal')
    parser.add_argument('--require-complete', action='store_true', help='Refuse incomplete source coverage or proposal warnings')
    args = parser.parse_args()
    coverage_errors = source_coverage_errors(args.source)
    if args.require_complete and coverage_errors:
        raise SystemExit('Incomplete source coverage:\n' + '\n'.join(coverage_errors))
    merge = Merge(args.source, args.output)
    merge.report['sourceCoverageErrors'] = coverage_errors
    for path in sorted(args.source.glob('section-*-complete.json')):
        merge.add_section(read(path))
    merge.finish()
    merge.report['publishable'] = not coverage_errors and not merge.report['warnings']
    write(args.output / 'merge-report.json', merge.report)
    if args.require_complete and not merge.report['publishable']:
        raise SystemExit('Proposal has unresolved warnings; inspect merge-report.json')
    print(json.dumps({'counts': merge.report['counts'], 'merged': len(merge.report['merged']), 'warnings': dict(Counter(item['kind'] for item in merge.report['warnings']))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
