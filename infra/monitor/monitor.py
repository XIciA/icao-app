#!/usr/bin/env python3
"""Root-only, bounded production health snapshots. Never persist raw requests."""
import collections
import datetime
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
from dashboard_export import write_dashboard

STATE = Path('/var/lib/icao-monitor')
REQUIRED = {'icao-api', 'icao-gateway', 'icao-ops-api', 'icao-ops-web',
            'supabase-db', 'supabase-storage', 'supabase-auth', 'supabase-kong'}
API_GROUPS = {'sync', 'question-banks', 'ai', 'resources', 'commerce',
              'product-clicks', 'account', 'legal-consent', 'content-access',
              'app-content', 'auth', 'hooks', 'feedback', 'vocabulary', 'editorial'}


def balance_due(balance, now=None):
    """Node emits UTC Z; Python 3.10 needs an explicit +00:00 offset."""
    now = time.time() if now is None else now
    try:
        at = datetime.datetime.fromisoformat(balance['at'].replace('Z', '+00:00')).timestamp()
        return now - at >= 3600 or at > now + 300
    except (ValueError, TypeError, KeyError, AttributeError):
        return True


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=30)


def summarize_logs(lines):
    statuses = collections.Counter()
    routes = collections.defaultdict(list)
    requests = {}
    request_bytes = []
    route_statuses = collections.defaultdict(collections.Counter)
    for line in lines:
        try:
            item = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(item, dict):
            continue
        request_id = item.get('reqId')
        if item.get('msg') == 'incoming request':
            path = item.get('req', {}).get('url', '').split('?')[0]
            # Keep only fixed service prefixes, never query values, IDs or IPs.
            parts = path.strip('/').split('/')
            known_api = len(parts) >= 2 and parts[0] == 'v1' and parts[1] in API_GROUPS
            known_health = parts[:2] in (['health', 'ready'], ['health', 'live'])
            route = '/'.join(parts[:2]) if known_api or known_health else 'other'
            requests[request_id] = route
        elif item.get('msg') == 'request completed':
            route = requests.pop(request_id, 'unknown')
            if route.startswith('health/'):
                continue
            code = item.get('res', {}).get('statusCode')
            statuses[str(code)] += 1
            route_statuses[route][str(code)] += 1
            elapsed = item.get('responseTime')
            if isinstance(elapsed, (int, float)) and math.isfinite(elapsed):
                routes[route].append(elapsed)
        elif item.get('event') == 'sync_upload':
            size = item.get('requestBytes')
            if isinstance(size, (int, float)):
                request_bytes.append(size)
    return {
        'completed': sum(statuses.values()), 'statuses': dict(statuses),
        'routes': {key: {'count': len(values), 'statuses': dict(route_statuses[key]), 'p95_ms': round(sorted(values)[math.ceil(len(values) * .95) - 1], 1)}
                   for key, values in routes.items()},
        'max_sync_upload_bytes': max(request_bytes, default=None),
    }


def alerts_for(snapshot, previous):
    alerts = []
    disk = snapshot['disk']
    if disk['used_percent'] >= 90 or disk['available_bytes'] < 3 * 1024**3:
        alerts.append('critical:disk_space')
    elif disk['used_percent'] >= 80:
        alerts.append('warning:disk_space')
    if snapshot['memory_available_bytes'] < 512 * 1024**2:
        alerts.append('critical:memory_available')
    if snapshot['load_per_cpu'] > 1.5:
        alerts.append('warning:cpu_load')
    for name in sorted(REQUIRED):
        current = snapshot['containers'].get(name, {})
        if not current.get('running') or current.get('health') not in ('healthy', 'none'):
            alerts.append('critical:container:' + name)
        old = previous.get('containers', {}).get(name, {})
        if (current.get('id') == old.get('id') and
                current.get('restarts', 0) > old.get('restarts', 0)):
            alerts.append('warning:container_restarted:' + name)
    for name, ok in snapshot['probes'].items():
        if not ok:
            alerts.append('critical:probe:' + name)
    if snapshot['backup_age_hours'] is None or snapshot['backup_age_hours'] > 30:
        alerts.append('critical:database_backup_stale')
    api = snapshot['api_last_5m']
    if api['statuses'].get('413', 0):
        alerts.append('warning:api_payload_rejected')
    errors = sum(n for code, n in api['statuses'].items() if code.startswith('5'))
    if errors and (errors >= 5 or errors / max(api['completed'], 1) >= .01):
        alerts.append('warning:api_server_errors')
    for route, stats in api['routes'].items():
        if stats['count'] >= 20 and stats['p95_ms'] > 2000 and route != 'v1/ai':
            alerts.append('warning:api_latency:' + route)
    return sorted(alerts)


