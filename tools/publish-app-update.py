#!/usr/bin/env python3
"""Publish one reviewed channel; preserve other channels and back up the previous manifest.
Run on the storage host. Credentials are read from its existing env file, never logged.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

BASE = 'https://cloud.readyoufife.com/storage/v1/object'
MANIFEST = '/app-releases/updates.json'


def validate(release):
    channel = release.get('channel')
    if channel not in ('ios-app-store', 'android-apk') or release.get('available') is not True:
        raise ValueError('Only available official releases may be published')
    if not re.fullmatch(r'\d+\.\d+\.\d+', release.get('version', '')):
        raise ValueError('Invalid version')
    if type(release.get('build')) is not int or release['build'] <= 0:
        raise ValueError('Invalid build')
    if not isinstance(release.get('notes'), str) or len(release['notes']) > 2000:
        raise ValueError('Invalid notes')
    datetime.datetime.fromisoformat(release['publishedAt'].replace('Z', '+00:00'))
    if channel == 'ios-app-store':
        if release['url'] != 'https://apps.apple.com/cn/app/id6800583111':
            raise ValueError('Invalid App Store URL')
    else:
        if not re.fullmatch(re.escape(BASE + '/public/app-releases/android/') + r'[A-Za-z0-9._-]+\.apk', release['url']):
            raise ValueError('Invalid APK URL')
        if not re.fullmatch(r'[a-f0-9]{64}', release.get('sha256', '')):
            raise ValueError('APK checksum required')
        if type(release.get('sizeBytes')) is not int or release['sizeBytes'] <= 0:
            raise ValueError('APK size required')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--release', required=True)
    parser.add_argument('--apk')
    parser.add_argument('--backup-dir', required=True)
    args = parser.parse_args()
    release = json.loads(Path(args.release).read_text())
    validate(release)
    values = dict(line.split('=', 1) for line in Path(args.env_file).read_text().splitlines() if '=' in line and not line.startswith('#'))
    key = values.get('SERVICE_ROLE_KEY', '').strip().strip('"').strip("'")
    if not key:
        raise ValueError('Storage service credential missing')

    def request(method, suffix, data=None, content_type='application/json', upsert=False):
        headers = {'Authorization': 'Bearer ' + key, 'apikey': key, 'Content-Type': content_type,
                   'Cache-Control': 'no-cache' if method == 'GET' else 'max-age=60' if suffix == MANIFEST else 'max-age=31536000',
                   'x-upsert': 'true' if upsert else 'false'}
        req = urllib.request.Request(BASE + suffix, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.read()

    previous = request('GET', '/authenticated' + MANIFEST)
    manifest = json.loads(previous)
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('releases'), list):
        raise ValueError('Unsupported existing manifest')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = Path(args.backup_dir) / ('updates-before-' + stamp + '.json')
    backup.parent.mkdir(parents=True, exist_ok=True)
    backup.write_bytes(previous)
    if release['channel'] == 'android-apk':
        if not args.apk:
            raise ValueError('APK path required')
        apk = Path(args.apk).read_bytes()
        if len(apk) != release['sizeBytes'] or hashlib.sha256(apk).hexdigest() != release['sha256']:
            raise ValueError('Local APK differs from reviewed release')
        suffix = release['url'].removeprefix(BASE + '/public')
        try:
            existing = request('GET', '/authenticated' + suffix)
        except urllib.error.HTTPError as error:
            if error.code not in (400, 404):
                raise
            request('POST', suffix, apk, 'application/vnd.android.package-archive')
        else:
            if hashlib.sha256(existing).hexdigest() != release['sha256']:
                raise ValueError('Immutable APK URL already contains different bytes')
        # Verify the publicly downloadable object before advertising it to old apps / website.
        with urllib.request.urlopen(release['url'], timeout=180) as response:
            public_hash = hashlib.sha256(response.read()).hexdigest()
        if public_hash != release['sha256']:
            raise ValueError('Public APK verification failed')
    if request('GET', '/authenticated' + MANIFEST) != previous:
        raise ValueError('Manifest changed concurrently; retry against its new state')
    manifest['releases'] = [item for item in manifest['releases'] if item.get('channel') != release['channel']] + [release]
    result = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    request('POST', MANIFEST, result, upsert=True)
    actual = json.loads(request('GET', '/authenticated' + MANIFEST))
    if actual != manifest:
        raise ValueError('Published manifest readback differs')
    print(json.dumps({'channel': release['channel'], 'version': release['version'], 'build': release['build'],
                      'url': release['url'], 'backup': str(backup)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit('Storage request failed: HTTP ' + str(error.code)) from None
