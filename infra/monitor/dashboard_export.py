"""Allowlisted, bounded aggregates for the authenticated Ops dashboard."""
import datetime
import json
import math
import os
from pathlib import Path
import tempfile

GROUPS = {'v1/' + name for name in ('sync', 'question-banks', 'ai', 'resources', 'commerce',
          'product-clicks', 'account', 'legal-consent', 'content-access', 'app-content',
          'auth', 'hooks', 'feedback', 'vocabulary', 'editorial')} | {'other', 'unknown'}
CONTAINERS = {'icao-api', 'icao-gateway', 'icao-ops-api', 'icao-ops-web',
              'supabase-db', 'supabase-storage', 'supabase-auth', 'supabase-kong'}


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None


def statuses(value):
    return {str(k): int(v) for k, v in value.items()
            if str(k).isdigit() and 100 <= int(k) <= 599 and number(v) is not None} if isinstance(value, dict) else {}


def project(snapshot):
    # Never copy raw logs, request URLs, container IDs, paths or environment values.
    api = snapshot.get('api_last_5m', {})
    routes = {}
    for name, stats in api.get('routes', {}).items():
        if name in GROUPS:
            routes[name] = {'count': number(stats.get('count')) or 0,
                            'p95Ms': number(stats.get('p95_ms')),
                            'statuses': statuses(stats.get('statuses'))}
    total = number(snapshot.get('memory_total_bytes'))
    available = number(snapshot.get('memory_available_bytes'))
    return {'at': snapshot['at'], 'diskPercent': number(snapshot.get('disk', {}).get('used_percent')),
            'diskAvailableBytes': number(snapshot.get('disk', {}).get('available_bytes')),
            'cpuPercent': number(snapshot.get('cpu_percent')),
            'memoryPercent': round((1 - available / total) * 100, 1) if total and available is not None else None,
            'loadPerCpu': number(snapshot.get('load_per_cpu')),
            'backupAgeHours': number(snapshot.get('backup_age_hours')),
            'probes': {k: v for k, v in snapshot.get('probes', {}).items()
                       if k in ('api_local', 'api_public') and isinstance(v, bool)},
            'containers': [{'name': name, 'running': value.get('running') is True,
                            'health': value.get('health') if value.get('health') in ('healthy', 'unhealthy', 'starting', 'none') else 'unknown',
                            'restarts': number(value.get('restarts')) or 0}
                           for name, value in snapshot.get('containers', {}).items() if name in CONTAINERS],
            'api': {'completed': number(api.get('completed')) or 0, 'statuses': statuses(api.get('statuses')),
                    'routes': routes, 'truncated': snapshot.get('log_sample_may_be_truncated') is True},
            'alerts': [a for a in snapshot.get('alerts', []) if isinstance(a, str) and
                       (a in {'critical:disk_space', 'warning:disk_space', 'critical:memory_available',
                              'warning:cpu_load', 'critical:database_backup_stale', 'warning:api_payload_rejected',
                              'warning:api_server_errors'} or a in {'critical:probe:' + p for p in ('api_local', 'api_public')}
                        or a in {'critical:container:' + c for c in CONTAINERS}
                        or a in {'warning:container_restarted:' + c for c in CONTAINERS}
                        or a in {'warning:api_latency:' + r for r in GROUPS})]}


def dashboard(state, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    snapshots = {}
    for file in sorted(Path(state).glob('history-*.ndjson'))[-7:]:
        # Bound input size even if a file is corrupt or replaced.
        if file.is_symlink() or file.stat().st_size > 16 * 1024**2:
            continue
        for line in file.read_text().splitlines()[-400:]:
            try:
                source = json.loads(line)
                at = datetime.datetime.fromisoformat(source['at'])
                if now - datetime.timedelta(days=7) <= at <= now:
                    snapshots[source['at']] = project(source)
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
    try:
        current = json.loads((Path(state) / 'status.json').read_text())
        at = datetime.datetime.fromisoformat(current['at'])
        if now - datetime.timedelta(days=7) <= at <= now:
            snapshots[current['at']] = project(current)
    except (OSError, ValueError, KeyError, TypeError):
        current = {}
    balance = current.get('deepseek_balance')
    safe_balance = None
    if isinstance(balance, dict) and isinstance(balance.get('at'), str) and isinstance(balance.get('available'), bool):
        safe_balance = {'at': balance['at'], 'available': balance['available'],
                        'balances': [{'currency': b['currency'], 'total': float(b['total'])}
                                     for b in balance.get('balances', [])[:2]
                                     if b.get('currency') in ('CNY', 'USD') and number(b.get('total')) is not None]}
    return {'version': 1, 'generatedAt': now.isoformat(), 'points': sorted(snapshots.values(), key=lambda s: s['at'])[-2200:],
            'deepseek': safe_balance}


def write_dashboard(state):
    # Bind this subdirectory directly read-only into Ops; the parent stays 0700.
    folder = Path(state) / 'dashboard'
    folder.mkdir(mode=0o755, exist_ok=True)
    os.chmod(folder, 0o755)
    fd, temp = tempfile.mkstemp(dir=folder)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(dashboard(state), output, allow_nan=False)
        os.chmod(temp, 0o644)
        os.replace(temp, folder / 'dashboard.json')
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