def collect(previous=None):
    previous = previous or {}
    disk = os.statvfs('/')
    usable = disk.f_blocks - disk.f_bfree + disk.f_bavail
    memory = {line.split(':')[0]: int(line.split()[1]) * 1024
              for line in Path('/proc/meminfo').read_text().splitlines()}
    containers = {}
    state_format = ('{"id":{{json .Id}},"running":{{json .State.Running}},'
                    '"health":{{with index .State "Health"}}{{json .Status}}{{else}}"none"{{end}},'
                    '"restarts":{{.RestartCount}}}')
    for name in REQUIRED:
        try:
            containers[name] = json.loads(run('docker', 'inspect', '--format', state_format, name))
        except (subprocess.SubprocessError, ValueError, KeyError):
            containers[name] = {'running': False}
    probes = {}
    for name, url in {'api_local': 'http://127.0.0.1:3101/health/ready',
                      'api_public': 'https://api.readyoufife.com/health/ready'}.items():
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                data = json.load(response)
                probes[name] = response.status == 200 and data.get('data', {}).get('database') == 'ok'
        except (OSError, ValueError):
            probes[name] = False
    dumps = list(Path('/opt/icao/backups/postgres').glob('*.dump'))
    latest = max((f.stat().st_mtime for f in dumps if f.stat().st_size > 0), default=None)
    # A strict tail bounds memory even during request floods.
    logs = run('docker', 'logs', '--since', '5m', '--tail', '20000', 'icao-api')
    cpu = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    counters = {'total': sum(cpu), 'idle': cpu[3] + cpu[4]}
    old = previous.get('cpu_counters', {})
    delta = counters['total'] - old.get('total', counters['total'])
    idle_delta = counters['idle'] - old.get('idle', counters['idle'])
    cpu_percent = round(100 * (1 - idle_delta / delta), 1) if delta > 0 and 0 <= idle_delta <= delta else None
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'cpu_counters': counters, 'cpu_percent': cpu_percent,
            'disk': {'used_percent': round((disk.f_blocks - disk.f_bfree) / usable * 100, 1),
                     'available_bytes': disk.f_bavail * disk.f_frsize},
            'memory_available_bytes': memory['MemAvailable'],
            'memory_total_bytes': memory['MemTotal'],
            'load_per_cpu': round(os.getloadavg()[0] / (os.cpu_count() or 1), 2),
            'containers': containers, 'probes': probes,
            'backup_age_hours': round((time.time() - latest) / 3600, 2) if latest else None,
            'api_last_5m': summarize_logs(logs.splitlines()),
            'log_sample_may_be_truncated': len(logs.splitlines()) >= 20000}


def main():
    os.umask(0o077)
    STATE.mkdir(mode=0o700, exist_ok=True)
    status = STATE / 'status.json'
    try:
        previous = json.loads(status.read_text())
    except (OSError, ValueError):
        previous = {}
    try:
        snapshot = collect(previous)
        snapshot['deepseek_balance'] = previous.get('deepseek_balance')
        # Balance is read inside the existing API container; the key never leaves it.
        balance = snapshot['deepseek_balance']
        if balance_due(balance):
            try:
                code = """(async()=>{const k=process.env.DEEPSEEK_API_KEY;if(!k)process.exit(1);const r=await fetch('https://api.deepseek.com/user/balance',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(5000)});if(!r.ok)process.exit(1);const d=await r.json();process.stdout.write(JSON.stringify({at:new Date().toISOString(),available:d.is_available===true,balances:(d.balance_infos||[]).filter(b=>['CNY','USD'].includes(b.currency)&&Number.isFinite(Number(b.total_balance))).map(b=>({currency:b.currency,total:Number(b.total_balance)}))}));})().catch(()=>process.exit(1))"""
                snapshot['deepseek_balance'] = json.loads(run('docker', 'exec', 'icao-api', 'node', '-e', code))
            except (subprocess.SubprocessError, ValueError):
                pass  # Keep the last good balance and its original timestamp.
        snapshot['alerts'] = alerts_for(snapshot, previous)
    except Exception:
        # Keep failures visible without exposing environment or exception payloads.
        print('CRITICAL monitor_collection_failed', flush=True)
        raise SystemExit(1)
    for alert in snapshot['alerts']:
        if alert not in previous.get('alerts', []):
            print('ALERT ' + alert, flush=True)
    for alert in previous.get('alerts', []):
        if alert not in snapshot['alerts']:
            print('RECOVERED ' + alert, flush=True)
    fd, temp = tempfile.mkstemp(dir=STATE)
    with os.fdopen(fd, 'w') as output:
        json.dump(snapshot, output)
    os.replace(temp, status)
    # One bounded daily stream; retain seven UTC days of aggregate snapshots.
    today = datetime.datetime.now(datetime.timezone.utc).date()
    for old in STATE.glob('history-*.ndjson'):
        if old.name < 'history-' + (today - datetime.timedelta(days=6)).isoformat() + '.ndjson':
            old.unlink()
    with (STATE / ('history-' + today.isoformat() + '.ndjson')).open('a') as output:
        output.write(json.dumps(snapshot) + '\n')
    write_dashboard(STATE)
    print(json.dumps({'at': snapshot['at'], 'alerts': snapshot['alerts'],
                      'disk': snapshot['disk'], 'api_requests_5m': snapshot['api_last_5m']['completed']}), flush=True)


if __name__ == '__main__':
    main()
