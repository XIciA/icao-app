"""Apply the frozen human review and task-scoped editorial rules. No network or publication.

Missing bilingual content is reported to .generated; it never overwrites a good live source.
Explicit corrections/new entries live in content/vocabulary/live/editorial.tsv.
"""
import collections
import hashlib
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'content/vocabulary/live'
OUT = ROOT / '.generated/vocabulary-live'
OUT.mkdir(parents=True, exist_ok=True)
BASE.mkdir(parents=True, exist_ok=True)
old_source = json.loads((ROOT / 'content/vocabulary/three-books/source.json').read_text())
old_dataset = json.loads((ROOT / 'content/vocabulary/three-books/dataset.json').read_text())
review_bytes = (ROOT / 'content/vocabulary/reviewed-20261026/decisions.json').read_bytes()
review = json.loads(review_bytes)['decisions']
inventory = {row['term']: row for row in json.loads((ROOT / 'content/vocabulary/three-books/inventory.json').read_text())['entries']}
lookup = {row['word'].lower(): row for row in json.loads((ROOT / 'content/word-lookup/dataset.json').read_text())['entries']}
old_entries = old_source['entries']
by_original = {row['word'].lower(): row for row in old_entries}
old_words = {row['id']: row for book in old_dataset['books'] for row in book['words']}
editorial_path = BASE / 'editorial.tsv'
meanings_path = BASE / 'meanings.tsv'
decompositions_path = BASE / 'decompositions.tsv'
editorial = {}
if editorial_path.exists():
    for line in editorial_path.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        term, book, meaning, example, translation = line.split('|')
        editorial[term.lower()] = dict(word=term, bookId=book, meaning=meaning, example=example, exampleTranslation=translation)


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text).replace('’', "'").replace('‘', "'")) .strip()


def meaning(text):
    text = clean(text)
    text = re.sub(r'^(?:短语|通话指令|通话用语|通话提示|通话信号|动词短语)\s*', '', text)
    text = re.sub(r'(?<![A-Za-z])(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|abbr|num|aux)\.\s*', '', text)
    text = text.replace(';', '；').replace('(', '（').replace(')', '）')
    text = re.sub(r'\s*；\s*', '；', text)
    text = re.sub(r'；+', '；', text)
    text = re.sub(r'\.{3,}', '……', text)
    text = re.sub(r'(?<=[\u4e00-\u9fff]),\s*', '，', text)
    text = text.replace(',', '，')
    text = re.sub(r'(?<=[\u4e00-\u9fff])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\u4e00-\u9fff])', ' ', text)
    return text.strip('；;，,、：: 。')


def sentence(text):
    text = clean(text)
    text = re.sub(r'^(?:PIL|TWR|ATC|APP|Engineer|Pilot|Controller|P|C)\s*[:：]\s*', '', text, flags=re.I)
    text = re.sub(r'([.!?]["\'])\.$', r'\1', text)
    return text if text.endswith(('.', '?', '!')) or re.search(r'[.!?]["\']$', text) else text + '.'


def translation(text):
    text = re.sub(r'^(?:PIL|TWR|ATC|APP|Engineer|Pilot|Controller|P|C)\s*[:：]\s*', '', clean(text), flags=re.I)
    text = text.replace('?', '？').replace('!', '！').replace(',', '，')
    text = re.sub(r'(?<=[\u4e00-\u9fff])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\u4e00-\u9fff])', ' ', text)
    return text.rstrip('。.') + ('。' if not text.endswith(('？', '！')) else '')


def fav(text):
    # Match encodeURIComponent rather than Python's default slash-safe quoting.
    import urllib.parse
    return '__word_favorite__:v1:' + urllib.parse.quote(clean(text).lower(), safe="~()*!.'-_")


def title(text):
    small = {'and', 'or', 'of', 'for', 'in', 'on', 'to', 'the', 'with', 'per'}
    return ' '.join(word if word.isupper() else word.lower() if word.lower() in small and index else '-'.join(part.capitalize() for part in word.split('-')) for index, word in enumerate(text.split()))


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


explicit_remove = {'a badly sick passenger', 'adverse weather', 'aircraft proximity', 'ac generator', 'moderate turbulence', 'minor bruise', 'port engine', 'starboard engine'}
if decompositions_path.exists():
    explicit_remove.update(line.split('|')[0].strip().lower() for line in decompositions_path.read_text().splitlines() if line and not line.startswith('#'))
