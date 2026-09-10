"""Apply the reviewed 900-sentence source to existing IDs; no UI or other bank changes."""
import argparse, collections, hashlib, json, pathlib, re, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
MANUAL = {204: 419, 466: 298, 664: 529, 728: 82, 762: 547, 865: 799, 878: 821, 385: 360, 386: 789}
LEVEL = {'次工作级': '3级', '工作级': '4级', '专家级': '5级'}
def digest(b): return hashlib.sha256(b).hexdigest()
def write(p, v):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n')
def normalized(s): return ''.join(c.lower() for c in s if c.isalnum())
def clean(s):
    return re.split(r'\s*\*?Note\s*[:：]|\s*[（(]?注\s*[:：]|\s*在部分考点', s, flags=re.I)[0].strip()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=pathlib.Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    raw=(args.source/'900句数据.json').read_bytes(); rows=json.loads(raw)
    assert len(rows)==900 and {r['n'] for r in rows}==set(range(1,901)), 'incomplete_source'
    files=sorted((ROOT/'content/question-banks/banks/sentences900/topics').glob('*.json'))
    topics={p:json.loads(p.read_text()) for p in files}; cards={}; by_text=collections.defaultdict(list)
    for p,t in topics.items():
        for c in t['cards']: cards[c['id']]=(p,c);by_text[normalized(c['audioText'])].append(c['id'])
    assert len(cards)==900
    changes=[];notes=[];resources=[];used=set()
    for r in rows:
        en,zh=clean(r['en']),clean(r['zh']);assert en and zh
        assert not re.search(r'Note\s*[:：]|考点|读音|发音|注[：:]',en+' '+zh,re.I), 'unremoved_note'
        if r['n'] in MANUAL: cid=f"sentence900-main-{MANUAL[r['n']]:03d}"
        else:
            candidates=by_text[normalized(en)];assert len(candidates)==1, f"ambiguous_mapping:{r['n']}";cid=candidates[0]
        assert cid not in used, 'reused_card';used.add(cid);p,c=cards[cid]
        assert LEVEL[r['level']] in p.stem, 'level_changed'
        audio=(args.source/r['local_audio']).resolve();assert audio.is_relative_to(args.source.resolve())
        binary=audio.read_bytes();sha=digest(binary);assert sha==r['sha256'] and len(binary)==r['bytes']
        assert r['duration_seconds']>0 and r['audio_decode_ok']
        relative=f"audio/sentence900/rev13/{cid}-{sha[:12]}.mp3";public='/question-bank-assets/'+relative
        changes.append({'id':cid,'sourceNumber':r['n'],'oldEnglish':c['audioText'],'newEnglish':en,'oldChinese':c.get('audioTextZh',''),'newChinese':zh,'audioChecksum':sha})
        for field,value in [('en',en),('zh',zh)]:
            if r[field]!=value:notes.append({'sourceNumber':r['n'],'field':field,'removed':r[field][len(value):]})
        c.update(audioText=en,audioTextZh=zh,audio=public,audioDurationSeconds=r['duration_seconds'])
        resources.append({'objectKey':'v13/'+relative,'bankId':'sentences900','sourceRelativePath':relative,'publicPath':public,'sizeBytes':len(binary),'mimeType':'audio/mpeg','checksum':sha,'status':'ready','durationSeconds':r['duration_seconds']})
        if args.apply:
            dest=ROOT/'content/question-banks/resources/files'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(audio,dest)
    assert len(used)==900 and len(notes)==44
    if args.apply:
        for p,t in topics.items():write(p,t)
        regpath=ROOT/'content/question-banks/registry.json';reg=json.loads(regpath.read_text());reg.update(releaseVersion=13,releasedAt='2026-09-10T08:00:00.000Z');write(regpath,reg)
        mp=ROOT/'content/question-banks/resources/manifest.source.json';manifest=json.loads(mp.read_text());existing={x['publicPath'] for x in manifest['files']}
        manifest['files']+= [x for x in resources if x['publicPath'] not in existing];manifest['version']=6;write(mp,manifest)
    report={'sourceSha256':digest(raw),'mapped':len(used),'notesRemoved':notes,'changes':changes,'duplicateMapping':'385→360,386→789: preserve two identical-text identities; not a claim of identical recordings'}
    write(ROOT/'.generated/sentences900-resource-update/report.json',report)
    print(json.dumps({'applied':args.apply,'mapped':len(used),'notesRemoved':len(notes),'sourceSha256':digest(raw)}))
if __name__=='__main__': main()
