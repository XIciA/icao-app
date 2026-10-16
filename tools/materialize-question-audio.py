"""Attach durable files to content cards, preserving IDs and existing good audio.
Reuses historical Mac recordings when text matches; generates only missing files.
The normal content validator/build/import remains the sole publication pipeline.
"""
import hashlib,json,pathlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=ROOT/'content/question-banks'
def sha(data):return hashlib.sha256(data).hexdigest()
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
old={}
for location in ['native-audio/opi','web-audio/opi']:
    folder=BASE/location
    manifest=folder/'manifest.json'
    if manifest.exists():
        for row in json.loads(manifest.read_text())['rows']:old[(row['id'],row['text'])]=(row,folder/row['file'])
resources=json.loads((BASE/'resources/manifest.source.json').read_text())
by_path={r['publicPath']:r for r in resources['files']}
count=0
for topic_path in sorted((BASE/'banks').glob('*/topics/*.json')):
    topic=json.loads(topic_path.read_text()); bank=topic_path.parent.parent.name; changed=False
    for card in topic['cards']:
        if card.get('kind')=='image' or card.get('audio'):continue
        text=card.get('audioText','').strip()
        if not text:raise RuntimeError('missing_audio_text:'+card['id'])
        row,source=old.get((card['id'],text),(None,None))
        if row and source.exists():
            data=source.read_bytes()
            if sha(data)!=row['sha256']:raise RuntimeError('legacy_checksum_mismatch:'+card['id'])
            duration=row['duration']
        else:
            with tempfile.TemporaryDirectory() as tmp:
                temp=pathlib.Path(tmp);(temp/'text.txt').write_text(text)
                subprocess.run(['say','-v','Samantha','-r','165','-f',str(temp/'text.txt'),'-o',str(temp/'audio.aiff')],check=True,capture_output=True,timeout=90)
                subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(temp/'audio.aiff'),'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','64k',str(temp/'audio.mp3')],check=True,capture_output=True,timeout=30)
                data=(temp/'audio.mp3').read_bytes()
                duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(temp/'audio.mp3')],text=True))
        checksum=sha(data); key=f'revisions/{bank}/{checksum}/audio/{bank}/{card["id"]}.mp3'; public='/question-bank-assets/'+key
        dest=BASE/'resources/files'/key;dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists():dest.write_bytes(data)
        by_path[public]={'objectKey':key,'bankId':bank,'sourceRelativePath':key,'publicPath':public,'sizeBytes':len(data),'mimeType':'audio/mpeg','checksum':checksum,'status':'ready','durationSeconds':duration}
        card['audio']=public;card['audioDurationSeconds']=duration;changed=True;count+=1
    if changed:write(topic_path,topic)
resources['files']=list(by_path.values())
write(BASE/'resources/manifest.source.json',resources)
print('materialized_question_audio',count)