fallback = {'configuration': 'icao4', 'cvr': 'preview', 'fuselage': 'preview', 'refuel': 'preview', 'rejected takeoff': 'icao4', 'tail strike': 'icao4', 'vertical': 'preview', 'pound': 'preview'}
synonyms = {
    'airport shuttle bus': ['airport passenger bus', 'ferry bus'], 'air inlet': ['air intake'],
    'downdraft': ['downdraught'], 'updraft': ['updraught'], 'windshield': ['windscreen'],
    'gasoline': ['petrol'], 'apron': ['ramp'], 'disembark': ['deplane'],
    'first officer': ['co-pilot', 'copilot'], 'life raft': ['liferaft'],
    'fire engine': ['fire truck'], 'seatbelt': ['seat belt'], 'deicing': ['de-icing'],
    'flat tire': ['flat tyre', 'deflated tire', 'deflated tyre'], 'medical personnel': ['medical staff'],
    'lavatory': ['restroom', 'toilet'], 'microphone': ['mic'], 'rubbish': ['garbage', 'trash'],
    'buildup': ['build-up'], 'glide path': ['glidepath'], 'turbulent': ['bumpy'],
    'passenger boarding bridge': ['air bridge', 'airbridge', 'jetway', 'loading bridge'],
    'rapid decompression': ['rapid depressurization', 'quick depressurization'],
    'fire extinguisher': ['extinguisher'], 'engine cowling': ['cowl', 'cowling', 'engine cowl'],
    'fuel truck': ['refueler', 'refueller'], 'flight attendant': ['steward', 'stewardess'], 'cockpit': ["pilot's cabin"],
}
abbreviations = {}
for row in old_entries:
    if '英文全称：' in row['meaning']:
        abbreviations[row['word'].lower()] = row['meaning'].split('英文全称：', 1)[1].strip()

entries = {}
retired = {}
decisions = []
removed = []
for original in old_entries:
    row = json.loads(json.dumps(original))
    decision = review.get(row['id'], {}).get('choice')
    term = row['word'].lower()
    if decision == 'delete' or term in explicit_remove:
        removed.append(row)
        retired[row['id']] = None
        decisions.append({'id': row['id'], 'word': row['word'], 'action': 'split-or-delete', 'reason': 'human-delete' if decision == 'delete' else 'dictated-example'})
        continue
    row['bookId'] = decision if decision in {'preview', 'icao4', 'icao5'} else fallback.get(term, row['bookId'])
    if not decision or decision == 'pending':
        decisions.append({'id': row['id'], 'word': row['word'], 'action': 'resolve-unselected', 'bookId': row['bookId']})
    row['word'] = row['word'].upper() if term in abbreviations else row['word'].lower() if not re.fullmatch(r'[A-Z][A-Z0-9-]{1,7}', row['word']) or row['word'] in {'AFFIRM', 'MAYDAY', 'IDENT', 'SQUAWK', 'PAN-PAN'} else row['word']
    for acronym in sorted(abbreviations, key=len, reverse=True):
        row['word'] = re.sub(r'(?<![A-Za-z])' + re.escape(acronym) + r'(?![A-Za-z])', acronym.upper(), row['word'], flags=re.I)
    row['meaning'] = meaning(row['meaning'].split('英文全称：', 1)[0])
    row['relatedExpressions'] = []
    if term in abbreviations:
        expansion = title(abbreviations[term])
        row['meaning'] += f'（{expansion}，{row["word"]}）'
        row['abbreviationExpansion'] = abbreviations[term]
        row['pronunciationText'] = row.get('pronunciationText') or ' '.join(row['word'])
    else:
        equivalent = synonyms.get(term, [])
        if equivalent:
            row['word'] = ' / '.join([row['word']] + equivalent)
            row['pronunciationText'] = '. '.join([term] + equivalent)
        row['relatedExpressions'] = [clean(alias) for alias in row.get('aliases', []) if alias.lower() not in equivalent and alias.lower() != term]
    row['example'] = sentence(row['example'])
    row['exampleTranslation'] = translation(row['exampleTranslation'])
    entries[row['id']] = row

# Full names of already represented abbreviations become aliases, not extra learning cards.
for abbr, full in abbreviations.items():
    target = next((e for e in entries.values() if e['word'].lower() == abbr), None)
    if not target:
        continue
    for row in list(entries.values()):
        if row['id'] != target['id'] and row['word'].lower().replace('-', ' ') == full.lower().replace('-', ' '):
            retired[row['id']] = target['id']; del entries[row['id']]
            decisions.append({'id': row['id'], 'word': row['word'], 'action': 'merge-full-name', 'target': target['id']})

