"""Build a reviewed structured plan against fetched live sources (never publish).
Usage: python3 tools/prepare-question-order.py ORDER.json SOURCES.json PLAN.json OUT
PLAN: {operations:[{bankId,categoryId,topicId,cardId,action:add|update|retire,
card:{...},category?:{id,name},topic?:{id,name}}], decisions:[...], notes}
Codex supplies complete wording/answers; this tool owns identities/counts/audio.
"""
import copy,hashlib,json,pathlib,subprocess,sys,tempfile

def sha(data):return hashlib.sha256(data).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def prepare(order,sources,plan,out):
 out.mkdir(parents=True,exist_ok=True);banks={b['bankId']:copy.deepcopy(b) for b in sources['banks']};changed=set();resources=[]
 hotspot_id='hotspot-'+order['examDate']+'-'+sha(order['center'].encode())[:12] if order['kind']=='opi' else None
 def find(bank_id,card_id):
  matches=[(category,topic,card) for category in banks[bank_id]['payload']['categories'] for topic in category['topics'] for card in topic['cards'] if card['id']==card_id]
  if len(matches)!=1:raise ValueError('question_not_unique:'+card_id)
  return matches[0]
 def audio(bank,card):
  text=card.get('audioText','').strip()
  if not text:raise ValueError('missing_audio_text:'+card['id'])
  with tempfile.TemporaryDirectory() as tmp:
   temp=pathlib.Path(tmp);(temp/'text.txt').write_text(text)
   subprocess.run(['say','-v','Samantha','-r','165','-f',str(temp/'text.txt'),'-o',str(temp/'audio.aiff')],check=True,capture_output=True,timeout=180)
   subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(temp/'audio.aiff'),'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','64k',str(temp/'audio.mp3')],check=True,capture_output=True,timeout=60)
   data=(temp/'audio.mp3').read_bytes();duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(temp/'audio.mp3')],text=True))
   if not .15<duration<900:raise ValueError('invalid_audio_duration')
  checksum=sha(data);key=f'revisions/{bank}/{checksum}/audio/{bank}/{card["id"]}.mp3';dest=out/'files'/key;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  card['audio']='/question-bank-assets/'+key;card['audioDurationSeconds']=duration
  resources.append({'objectKey':key,'publicPath':card['audio'],'sourceRelativePath':key,'bankId':bank,'checksum':checksum,'sizeBytes':len(data),'mimeType':'audio/mpeg','status':'ready','durationSeconds':duration})
 for operation in plan.get('operations',[]):
  bank_id=operation['bankId'];bank=banks[bank_id]['payload'];card_id=operation['cardId'];action=operation['action']
  if action=='add':
   if any(c['id']==card_id for cat in bank['categories'] for t in cat['topics'] for c in t['cards']):raise ValueError('existing_question_id:'+card_id)
   category=next((c for c in bank['categories'] if c['id']==operation['categoryId']),None)
   if category is None:
    category={**operation['category'],'topics':[]};assert category['id']==operation['categoryId'];bank['categories'].append(category)
   topic=next((t for t in category['topics'] if t['id']==operation['topicId']),None)
   if topic is None:
    topic={**operation['topic'],'cards':[]};assert topic['id']==operation['topicId'];category['topics'].append(topic)
   card=copy.deepcopy(operation['card']);card['id']=card_id;topic['cards'].append(card)
   if hotspot_id:card['studyTier']=0;card['examReported']=True
  else:
   category,topic,card=find(bank_id,card_id)
   if category['id']!=operation['categoryId'] or topic['id']!=operation['topicId']:raise ValueError('existing_identity_must_be_preserved')
   if action=='retire':card['retired']=True
   elif action=='update':
    patch=operation['card']
    if 'id' in patch and patch['id']!=card_id:raise ValueError('existing_identity_must_be_preserved')
    if 'audioText' in patch and patch['audioText']!=card.get('audioText') and 'audio' not in patch:card.pop('audio',None)
    card.update(copy.deepcopy(patch))
   else:raise ValueError('unknown_action')
  if not card.get('retired') and card.get('kind')!='image' and not card.get('audio'):audio(bank_id,card)
  changed.add(bank_id)
 decisions=[];groups={}
 for decision in plan.get('decisions',[]):
  item={k:v for k,v in decision.items() if k in ['source','kind','cardId','reason']};decisions.append(item)
  if hotspot_id and item['kind'] not in ['unresolved','excluded']:
   category,topic,card=find('opi',item['cardId'])
   group=groups.setdefault(topic['id'],{'topicId':topic['id'],'topicTitle':topic['name'],'cardIds':[]})
   if card['id'] not in group['cardIds']:group['cardIds'].append(card['id'])
   if decision.get('englishPrompt'):
    prompts=card.setdefault('reportedPrompts',{}).setdefault(hotspot_id,[])
    if decision['englishPrompt'] not in prompts:prompts.append(decision['englishPrompt']);changed.add('opi')
 for bank_id in changed:
  bank=banks[bank_id]['payload']
  for category in bank['categories']:
   for topic in category['topics']:
    topic['declaredCardCount']=len(topic['cards']);topic.pop('scopeCardIds',None)
   category['declaredTopicCount']=len(category['topics']);category['declaredCardCount']=sum(len(t['cards']) for t in category['topics'])
  bank['declaredTopicCount']=sum(len(c['topics']) for c in bank['categories']);bank['declaredCardCount']=sum(c['declaredCardCount'] for c in bank['categories'])
 draft={'banks':[{'bankId':key,'baseChecksum':banks[key]['checksum'],'payload':banks[key]['payload']} for key in sorted(changed)],'decisions':decisions,'notes':plan.get('notes','')}
 if hotspot_id:draft['hotspot']={'id':hotspot_id,'date':order['examDate'],'centers':[order['center']],'title':order['examDate']+' '+order['center']+' OPI','topics':list(groups.values())}
 write(out/'draft.json',{'id':order['id'],'revision':order['revision'],'draft':draft});write(out/'resources.json',{'schemaVersion':1,'files':resources})
 print(f'question_order_prepared banks={len(changed)} resources={len(resources)} decisions={len(decisions)}')
if __name__=='__main__':
 if len(sys.argv)!=5:raise SystemExit(__doc__)
 prepare(*(json.loads(pathlib.Path(p).read_text()) for p in sys.argv[1:4]),pathlib.Path(sys.argv[4]))
