import copy
import json
import unittest
from monitor import REQUIRED, alerts_for, summarize_logs


class MonitorTests(unittest.TestCase):
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
