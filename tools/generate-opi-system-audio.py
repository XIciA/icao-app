import pathlib,json,hashlib,subprocess,concurrent.futures,os,time
root=pathlib.Path(__file__).resolve().parent.parent;out=root/'.generated/opi-system-audio';out.mkdir(parents=True,exist_ok=True)
settings={'voice':'Samantha','rate':165,'sampleRate':24000,'bitrate':'64k','macOS':subprocess.check_output(['sw_vers','-productVersion'],text=True).strip()}
rows=[]
for p in sorted((root/'content/question-banks/banks/opi/topics').glob('*.json')):
 for c in json.loads(p.read_text())['cards']:
  if c.get('kind')=='image' or not c.get('audioText'):continue
  rows.append({'id':c['id'],'text':c['audioText'],'topic':p.stem})
def generate(r):
 key=hashlib.sha256(json.dumps({'text':r['text'],'settings':settings},sort_keys=True).encode()).hexdigest();dest=out/(r['id']+'-'+key[:12]+'.mp3');textfile=out/(r['id']+'.txt');aiff=out/(r['id']+'.aiff')
 if not dest.exists():
  textfile.write_text(r['text']);subprocess.run(['say','-v',settings['voice'],'-r',str(settings['rate']),'-f',str(textfile),'-o',str(aiff)],check=True,capture_output=True,timeout=90)
  part=dest.with_suffix('.part.mp3');subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(aiff),'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','64k',str(part)],check=True,capture_output=True,timeout=30);part.replace(dest);aiff.unlink();textfile.unlink()
 subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(dest),'-f','null','-'],check=True,capture_output=True,timeout=30)
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dest)],text=True,timeout=15))
 if duration<.4:raise RuntimeError('short_audio:'+r['id'])
 return dict(r,file=dest.name,recipeHash=key,duration=duration,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for item in pool.map(generate,rows):
  results.append(item)
  if len(results)%100==0:print('opi_audio_progress',len(results),'/',len(rows),flush=True)
(out/'manifest.json').write_text(json.dumps({'settings':settings,'distributionAuthorization':'unresolved','count':len(results),'rows':results},ensure_ascii=False,indent=2))
print('opi_audio_complete',len(results),sum(x['duration'] for x in results),flush=True)
