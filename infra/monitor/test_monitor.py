import copy
import json
import unittest
import datetime
import tempfile
from pathlib import Path
from monitor import REQUIRED, alerts_for, summarize_logs
from dashboard_export import dashboard, project, write_dashboard


class MonitorTests(unittest.TestCase):
    def test_export_only_contains_safe_aggregates_and_preserves_missingness(self):
        snapshot = {'at': '2026-10-22T00:00:00+00:00', 'secret': 'private-secret',
                    'containers': {'icao-api': {'id': 'private-container-id', 'running': True, 'health': 'healthy'}, 'private-name': {}},
                    'api_last_5m': {'routes': {'v1/sync': {'count': 1, 'p95_ms': 20}, 'private-url': {'count': 1}}},
                    'alerts': ['warning:api_latency:v1/sync', 'critical:private-secret']}
        result = project(snapshot)
        encoded = json.dumps(result)
        self.assertNotIn('private', encoded)
        self.assertIsNone(result['cpuPercent'])
        self.assertIsNone(result['memoryPercent'])
        self.assertEqual(result['api']['routes']['v1/sync']['statuses'], {})
        self.assertEqual(result['alerts'], ['warning:api_latency:v1/sync'])

    def test_export_deduplicates_history_omits_future_and_publishes_readable_file(self):
        now = datetime.datetime(2026, 10, 22, tzinfo=datetime.timezone.utc)
        with tempfile.TemporaryDirectory() as folder:
            point = {'at': '2026-10-21T23:55:00+00:00'}
            future = {'at': '2026-10-23T00:00:00+00:00'}
            Path(folder, 'history-2026-10-21.ndjson').write_text(json.dumps(point) + '\n' + json.dumps(point) + '\n' + json.dumps(future) + '\ninvalid')
            self.assertEqual(len(dashboard(folder, now)['points']), 1)
            self.assertIsNone(dashboard(folder, now)['deepseek'])
            write_dashboard(folder)
            self.assertEqual(Path(folder, 'dashboard/dashboard.json').stat().st_mode & 0o777, 0o644)

    def test_private_request_fields_are_not_persisted(self):
        lines = [
            {'msg': 'incoming request', 'reqId': 'a', 'req': {'url': '/v1/sync/push?token=secret', 'remoteAddress': 'private'}},
            {'msg': 'request completed', 'reqId': 'a', 'res': {'statusCode': 413}, 'responseTime': 3},
            {'msg': 'incoming request', 'reqId': 'b', 'req': {'url': '/health/ready'}},
            {'msg': 'request completed', 'reqId': 'b', 'res': {'statusCode': 200}, 'responseTime': 1},
        ]
        result = summarize_logs([json.dumps(line) for line in lines] + ['not-json'])
        self.assertEqual(result['completed'], 1)
        self.assertEqual(result['statuses'], {'413': 1})
        self.assertEqual(result['routes']['v1/sync']['p95_ms'], 3)
        self.assertNotIn('secret', json.dumps(result))
        self.assertNotIn('private', json.dumps(result))
        unknown = summarize_logs([
            json.dumps({'msg': 'incoming request', 'reqId': 'c', 'req': {'url': '/v1/private-user-id/detail'}}),
            json.dumps({'msg': 'request completed', 'reqId': 'c', 'res': {'statusCode': 404}, 'responseTime': 1}),
        ])
        self.assertNotIn('private-user-id', json.dumps(unknown))
        self.assertIn('other', unknown['routes'])

    def test_resource_and_dependency_alerts(self):
        healthy = {'disk': {'used_percent': 60, 'available_bytes': 20 * 1024**3},
                   'memory_available_bytes': 4 * 1024**3, 'load_per_cpu': .3,
                   'containers': {name: {'id': name, 'running': True, 'health': 'healthy', 'restarts': 0} for name in REQUIRED},
                   'probes': {'api_local': True}, 'backup_age_hours': 10,
                   'api_last_5m': {'completed': 100, 'statuses': {'200': 100}, 'routes': {}}}
        self.assertEqual(alerts_for(healthy, {}), [])
        bad = copy.deepcopy(healthy)
        bad['disk']['used_percent'] = 97
        bad['containers']['supabase-db']['health'] = 'unhealthy'
        bad['backup_age_hours'] = 31
        bad['api_last_5m']['statuses'] = {'200': 95, '503': 4, '413': 1}
        alerts = alerts_for(bad, healthy)
        self.assertIn('critical:disk_space', alerts)
        self.assertIn('critical:container:supabase-db', alerts)
        self.assertIn('critical:database_backup_stale', alerts)
        self.assertIn('warning:api_server_errors', alerts)
        self.assertIn('warning:api_payload_rejected', alerts)


if __name__ == '__main__':
    unittest.main()
