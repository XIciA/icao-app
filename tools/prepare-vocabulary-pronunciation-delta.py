"""Prepare a resumable, verified, local-only immutable audio handoff. Never uploads or touches a database."""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess

ROOT=pathlib.Path(__file__).resolve().parent.parent
digest=lambda data:hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base-ref',default='origin/main')
    parser.add_argument('--output-root',required=True)
    parser.add_argument('--catalog', default='content/vocabulary/three-books/dataset.json')
    parser.add_argument('--source', default='content/vocabulary/three-books/source.json')
    args=parser.parse_args()
    destination=pathlib.Path(args.output_root).resolve()
    baseline=json.loads(subprocess.check_output(['git','show',args.base_ref+':content/pronunciations/manifest.json'],cwd=ROOT,text=True))
    current=json.loads((ROOT/'content/pronunciations/manifest.json').read_text())
    old={row['publicPath']:row for row in baseline['files']}
    now={row['publicPath']:row for row in current['files']}
    assert all(now.get(key)==row for key,row in old.items()),'published_pronunciations_changed'
    new=[row for row in current['files'] if row['publicPath'] not in old]
    destination.mkdir(parents=True,exist_ok=True)
    for row in new:
        relative=pathlib.Path(row['objectKey'])
        assert not relative.is_absolute() and '..' not in relative.parts,'invalid_object_key'
        source=ROOT/'content/pronunciations/files'/relative
        data=source.read_bytes()
        assert len(data)==row['sizeBytes'] and digest(data)==row['checksum'],'source_audio_invalid'
        target=destination/'files'/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or digest(target.read_bytes())!=row['checksum']:
            temp=target.with_suffix('.tmp');shutil.copyfile(source,temp);temp.replace(target)
        assert target.stat().st_size==row['sizeBytes'] and digest(target.read_bytes())==row['checksum'],'copied_audio_invalid'
    metadata={'schemaVersion':1,'baseRef':args.base_ref,'baseCommit':subprocess.check_output(['git','rev-parse',args.base_ref],cwd=ROOT,text=True).strip(),'preservedFiles':len(old),'newFiles':len(new),'newBytes':sum(r['sizeBytes'] for r in new),'manifestChecksum':digest((ROOT/'content/pronunciations/manifest.json').read_bytes()),'catalogChecksum':digest((ROOT/args.catalog).read_bytes()),'sourceChecksum':digest((ROOT/args.source).read_bytes())}
    for name,value in [('manifest.delta.json',{'schemaVersion':1,'files':new}),('receipt.json',metadata)]:
        target=destination/name;temp=target.with_suffix('.tmp')
        temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
    print(json.dumps(metadata,ensure_ascii=False))

if __name__=='__main__':main()
