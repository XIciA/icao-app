"""Attach approved OPI recordings to the existing release format, without changing Web."""
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'dist/question-bank-release'
DEST = ROOT / 'dist/native-question-bank-release'
AUDIO = ROOT / 'content/question-banks/native-audio/opi'

def read(path):
    return json.loads(path.read_text())

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    manifest = read(SOURCE / 'manifest.json')
    resources = read(SOURCE / manifest['resources']['file'])
    recordings = read(AUDIO / 'manifest.json')
    rows = {row['id']: row for row in recordings['rows']}
    if len(rows) != recordings['count'] or len(rows) != 1067:
        raise ValueError('opi_recording_count_mismatch')
    opi = read(SOURCE / 'banks/opi.json')
    used = set()
    for category in opi['categories']:
        for topic in category['topics']:
            for card in topic['cards']:
                if card.get('kind') == 'image':
                    continue
                row = rows.get(card['id'])
                if not row or row['text'] != card.get('audioText'):
                    raise ValueError('opi_text_mismatch:' + card['id'])
                file = AUDIO / row['file']
                if file.parent != AUDIO or file.stat().st_size != row['bytes'] or hashlib.sha256(file.read_bytes()).hexdigest() != row['sha256']:
                    raise ValueError('opi_audio_integrity:' + card['id'])
                relative = 'audio/opi/rev13/' + row['file']
                card['audio'] = '/question-bank-assets/' + relative
                card['audioDurationSeconds'] = row['duration']
                resources['files'].append(dict(objectKey='v13/' + relative, bankId='opi', publicPath=card['audio'], sizeBytes=row['bytes'], mimeType='audio/mpeg', checksum=row['sha256'], status='ready', durationSeconds=row['duration']))
                used.add(card['id'])
    if used != set(rows):
        raise ValueError('opi_unused_recordings')
    shutil.copytree(SOURCE, DEST, dirs_exist_ok=True)
    checksum = write(DEST / 'banks/opi.json', opi)
    for bank in manifest['banks']:
        if bank['id'] == 'opi':
            bank['checksum'] = checksum
    manifest['resources']['checksum'] = write(DEST / manifest['resources']['file'], resources)
    manifest['resources']['files'] = len(resources['files'])
    manifest['resources']['sizeBytes'] = sum(row['sizeBytes'] for row in resources['files'])
    write(DEST / 'manifest.json', manifest)
    print('native_opi_audio_prepared', len(used), DEST)

if __name__ == '__main__':
    main()
