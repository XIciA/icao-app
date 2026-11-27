#!/usr/bin/env python3
"""Deploy an exact develop archive to testing; never reads production .env."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = Path('/opt/icao/testing')

def run(args, **kw):
    return subprocess.run(args, check=True, **kw)

def main():
    sha, digest = sys.argv[1:]
    assert re.fullmatch('[a-f0-9]{40}', sha) and re.fullmatch('[a-f0-9]{64}', digest)
    lock = open('/run/lock/icao-testing-deploy.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    assert (ROOT / 'restore-complete.json').is_file()
    network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', 'icao-testing']))[0]
    assert network['Internal'] is True
    db = json.loads(subprocess.check_output(['docker', 'inspect', 'icao-testing-db']))[0]
    assert db['Config']['Labels']['com.docker.compose.project'] == 'icao-testing'
    release = ROOT / 'releases' / sha
    archive = release / 'source.tar.gz'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest
    source = release / 'source'
    source.mkdir(exist_ok=False)
    with tarfile.open(archive) as tar:
        for entry in tar.getmembers():
            path = Path(entry.name)
            assert not path.is_absolute() and '..' not in path.parts
            assert entry.isfile() or entry.isdir(), 'unexpected_archive_entry_type'
        tar.extractall(source)
    image = 'icao-api:testing-' + sha
    run(['docker', 'build', '--label', 'org.opencontainers.image.revision=' + sha,
         '--build-arg', 'ICAO_API_RELEASE_ID=testing-' + sha[:12],
         '-t', image, '-f', str(source / 'infra/api/Dockerfile'), str(source)])
    image_id = subprocess.check_output(['docker', 'image', 'inspect', '-f', '{{.Id}}', image], text=True).strip()
    compose_path = ROOT / 'compose.json'
    compose = json.loads(compose_path.read_text())
    assert compose['name'] == 'icao-testing'
    database_url = compose['services']['api']['environment']['DATABASE_URL']
    from urllib.parse import urlparse
    parsed = urlparse(database_url)
    assert parsed.hostname == 'db' and parsed.path == '/icao_testing'
    migration_env = release / 'migration.env'
    migration_env.write_text('DATABASE_URL=' + database_url + '\nNODE_ENV=test\nICAO_DATA_ENVIRONMENT=testing\n')
    migration_env.chmod(0o600)
    runtime = ['docker', 'run', '--rm', '--network', 'icao-testing', '--env-file', str(migration_env), image_id, 'node']
    run([*runtime, 'services/api/scripts/migration-plan.mjs'])
    run([*runtime, 'services/api/scripts/migrate.mjs', '--testing-apply'])
    run([*runtime, 'services/api/scripts/migration-plan.mjs', '--require-current'])
    (release / 'previous-compose.json').write_text(compose_path.read_text())
    (release / 'previous-compose.json').chmod(0o600)
    compose['services']['api']['image'] = image_id
    compose['services']['api']['environment']['API_RELEASE_ID'] = 'testing-' + sha[:12]
    compose_path.write_text(json.dumps(compose, indent=2))
    run(['docker', 'compose', '-f', str(compose_path), 'up', '-d', '--no-deps', 'api'])
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://172.30.244.10:3101/health/ready', timeout=5) as response:
                if response.status == 200 and response.headers.get('x-icao-api-version') == 'testing-' + sha[:12]:
                    evidence = {'environment': 'testing', 'commit': sha, 'image': image_id,
                                'archiveSha256': digest, 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                    (ROOT / 'deployment.json').write_text(json.dumps(evidence, indent=2))
                    print(json.dumps(evidence))
                    return
        except Exception:
            pass
        time.sleep(2)
    raise SystemExit('testing_candidate_health_failed: production was not changed')

if __name__ == '__main__':
    main()
