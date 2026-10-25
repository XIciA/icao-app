"""Assemble task-scoped editorial tables into the single editable catalog source.

This is an authoring step; deterministic runtime build/check is three-book-vocabulary.mjs.
Missing bilingual examples stop publication and are resolved in examples.tsv.
"""
import hashlib
import json
import pathlib
import re
import unicodedata
import fcntl

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT/'content/vocabulary/three-books'
OUT = ROOT/'.generated/vocabulary-three-books'


def clean(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text).replace('’', "'").replace('‘', "'").replace('\\n', ' ')).strip()


def chinese(text):
    text = clean(text).replace(';', '；')
    text = re.sub(r'\s*；\s*', '；', text)
    text = re.sub(r'(?<=[\u4e00-\u9fff]),\s*', '，', text)
    text = re.sub(r'\s*,(?=[\u4e00-\u9fff])', '，', text)
    text = text.replace('(', '（').replace(')', '）')
    text = re.sub(r'(?<=[\u4e00-\u9fff])/(?=[\u4e00-\u9fff])','、',text)
    text = re.sub(r'(?<![0-9]):','：',text)
    text = text.replace('?', '？').replace('!', '！')
    # Unmatched delimiters are dealt with by explicit entry edits, not blindly paired.
    return text.strip()


def table(name):
    return [line.split('|') for line in (BASE/name).read_text().splitlines() if line.strip() and not line.startswith('#')]


