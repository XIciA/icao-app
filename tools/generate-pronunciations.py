"""Materialize repeatable Mac recordings. No runtime speech, network or publication.
Run with --check to verify coverage and every local checksum without changing files.
Audio bytes stay outside Git; the manifest is the durable publication inventory.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, re, subprocess, tempfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'content/pronunciations'
FILES = OUT / 'files'
def normalize(text):
    return re.sub(r'\s+', ' ', re.sub(r'[()（）]', ' ', text.replace('/', ' or '))).strip()
def digest(data):
    return hashlib.sha256(data).hexdigest()
def collect():
    texts = set()
    for book in json.loads((ROOT/'content/vocabulary/dataset.json').read_text())['books']:
        for word in book['words']:
            texts.update(normalize(word[k]) for k in ('word', 'example') if word.get(k))
    unified = ROOT/'content/vocabulary/three-books/source.json'
    if unified.exists():
        for word in json.loads(unified.read_text())['entries']:
            texts.update(normalize(text) for text in (word['word'], word.get('pronunciationText', word['word']), word['example']))
    core = ROOT/'content/vocabulary/question-bank-core/source.json'
    if core.exists():
        for word in json.loads(core.read_text())['entries']:
            texts.update(normalize(text) for text in (word['word'], word.get('pronunciationText', word['word']), word['example']))
    for entry in json.loads((ROOT/'src/features/question-bank/static-word-lookup/data/dataset.json').read_text())['entries']:
        texts.update(normalize(entry[k]) for k in ('word', 'example') if isinstance(entry.get(k), str) and entry[k].strip())
    return sorted(texts)
def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    manifest_path = OUT/'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'files': []}
    existing = {r['text']: r for r in old['files']}
    texts = collect()
    if args.check:
        for text in texts:
            row = existing.get(text)
            if not row: raise RuntimeError('missing_pronunciation:'+text)
            data = (FILES/row['objectKey']).read_bytes()
            if digest(data) != row['checksum'] or len(data) != row['sizeBytes']: raise RuntimeError('audio_checksum_mismatch:'+row['objectKey'])
        print('pronunciations_check_ok', len(texts)); return
    settings = {'provider': 'macOS-say', 'voice': 'Samantha', 'rate': 165, 'sampleRate': 24000, 'bitrate': '64k', 'macOS': subprocess.check_output(['sw_vers', '-productVersion'], text=True).strip()}
    def generate(text):
        previous = existing.get(text)
        if previous:
            dest = FILES/previous['objectKey']
            if dest.exists() and digest(dest.read_bytes()) == previous['checksum']: return previous
        recipe = digest(json.dumps({'text': text, 'settings': settings}, sort_keys=True).encode())
        key = 'pronunciations/'+recipe+'.mp3'; dest = FILES/key; dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            with tempfile.TemporaryDirectory() as temp:
                temp = pathlib.Path(temp); (temp/'text.txt').write_text(text)
                subprocess.run(['say', '-v', settings['voice'], '-r', str(settings['rate']), '-f', str(temp/'text.txt'), '-o', str(temp/'audio.aiff')], check=True, capture_output=True, timeout=90)
                subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(temp/'audio.aiff'), '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame', '-b:a', '64k', str(dest)+'.part.mp3'], check=True, capture_output=True, timeout=30)
                pathlib.Path(str(dest)+'.part.mp3').replace(dest)
        decoded = subprocess.run(['ffmpeg', '-v', 'info', '-nostdin', '-i', str(dest), '-af', 'volumedetect', '-f', 'null', '-'], check=True, capture_output=True, text=True, timeout=30)
        peak = re.search(r'max_volume: ([-.\d]+) dB', decoded.stderr)
        if not peak or float(peak.group(1)) <= -60: raise RuntimeError('silent_audio:'+text)
        duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dest)], text=True))
        if not .15 < duration < 180: raise RuntimeError('invalid_duration:'+text)
        data=dest.read_bytes()
        return {'text': text, 'objectKey': key, 'publicPath': '/pronunciation-assets/'+digest(text.encode())+'.mp3', 'bankId':'vocabulary', 'checksum':digest(data), 'sizeBytes':len(data), 'mimeType':'audio/mpeg', 'status':'ready', 'durationSeconds':duration, 'recipe':settings}
    # Preserve previous files so old content keeps working after a vocabulary update.
    rows = dict(existing)
    def checkpoint():
        temporary = manifest_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'schemaVersion':1, 'files':sorted(rows.values(), key=lambda r:r['publicPath'])}, ensure_ascii=False, indent=2)+'\n'); temporary.replace(manifest_path)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for index, row in enumerate(pool.map(generate,texts),1):
            rows[row['text']] = row
            if index % 100 == 0: checkpoint(); print('pronunciation_progress',index,'/',len(texts),flush=True)
    checkpoint(); print('pronunciation_complete',len(texts),flush=True)
if __name__ == '__main__': main()
