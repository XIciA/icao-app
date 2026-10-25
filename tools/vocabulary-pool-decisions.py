"""Account for every inventoried lexical head without pretending that POS/model output is editorial truth."""
import collections
import hashlib
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=ROOT/'content/vocabulary/three-books'
source=json.loads((BASE/'source.json').read_text())
inventory=json.loads((BASE/'inventory.json').read_text())
exact={}
for e in source['entries']:
    for form in [e['word']]+e['aliases']+e['frequencyRules']['forms']:
        exact.setdefault(form.lower(),set()).add(e['id'])
by_word={e['word'].lower():e['id'] for e in source['entries']}
covered={}
for line in (BASE/'coverage.tsv').read_text().splitlines():
    if not line or line.startswith('#'):continue
    old,new,reason=line.split('|')
    covered[old.lower()]=(new.lower(),reason)
def coverage(term):
    if term not in covered:return None
    seen=set()
    while term in covered and term not in seen:
        seen.add(term);new,reason=covered[term]
        if new==term:break
        term=new
    return by_word.get(term)
noise=set('aii arounds buss bw cd cros du eco fgr fo fullback geo kaffir lc mapo mb myat offs onr ons pas seatac shangri slater sou sunwing tp whiling whereaft'.split())
suspect=set('chaffing confliction cumulous famious injestion lightening phraseologe rectifi squaw'.split())
rows=[]
for e in inventory['entries']:
    ids=set().union(*(exact.get(f.lower(),set()) for f in e['forms']))
    target=coverage(e['term'])
    if ids:
        status,reason='已收录或词形覆盖','完整词目、明确变体或已观察词形匹配；义项以卡片释义为限'
    elif target:
        ids={target};status,reason='由完整表达承接',covered[e['term']][1]
    elif e['term'] in suspect:
        status,reason='源文本疑点','疑似误拼或需按上下文区分的合法词形，不把疑点拼写直接制作成词卡；未改题库原文'
    elif e['term'] in noise:
        status,reason='不独立收录','标签、转写碎片、明显噪声或与本轮学习目标无关的词'
    elif sum(e['pos'].get(p,0) for p in ['PROPN','NUM','X'])>=e['occurrences']*.7 and e['zipf']<3:
        status,reason='不独立收录','主要表现为专名、呼号或文本标记；模型词性只作为筛查线索'
    elif e['zipf']>=4 or max(e['pos'],key=e['pos'].get) in {'ADP','AUX','CCONJ','DET','INTJ','PART','PRON','SCONJ'}:
        status,reason='通用基础不独立设卡','按一般英语阅读基础筛选；通用频率为辅助线索，不是官方难度等级'
    else:
        status,reason='语境保留不独立设卡','本轮未选中的一般词、透明构词或非核心语境表达；保留原词形和频次供复核，不声称不存在学习价值'
    rows.append({'term':e['term'],'forms':e['forms'],'occurrences':e['occurrences'],'status':status,'reason':reason,**({'cardIds':sorted(ids)} if ids else {})})
result={'schemaVersion':1,'sourceChecksum':hashlib.sha256((BASE/'source.json').read_bytes()).hexdigest(),'inventoryChecksum':hashlib.sha256((BASE/'inventory.json').read_bytes()).hexdigest(),'policy':'全池有归属，编辑取舍可回查；语料扫描完整不等于教学难度具有唯一客观分界。频次仍按最终完整词目/批准形式独立计算，不叠加组成词。','counts':dict(collections.Counter(r['status'] for r in rows)),'entries':rows}
(BASE/'pool-decisions.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['counts'],ensure_ascii=False))
