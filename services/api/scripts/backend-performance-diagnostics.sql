-- Read-only, aggregate diagnostics. Run only against an explicitly selected database.
-- No query text, parameters, tokens, account IDs or customer content are returned.
-- These are database-side connections, not the driver's waiting request queue.
BEGIN READ ONLY;
SELECT application_name, state, wait_event_type, wait_event, count(*) AS connections,
       max(extract(epoch FROM (clock_timestamp() - xact_start))) AS oldest_transaction_seconds
FROM pg_stat_activity
WHERE datname = current_database() AND application_name IN ('icao-api', 'icao-ops-api')
GROUP BY application_name, state, wait_event_type, wait_event
ORDER BY application_name, state, wait_event_type, wait_event;
SELECT a.application_name, l.locktype, l.mode, l.granted, count(*) AS locks
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
WHERE a.datname = current_database() AND a.application_name IN ('icao-api', 'icao-ops-api')
GROUP BY a.application_name, l.locktype, l.mode, l.granted
ORDER BY a.application_name, l.locktype, l.mode, l.granted;
COMMIT;
