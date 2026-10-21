import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorSchema, readMonitor } from '../src/admin/admin-stability.service';
import { AdminStabilityService } from '../src/admin/admin-stability.service';
import type { DatabaseService } from '../src/database/database.service';
import type { StabilityAiBucket, StabilityPoint } from '@icao/contracts';

describe('stability measurements', () => {
  it('projects the monitor schema without copying arbitrary fields', () => {
    const parsed = monitorSchema.parse({ version: 1, generatedAt: '2026-10-22T00:00:00Z', points: [], deepseek: null, token: 'private' });
    expect(parsed).not.toHaveProperty('token');
    expect(monitorSchema.safeParse({ ...parsed, points: [{ at: 'bad' }] }).success).toBe(false);
  });
  it('handles missing, oversized and malformed exports without making up zeros', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icao-stability-'));
    const file = join(dir, 'dashboard.json');
    try {
      expect(await readMonitor(file)).toBeNull();
      await writeFile(file, '{bad'); expect(await readMonitor(file)).toBeNull();
      await writeFile(file, ' '.repeat(8 * 1024 * 1024 + 1)); expect(await readMonitor(file)).toBeNull();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('weights success by completed calls and preserves unknown costs', async () => {
    const { aiRate, costBuckets } = await import('../../../apps/ops/src/stability-data.js');
    const base = { at: '2026-10-21T17:00:00Z', capability: 'polish', total: 10, succeeded: 9, failed: 1, p95Ms: 30, estimatedCny: null, missingCost: 10 } satisfies StabilityAiBucket;
    expect(aiRate([]).rate).toBeNull();
    expect(aiRate([base, { ...base, total: 90, succeeded: 45, failed: 45 }]).rate).toBe(54);
    expect(costBuckets([base], true)[0]).toMatchObject({ at: '2026-10-22T00:00:00+08:00', value: null, missing: 10 });
    expect(costBuckets([base, { ...base, estimatedCny: 2, missingCost: 0 }], true)[0]).toMatchObject({ value: 2, missing: 10 });
  });
  it('does not invent alert recovery across an unsampled gap', async () => {
    const { monitorEvents } = await import('../../../apps/ops/src/stability-data.js');
    const a = { at: '2026-10-22T00:00:00Z', alerts: ['warning:disk_space'] } as StabilityPoint;
    expect(monitorEvents([a, { ...a, at: '2026-10-22T00:05:00Z', alerts: [] }])).toHaveLength(1);
    expect(monitorEvents([a, { ...a, at: '2026-10-22T01:00:00Z', alerts: [] }])).toHaveLength(0);
  });
  it('coalesces concurrent expensive aggregate queries and returns partial source failure', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const service = new AdminStabilityService({ db: { transaction } } as unknown as DatabaseService);
    const [a, b] = await Promise.all([service.snapshot(), service.snapshot()]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(a).toBe(b); expect(a.ai).toBeNull(); expect(a.sources.ai).toBe('unavailable');
    await service.snapshot(); expect(transaction).toHaveBeenCalledTimes(1);
  });
});