# User requested minimum safe altitude under MSA; retain the contextual sector meaning as well.
msa = next(e for e in entries.values() if e['word'] == 'MSA')
msa['meaning'] = '最低安全高度（Minimum Safe Altitude，MSA）；航图语境中也可指最低扇区高度（Minimum Sector Altitude，MSA）'
msa['frequencyRules']['forms'] = sorted(set(msa['frequencyRules']['forms'] + ['minimum safe altitude']))
for row in list(entries.values()):
    if row['word'].lower() == 'minimum safe altitude':
        retired[row['id']] = msa['id']; del entries[row['id']]
        decisions.append({'id': row['id'], 'word': row['word'], 'action': 'merge-requested-msa', 'target': msa['id']})

# Extract useful missing components from the human-deleted combinations.
simple = set('a an the is are was were be been being to of in at on for and or with from by our your their this that these those it its one two number some very after before while not no up down off over out as than less more do does did into badly low top inside ii iii i partially loud shut come both get same end main night sky advice item company first half water door truck camera met appear bunch fully longer'.split())
single_deletes = {row['word'].lower() for row in removed if ' ' not in row['word']}
forms = collections.defaultdict(list)
for head, row in inventory.items():
    for form in row['forms']:
        forms[form.lower()].append(head)
irregular = {'brakes': 'brake', 'engines': 'engine', 'flaps': 'flap', 'valves': 'valve', 'levers': 'lever', 'instruments': 'instrument', 'vehicles': 'vehicle', 'procedures': 'procedure', 'wheels': 'wheel', 'indicators': 'indicator', 'systems': 'system', 'passengers': 'passenger', 'unreliable': 'unreliable', 'roughly': 'rough', 'smoothly': 'smooth', 'dispersing': 'disperse', 'pools': 'pool', 'effects': 'effect', 'aids': 'aid', 'stuck': 'stuck', 'prohibited': 'prohibit'}
missing = []
new_candidates = {}


def existing(term):
    return next((entry for entry in entries.values() if term.lower() in [part.strip().lower() for part in entry['word'].split(' / ')]), None)


def lemma(token):
    if token in irregular:
        return irregular[token]
    if existing(token):
        return token
    choices = forms.get(token, [])
    represented = next((head for head in choices if existing(head)), None)
    if represented:
        return represented
    base = next((head for head in choices if head != token and head in lookup and inventory.get(head, {}).get('pos', {}).get('VERB', 0) > 0), None)
    return base or token


def propose(term, parent=None):
    term = clean(term)
    if existing(term) or term in new_candidates or term in simple or term in single_deletes:
        return
    if term in editorial:
        row = {**editorial[term]}
    else:
        definition = lookup.get(term, {}).get('aviationMeaning') or lookup.get(term, {}).get('generalMeaning')
        if not definition:
            missing.append({'word': term, 'parent': parent['word'] if parent else None, 'reason': 'definition-required'})
            return
        grade = 'preview' if inventory.get(term, {}).get('zipf', 0) >= 4.5 else 'icao4'
        if inventory.get(term, {}).get('zipf', 5) < 3.3:
            grade = 'icao5'
        row = {'word': term, 'bookId': grade, 'meaning': meaning(definition), 'example': '', 'exampleTranslation': ''}
        candidates = [e for e in old_entries if re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?:s|es|ed|ing)?(?![A-Za-z])', e['example'], re.I)]
        if parent and re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?:s|es|ed|ing)?(?![A-Za-z])', parent['example'], re.I):
            candidates.insert(0, parent)
        if candidates:
            ex = min(candidates[:1] if parent and candidates[0] is parent else candidates, key=lambda e: abs(len(e['example'])-85))
            row['example'] = sentence(ex['example']); row['exampleTranslation'] = translation(ex['exampleTranslation'])
    row.update(id='v4-' + digest(term.lower())[:16], pronunciationText=term, aliases=[], relatedExpressions=[], frequencyRules={'forms': sorted(set([term] + list(inventory.get(term, {}).get('forms', {}))))}, origins=[{'type': 'review-split', 'term': term}], legacyIds=[])
    if not row['example'] or not row['exampleTranslation']:
        missing.append({'word': term, 'reason': 'bilingual-example-required'})
    new_candidates[term] = row


