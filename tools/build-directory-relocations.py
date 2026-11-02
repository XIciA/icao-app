"""Generate client storage identities from the reviewed directory change manifest."""
import json,pathlib,collections
root=pathlib.Path(__file__).resolve().parents[1]
proof=json.loads((root/'content/question-banks/opi-directory-20261102.json').read_text())
groups=collections.defaultdict(list)
for m in proof['moves']:groups[(m['bankId'],m['fromCategoryId'],m['fromTopicId'],m['toCategoryId'],m['toTopicId'])].append(m['cardId'])
rows=[[*k,v] for k,v in sorted(groups.items())]
p=root/'src/features/question-bank/data/directory-relocations.json'
p.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