def main():
    old = json.loads((ROOT/'content/vocabulary/dataset.json').read_text())
    core = json.loads((ROOT/'content/vocabulary/question-bank-core/source.json').read_text())
    inventory = json.loads((BASE/'inventory.json').read_text())
    pool = {e['term']: e for e in inventory['entries']}
    attested_forms = {f for e in inventory['entries'] for f in e['forms']}
    docs = json.loads((OUT/'documents.json').read_text())
    edits = {row[0]: row[1:] for row in table('legacy-edits.tsv')}
    coverage = {a.lower(): b for a,b,_ in table('coverage.tsv') if a.lower() != b.lower()}
    abbreviations = table('abbreviations.tsv')
    for abbr, book, full, meaning, speech in abbreviations:
        if full: coverage[full.lower()] = abbr
    def resolve(term):
        term = clean(term)
        seen = set()
        while term.lower() in coverage:
            assert term.lower() not in seen, ('cycle', term)
            seen.add(term.lower())
            term = coverage[term.lower()]
        return term
    def key(term):
        # Acronym + expansion is displayed compactly; expansion lives in the same meaning field.
        term = re.sub(r'^([A-Z][A-Z0-9-]{1,})\s*\(.*\)$', r'\1', clean(term))
        return resolve(term).lower()
    entries = {}
    legacy = []
    suppressed = set()
    split_terms = set('extend /retract the gear|flight crew/cabin crew|cold (warm) front|radar separation /non-radar separation|throttle up/down|asphyxia/suffocate|electric /air-driven booster pump|LP/HP compressor|main wheel /gear|control stand(surface)|appear down /up|engine runs smoothly /rough|threaten /compel /force'.split('|'))
    advanced = set()
    advanced.update('aerodynamic airframe analog avionics combustible configuration contaminate converge discharge ditch drift exhaust extension fatality flammable fumes hydroplaning hypoxia incapacitation ingestion interference lithium magnetic meteorological occupant parameter phraseology pneumatic pressurization pressurize proximity radial reclear recurrent retraction sensor slat stabilizer static symptom turbine valve variable yaw'.split())
    advanced.update(['volcanic ash','weight and balance','blast fence','bleed air','control column','electrical system','hydraulic system','oil pressure','pitot tube','pneumatic system'])
    beginner = set('airborne altitude cabin cargo climb departure distress height incident load manual severe traffic urgency visual'.split())
    def add(word, book_id, meaning, example='', translation='', forms=None, speech=None, origin=None, old_id=None, alias=None, rules=None):
        word = clean(word)
        aka = list(alias or [])
        acronym = re.fullmatch(r'([A-Z][A-Z0-9-]{1,})\s*\((.+)\)', word)
        if acronym:
            word, full = acronym.groups()
            aka.append(full)
            meaning = meaning+'；英文全称：'+full
        canonical = resolve(word)
        if canonical.lower() != word.lower(): aka.append(word)
        k = canonical.lower()
        existing = entries.get(k)
        if existing:
            existing['aliases'] = sorted(set(existing['aliases']+aka))
            existing['frequencyRules']['forms'] = sorted(set(existing['frequencyRules']['forms']+list(forms or [word])))
            if origin: existing['origins'].append(origin)
            if old_id: existing['legacyIds'].append(old_id)
            if old_id and word.lower() == k and not existing.get('exactLegacyId'):
                existing['id'] = old_id
                existing['exactLegacyId'] = old_id
            # Audited core meanings and examples take precedence over unreviewed historical definitions.
            if origin and origin['type'] == 'core' and canonical.lower() == word.lower():
                existing.update(meaning=chinese(meaning), example=clean(example), exampleTranslation=chinese(translation), pronunciationText=clean(speech or word))
                if rules: existing['frequencyRules'] = {**rules, 'forms': existing['frequencyRules']['forms']}
            return existing
        final_id = old_id or 'v3-'+hashlib.sha256(k.encode()).hexdigest()[:16]
        e = {'id':final_id,'bookId':book_id,'word':canonical,'meaning':chinese(meaning),'example':clean(example),'exampleTranslation':chinese(translation),'pronunciationText':clean(speech or canonical),'aliases':sorted(set(aka)), 'frequencyRules': rules or {'forms':list(forms or [word])},'origins':[origin] if origin else [],'legacyIds':[old_id] if old_id else [], **({'exactLegacyId':old_id} if old_id and word.lower()==k else {})}
        entries[k] = e
        return e
    for b in old['books']:
        for w in b['words']:
            if w['word'] in suppressed or w['id'] in suppressed:
                legacy.append({'id':w['id'],'word':w['word'],'action':'remove','reason':'历史占位词或不宜保留的错误表达'})
                continue
            term, meaning, aliases = w['word'], w['meaning'], []
            edit = edits.get(w['id'], edits.get(term))
            if edit:
                term, corrected, aliases_text = edit
                meaning = corrected or meaning
                aliases = aliases_text.split(';') if aliases_text else []
            split = w['word'] in split_terms
            e = add(term, b['id'], meaning, w['example'], w['exampleTranslation'], [term]+aliases, origin={'type':'manual','id':w['id']}, old_id=None if split else w['id'], alias=aliases)
            legacy.append({'id':w['id'],'word':w['word'], **({'action':'remove','reason':'原混合词目拆分，旧学习记录不推定为新卡已掌握'} if split else {'targetKey':key(term),'action':'retain' if e['id']==w['id'] else 'merge'})})
    for w in core['entries']:
        term = resolve(w['word'])
        book = 'icao5' if term.lower() in advanced else 'preview' if term.lower() in beginner else 'icao4'
        e = add(w['word'], book, w['meaning'], w['example'], w['exampleTranslation'], w['frequencyRules']['forms'], w['pronunciationText'], {'type':'core','id':w['id']}, old_id=w['id'], rules=w['frequencyRules'])
        legacy.append({'id':w['id'],'word':w['word'],'targetKey':key(w['word']),'action':'merge'})
    for term, book, meaning in table('supplement.tsv'):
        matches = pool.get(term, {})
        forms = [term]+list(matches.get('forms', {}))
        if term=='midair collision': forms += ['mid-air collision','midair collisions','mid-air collisions']
        if term=='datalink': forms += ['data link','data-link']
        e = add(term, book, meaning, forms=forms, origin={'type':'supplement','term':term})
        if term.lower() in entries:
            # Explicitly edited technical definition is authoritative for this canonical term.
            e['meaning'] = chinese(meaning)
    for abbr, book, full, meaning, speech in abbreviations:
        aka = [full] if full else []
        e = add(abbr, book, meaning+('；英文全称：'+full if full else ''), forms=[abbr]+aka, speech=speech, origin={'type':'abbreviation','term':abbr}, alias=aka)
        e['meaning'] = chinese(meaning+('；英文全称：'+full if full else ''))
        e['pronunciationText'] = speech
        e['frequencyRules']['caseSensitive'] = len(abbr)<3 or abbr in {'CAT','STAR','RAT'}
        e['frequencyRules']['forms'] = sorted(set(e['frequencyRules']['forms']+[abbr+'s']))
    # The legacy source deliberately kept capitalized rows; normalize ordinary lexical heads only.
    known_acronyms = {row[0] for row in abbreviations}|set('APU ACAS BPCU EHSI EGPWS FCU FOD GCU GPU HSI IDG MSA MVA POB RA RPM RVR SSR TA TCAS VFR VNAV VOLMET WXR'.split())
    for e in entries.values():
        if e['word'].upper() in known_acronyms: e['word'] = e['word'].upper()
        elif e['word'].upper() not in {'AFFIRM','MAYDAY','PAN-PAN','IDENT','SQUAWK','NEGATIVE CONTACT','STOP CLIMB','STOP DESCENT','LINE UP AND WAIT','SAY AGAIN','STAND BY'}:
            e['word'] = e['word'].lower()
            for acronym in sorted(known_acronyms,key=len,reverse=True):
                e['word'] = re.sub(r'(?<![a-z])'+re.escape(acronym.lower())+r'(?![a-z])',acronym,e['word'])
        e['aliases'] = sorted(a for a in set(e['aliases']) if a.lower()!=e['word'].lower())
        # Expand attested lexical forms only for the intended lemma; do not derive phrases by constituents.
        forms = set(e['frequencyRules']['forms'])|{e['word']}|set(e['aliases'])
        if ' ' not in e['word'] and e['word'].upper() not in known_acronyms and len(e['word'])>2:
            forms.update(pool.get(e['word'].lower(), {}).get('forms', {}))
            stem=e['word'].lower()
            inflections={stem+'s',stem+'es',stem+'ed',stem+'d',stem+'ing',stem+stem[-1]+'ed',stem+stem[-1]+'ing'}
            if stem.endswith('e'): inflections.add(stem[:-1]+'ing')
            if stem.endswith('y'): inflections.update({stem[:-1]+'ies',stem[:-1]+'ied'})
            forms.update(inflections & attested_forms)
        e['frequencyRules']['forms'] = sorted(forms)
    # Statistical POS mistakes must not turn a profession/derivative into a verb inflection.
    for e in entries.values():
        if e['word']=='dispatch': e['frequencyRules']['forms']=[f for f in e['frequencyRules']['forms'] if f.lower() not in {'dispatcher','dispatchers'}]
        if e['word']=='bird ingestion': e['meaning']='鸟吸入；发动机吸入鸟类；ingest 为动词，表示吸入，ingestion 为名词，表示吸入过程'
    # Keep new material tied to the current pool; absent optional extras are not invented into the books.
    corpus='\n'.join(d['text'] for d in docs)
    lower_corpus=corpus.lower()
    for e in entries.values():
        # Attested whole-expression plurals, never sums of constituent-word frequencies.
        if ' ' in e['word'] and not e['word'].isupper():
            plural=e['word']+'s'
            if plural.lower() in lower_corpus and re.search(r'(?<![A-Za-z])'+re.escape(plural)+r'(?![A-Za-z])',corpus,re.I):
                e['frequencyRules']['forms']=sorted(set(e['frequencyRules']['forms']+[plural]))
    skipped=[]
    for k,e in list(entries.items()):
        split_targets = {key(edits[t][0]) for t in split_terms if t in edits}|set('warm front|non-radar separation|air-driven booster pump|high-pressure compressor|decrease thrust|bird and animal hazard|engine runs smoothly|gear appears up|compel'.split('|'))
        if any(o['type'] in {'manual','core'} for o in e['origins']) or k in split_targets: continue
        covered_roots=[a for a in coverage if resolve(a).lower()==k and a in attested_forms]
        if covered_roots:
            e['coveredPoolForms']=covered_roots
            continue
        pattern=re.compile(r'(?<![A-Za-z])(?:'+'|'.join(re.escape(f) for f in e['frequencyRules']['forms'])+r')(?![A-Za-z])',0 if e['frequencyRules'].get('caseSensitive') else re.I)
        attested = not e['frequencyRules'].get('caseSensitive') and any(f.lower() in attested_forms for f in e['frequencyRules']['forms'] if ' ' not in f)
        if not attested and not pattern.search(corpus):
            skipped.append(e['word']);del entries[k]
    for item in legacy:
        if 'targetKey' in item:
            e=entries[item.pop('targetKey')]
            item['target']=e['id']
            item['action']='retain' if item['id']==e['id'] else 'merge'
    # Generate candidate example pairs only from aligned bilingual fields; final manual overrides win.
    pairs = []
    for d in docs:
        en, zh = d['text'], d['translation']
        if not zh: continue
        if 12 <= len(en) <= 240 and re.search('[\u4e00-\u9fff]',zh): pairs.append((en,zh,d))
        ens = re.split(r'(?<=[.!?])\s+(?=[A-Z])',en)
        zhs = [s for s in re.findall(r'[^。！？]+[。！？]?',zh) if s.strip()]
        if len(ens)==len(zhs) and len(ens)>1:
            pairs.extend((x,y,d) for x,y in zip(ens,zhs) if 12<=len(x)<=220)
    example_edits = {row[0]:row[1:] for row in table('examples.tsv')} if (BASE/'examples.tsv').exists() else {}
    pair_index={}
    for index,(en,_,_) in enumerate(pairs):
        for token in set(re.findall('[a-z0-9]+',en.lower())): pair_index.setdefault(token,set()).add(index)
    unresolved=[]
    for k,e in entries.items():
        override = example_edits.get(e['word'], example_edits.get(k))
        if override:
            e['example'],e['exampleTranslation']=clean(override[0]),chinese(override[1])
            if len(override)>2 and override[2]: e['pronunciationText']=override[2]
        pattern = re.compile(r'(?<![A-Za-z])(?:'+ '|'.join(re.escape(f) for f in sorted(e['frequencyRules']['forms'],key=len,reverse=True))+r')(?![A-Za-z])',0 if e['frequencyRules'].get('caseSensitive') else re.I)
        if not e['example'] or not pattern.search(e['example']):
            candidate_ids=set()
            for form in e['frequencyRules']['forms']:
                sets=[pair_index.get(token,set()) for token in re.findall('[a-z0-9]+',form.lower())]
                if sets: candidate_ids.update(min(sets,key=len))
            choices=[pairs[i] for i in sorted(candidate_ids) if pattern.search(pairs[i][0])]
            # Prefer concise statements, no callsign fragments or numbered test questions.
            choices.sort(key=lambda x: (bool(re.search(r'^(?:[CPQ]:|Question:)|\b[A-Z]{2,}\d',x[0])),x[0].endswith('?'),abs(len(x[0])-85)))
            if choices:
                en,zh,d=choices[0];e['example'],e['exampleTranslation']=en,chinese(zh)
                e['exampleSource']={'bankId':d['bankId'],'cardId':d['cardId'],'field':d['field']}
            else: unresolved.append(e['word'])
        # Match the original three books' direct-definition style; do not mix POS-prefix layouts.
        e['meaning']=re.sub(r'(?<![A-Za-z])(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|abbr|num|aux)\.\s*','',e['meaning'])
        e['meaning']=re.sub(r'^(?:通话用语、状态|动词短语、指令|应答机功能、指令|指令、动词短语|通话用语|动词短语|指令)\s+','',e['meaning'])
        e['meaning']=e['meaning'].strip('/、 ').rstrip('。； ')
        if re.match(r'^cat (?:ii|iii)\b',e['word'],re.I): e['word']=re.sub(r'^cat (ii|iii)\b',lambda m:m.group().upper(),e['word'],flags=re.I)
        e['exampleTranslation']=e['exampleTranslation'].rstrip('。.')+'。' if e['exampleTranslation'] and not e['exampleTranslation'].endswith(('？','！')) else e['exampleTranslation']
    # Last alias deduplication, including acronym expansions introduced after earlier rows.
    for e in entries.values(): e.pop('exactLegacyId',None)
    source={'schemaVersion':1,'version':3,'baseVocabularyChecksum':hashlib.sha256((ROOT/'content/vocabulary/dataset.json').read_bytes()).hexdigest(),'coreSourceChecksum':hashlib.sha256((ROOT/'content/vocabulary/question-bank-core/source.json').read_bytes()).hexdigest(),'corpusVersion':inventory['corpusVersion'],'books':[{k:v for k,v in b.items() if k!='words'} for b in old['books']], 'entries':sorted(entries.values(),key=lambda e:(e['bookId'],e['word'].lower())), 'legacy':legacy}
    source['editorialChecksums']={name:hashlib.sha256((BASE/name).read_bytes()).hexdigest() for name in ['inventory.json','legacy-edits.tsv','coverage.tsv','supplement.tsv','abbreviations.tsv','examples.tsv']}
    if unresolved:
        (OUT/'draft-source.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
        (OUT/'missing-examples.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'missingExamples':unresolved,'publishedSourceUnchanged':True},ensure_ascii=False),flush=True)
        raise SystemExit(1)
    temporary=BASE/'source.json.tmp'
    temporary.write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(BASE/'source.json')
    (OUT/'missing-examples.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2)+'\n')
    (OUT/'skipped-absent.json').write_text(json.dumps(skipped,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'entries':len(entries),'books':dict(__import__('collections').Counter(e['bookId'] for e in entries.values())),'missingExamples':unresolved,'skippedAbsent':skipped},ensure_ascii=False),flush=True)


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/'authoring.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        main()