for row in removed:
    if row['word'].lower() == 'survival, first-aid and polar kits':
        continue
    if ' ' not in row['word']:
        continue
    for token in re.findall(r'[A-Za-z]+(?:-[A-Za-z]+)*', row['word'].lower()):
        if token in simple:
            continue
        token = lemma(token)
        if token in simple or existing(token):
            continue
        if inventory.get(token, {}).get('zipf', 4) >= 5.6 and token not in {'minor', 'moderate', 'proximity', 'bruise'}:
            continue
        propose(token, row)
for term in ['minor', 'bruise', 'proximity', 'in progress', 'clear up', 'come down', 'shut down', 'no longer', 'survival kit', 'first-aid kit', 'polar survival kit']:
    propose(term, by_original.get('minor bruise') if term in {'minor', 'bruise'} else None)
for term, row in new_candidates.items():
    entries[row['id']] = row
    decisions.append({'id': row['id'], 'word': term, 'action': 'add-split-component', 'bookId': row['bookId']})

# Apply explicit, inspectable corrections after generic normalization.
meaning_corrections = dict(line.split('|', 1) for line in meanings_path.read_text().splitlines() if line and not line.startswith('#')) if meanings_path.exists() else {}
for row in entries.values():
    correction = editorial.get(row['word'].lower())
    if correction:
        for field in ['bookId', 'meaning', 'example', 'exampleTranslation']:
            if correction[field]: row[field] = correction[field]
    if row['word'].lower() in meaning_corrections:
        row['meaning'] = meaning_corrections[row['word'].lower()]

# Preserve the foundational components explicitly identified by the user.
for term in ['aircraft', 'airport', 'weather', 'engine', 'flight', 'air', 'fuel', 'fog', 'cloud', 'rain', 'system', 'radar', 'passenger', 'sick']:
    row = existing(term)
    if row and row['id'].startswith('v4-'):
        if row['bookId'] != 'preview': decisions.append({'id': row['id'], 'word': row['word'], 'action': 'foundational-split-component', 'before': row['bookId'], 'bookId': 'preview'})
        row['bookId'] = 'preview'

if existing('pneumatic') and existing('air-driven'):
    target, alias = existing('pneumatic'), existing('air-driven')
    target['word'] = 'pneumatic / air-driven'
    target['pronunciationText'] = 'pneumatic. air-driven'
    target['meaning'] = '气动的；由压缩空气驱动的'
    target['frequencyRules']['forms'] = sorted(set(target['frequencyRules']['forms'] + alias['frequencyRules']['forms']))
    retired[alias['id']] = target['id']; del entries[alias['id']]
    decisions.append({'id': alias['id'], 'word': alias['word'], 'action': 'merge-exact-synonym', 'target': target['id']})

# Collapse explicitly equivalent existing heads, retaining all prior identities.
for primary, aliases in synonyms.items():
    target = existing(primary)
    if not target: continue
    for alias in list(entries.values()):
        if alias['id'] != target['id'] and alias['word'].lower() in aliases:
            target['frequencyRules']['forms'] = sorted(set(target['frequencyRules']['forms'] + alias['frequencyRules']['forms']))
            retired[alias['id']] = target['id']; del entries[alias['id']]
            decisions.append({'id': alias['id'], 'word': alias['word'], 'action': 'merge-exact-synonym', 'target': target['id']})
# Explicit user example: radar vector supplies the learning card for radar.
if existing('radar') and existing('radar vector'):
    alias, target = existing('radar'), existing('radar vector')
    retired[alias['id']] = target['id']; del entries[alias['id']]
    decisions.append({'id': alias['id'], 'word': alias['word'], 'action': 'covered-by-user-selected-phrase', 'target': target['id']})

# A transparent combination adds no extra card when each component is already a headword.
# Explicitly approved equivalent expressions are retained as one grouped card.
for row in list(entries.values()):
    if ' ' not in row['word'] or ' / ' in row['word'] or row.get('abbreviationExpansion') or row['word'] in {'in progress', 'clear up', 'come down', 'shut down', 'no longer', 'survival kit', 'first-aid kit', 'polar survival kit'}:
        continue
    tokens = [lemma(token) for token in re.findall(r'[A-Za-z]+(?:-[A-Za-z]+)*', row['word'].lower()) if token not in simple]
    covered = lambda token: existing(token) or (existing('radar vector') if token == 'radar' else None)
    if tokens and all(covered(token) and covered(token)['id'] != row['id'] for token in tokens):
        retired[row['id']] = None; del entries[row['id']]
        decisions.append({'id': row['id'], 'word': row['word'], 'action': 'remove-covered-combination', 'components': tokens})

