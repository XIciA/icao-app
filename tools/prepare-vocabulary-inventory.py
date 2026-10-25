"""Task-local lexical inventory. Uses an isolated spaCy/WordNet environment, never App dependencies.

Run with the environment documented in docs/workstreams/vocabulary-three-books.
The generated inventory is immutable input to the deterministic JS catalog builder.
"""
import collections
import hashlib
import json
import pathlib
import re
import unicodedata

import spacy
from nltk.stem import WordNetLemmatizer
import nltk
from wordfreq import zipf_frequency

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.generated/vocabulary-three-books'
DEST = ROOT / 'content/vocabulary/three-books'


def normalize(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text).replace('’', "'").replace('‘', "'").replace('–', '-').replace('—', '-').replace('\\n', ' ')).strip()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source_files = []
    def read(path):
        raw = path.read_bytes()
        source_files.append({'path': str(path.relative_to(ROOT)), 'checksum': hashlib.sha256(raw).hexdigest()})
        return json.loads(raw)
    base = ROOT/'content/question-banks'
    registry = read(base/'registry.json')
    docs, inventory = [], {}
    for bid in registry['bankIds']:
        folder = base/'banks'/bid
        bank = read(folder/'bank.json')
        count = images = 0
        for cid in bank['categoryIds']:
            category = read(folder/'categories'/f'{cid}.json')
            for tid in category['topicIds']:
                topic = read(folder/'topics'/f'{tid}.json')
                assert len(topic['cards']) == topic['declaredCardCount']
                for card in topic['cards']:
                    count += 1
                    if card.get('kind') == 'image':
                        images += 1
                        continue
                    fields = [('audioText', card.get('audioText'), card.get('audioTextZh'))]
                    if bid != 'listening':
                        fields.append(('referenceText', card.get('referenceText'), card.get('referenceTextZh')))
                    fields += [(f'choices[{i}]', text, (card.get('choicesZh') or [None]*len(card.get('choices', [])))[i]) for i, text in enumerate(card.get('choices', []))]
                    for field, text, translation in fields:
                        if text and re.search('[A-Za-z]', text):
                            docs.append({'bankId': bid, 'cardId': card['id'], 'field': field, 'text': normalize(text), 'translation': normalize(translation or '')})
        assert count == bank['declaredCardCount']
        inventory[bid] = {'cards': count, 'imageCards': images}
    unique = list(dict.fromkeys(d['text'] for d in docs))
    cache_path = OUT/'token-cache.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    missing = [t for t in unique if t not in cache]
    nlp = spacy.load('en_core_web_sm', disable=['ner', 'parser'])
    for i, (text, doc) in enumerate(zip(missing, nlp.pipe(missing, batch_size=128))):
        cache[text] = [{'form': t.text.lower(), 'lemma': t.lemma_.lower(), 'pos': t.pos_, 'tag': t.tag_} for t in doc if re.fullmatch('[A-Za-z]+(?:-[A-Za-z]+)*', t.text)]
        if (i+1) % 1000 == 0:
            cache_path.write_text(json.dumps(cache, ensure_ascii=False))
            print('parsed', i+1, '/', len(missing), flush=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False))
    nltk.data.path.insert(0, '/tmp/icao-lexical-nltk')
    wn = WordNetLemmatizer()
    spellings = {'tyre':'tire','tyres':'tire','taxiing':'taxi','taxied':'taxi','cleared':'clear','minima':'minimum','centre':'center','centreline':'centerline','unauthorised':'unauthorized','stabilised':'stabilize','stabilized':'stabilize','stabilising':'stabilize','licence':'license','licences':'license','aeroplane':'airplane','aeroplanes':'airplane','vectored':'vector','vectoring':'vector','learnt':'learn','metres':'meter','metre':'meter','kilometres':'kilometer','kilometre':'kilometer','pressurisation':'pressurization','depressurisation':'depressurization','jettisoning':'jettison','aquaplaning':'hydroplaning','hydroplane':'hydroplaning','hydroplaned':'hydroplaning','aquaplane':'hydroplaning','wind-shear':'windshear','de-icing':'deicing','anti-icing':'antiicing'}
    # Keep lexical technical nouns/adjectives separate from their verb sense.
    preserved = set('hydroplaning landing holding braking icing heading warning wiring lighting seating screening loading airworthiness pressurization depressurization vectoring scattered broken overcast lightning'.split())
    entries = {}
    for d in docs:
        for t in cache[d['text']]:
            f = t['form'].lower().strip("'")
            lemma = t['lemma'].lower()
            if f in preserved: lemma = f
            elif t['pos'] == 'VERB': lemma = wn.lemmatize(f, 'v')
            elif t['pos'] == 'NOUN': lemma = wn.lemmatize(f, 'n')
            lemma = spellings.get(f, spellings.get(lemma, lemma))
            if not re.fullmatch('[a-z]+(?:-[a-z]+)*', lemma): lemma = f
            e = entries.setdefault(lemma, {'term': lemma, 'forms': {}, 'pos': {}, 'occurrences': 0, 'audioOccurrences': 0, 'banks': [], 'zipf': zipf_frequency(lemma, 'en')})
            e['forms'][f] = e['forms'].get(f, 0)+1
            e['pos'][t['pos']] = e['pos'].get(t['pos'], 0)+1
            e['occurrences'] += 1
            e['audioOccurrences'] += int(d['field'] == 'audioText')
            if d['bankId'] not in e['banks']: e['banks'].append(d['bankId'])
    payload = {'schemaVersion': 1, 'corpusVersion': registry['releaseVersion'], 'sourceFiles': source_files, 'inventory': inventory, 'documentCount': len(docs), 'tokenCount': sum(e['occurrences'] for e in entries.values()), 'entries': sorted(entries.values(), key=lambda e:e['term'])}
    DEST.mkdir(parents=True, exist_ok=True)
    tmp = DEST/'inventory.json.tmp'
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
    tmp.replace(DEST/'inventory.json')
    (OUT/'documents.json').write_text(json.dumps(docs, ensure_ascii=False))
    print(json.dumps({'documents': len(docs), 'lemmas': len(entries), 'tokens': payload['tokenCount'], 'inventory': inventory}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