groups = [
    ['VOR', 'NDB', 'DME', 'ILS'], ['inbound', 'outbound'], ['V1', 'V2', 'VR', 'VREF', 'VAPP'],
    ['port', 'starboard'], ['HF', 'VHF', 'UHF'], ['IFR', 'VFR'], ['IMC', 'VMC'], ['CVR', 'FDR'],
    ['updraft', 'downdraft'], ['headwind', 'tailwind', 'crosswind'], ['increase', 'decrease'],
    ['extend', 'retract'], ['extension', 'retraction'], ['climb', 'descend'],
]
consistency = []
rank = {'preview': 0, 'icao4': 1, 'icao5': 2}
for group in groups:
    members = [entry for entry in entries.values() if entry['word'].split(' / ')[0].lower() in [term.lower() for term in group]]
    counts = collections.Counter(entry['bookId'] for entry in members)
    if len(counts) <= 1:
        continue
    target = min(counts, key=lambda grade: (-counts[grade], rank[grade]))
    consistency.append({'group': group, 'before': {e['word']: e['bookId'] for e in members}, 'target': target, 'reason': 'same-level-paired-family; majority, tie to foundational grade'})
    for entry in members:
        entry['bookId'] = target

active = set(entries)
def terminal(target):
    seen = set()
    while target is not None and target not in active:
        if target in seen or target not in retired:
            raise RuntimeError('retirement_target_invalid:' + str(target))
        seen.add(target); target = retired[target]
    return target

# Add historical v1/v2 retirements and retain all historical spelling aliases.
migration_text = (ROOT / 'packages/contracts/src/vocabulary-migration-data.ts').read_text()
def generated(name):
    return json.loads(re.search(r'export const ' + name + r'[^=]*= ([\s\S]*?);\n', migration_text).group(1))
for key, target in generated('vocabularyRetiredIds').items():
    retired.setdefault(key, target)
retired = {key: terminal(target) for key, target in retired.items()}
favorite_aliases = {}
for legacy in old_source['legacy']:
    favorite_aliases[fav(legacy['word'])] = terminal(legacy['target']) if legacy.get('target') else None
for row in old_entries:
    favorite_aliases[fav(row['word'])] = row['id'] if row['id'] in active else retired[row['id']]
for row in entries.values():
    for term in [row['word']] + row['word'].split(' / '):
        favorite_aliases.setdefault(fav(term), row['id'])

for row in entries.values():
    for field in ['meaning', 'example', 'exampleTranslation']:
        if not row.get(field): missing.append({'word': row['word'], 'reason': 'missing-' + field})
    row['meaning'] = meaning(row['meaning'])
    row['example'] = sentence(row['example']) if row['example'] else ''
    row['exampleTranslation'] = translation(row['exampleTranslation']) if row['exampleTranslation'] else ''
    row['level'] = rank[row['bookId']] + 1
    row['relatedExpressions'] = list(dict.fromkeys(row['relatedExpressions']))

source = {'schemaVersion': 1, 'version': 4, 'reviewChecksum': hashlib.sha256(review_bytes).hexdigest(), 'editorialChecksums': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [editorial_path, meanings_path, decompositions_path]}, 'books': [{k: v for k, v in book.items() if k != 'words'} for book in old_dataset['books']], 'entries': sorted(entries.values(), key=lambda e: (rank[e['bookId']], e['word'].lower())), 'retiredIds': retired, 'retiredFavoriteKeys': favorite_aliases}
report = {'words': len(entries), 'books': dict(collections.Counter(row['bookId'] for row in entries.values())), 'decisions': decisions, 'consistency': consistency, 'missing': missing}
for name, value in [('editorial-report.json', report), ('draft-source.json', source)]:
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
if missing:
    print(json.dumps({'missing': missing, 'publishedSourceUnchanged': True}, ensure_ascii=False, indent=2))
    raise SystemExit(1)
temporary = BASE / 'source.tmp'
temporary.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n'); temporary.replace(BASE / 'source.json')
print(json.dumps({'words': report['words'], 'books': report['books'], 'consistencyAdjustments': len(consistency), 'editorialDecisions': len(decisions)}, ensure_ascii=False))
