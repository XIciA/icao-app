import { Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { StabilityAiBucket, StabilityDashboard, StabilityMonitor } from '@icao/contracts';
import { DatabaseService } from '../database/database.service';

const nonnegative = z.number().finite().nonnegative();
const percent = nonnegative.max(100).nullable();
const statuses = z.record(z.string().regex(/^[1-5]\d\d$/), nonnegative.int());
const names = z.enum(['icao-api', 'icao-gateway', 'icao-ops-api', 'icao-ops-web', 'supabase-db', 'supabase-storage', 'supabase-auth', 'supabase-kong']);
const group = z.string().regex(/^(?:v1\/(?:sync|question-banks|ai|resources|commerce|product-clicks|account|legal-consent|content-access|app-content|auth|hooks|feedback|vocabulary|editorial)|other|unknown)$/);
export const monitorSchema = z.object({
  version: z.literal(1), generatedAt: z.iso.datetime({ offset: true }),
  points: z.array(z.object({
    at: z.iso.datetime({ offset: true }), diskPercent: percent, diskAvailableBytes: nonnegative.nullable(),
    cpuPercent: percent, memoryPercent: percent, loadPerCpu: nonnegative.nullable(), backupAgeHours: nonnegative.nullable(),
    probes: z.object({ api_local: z.boolean().optional(), api_public: z.boolean().optional() }),
    containers: z.array(z.object({ name: names, running: z.boolean(), health: z.enum(['healthy', 'unhealthy', 'starting', 'none', 'unknown']), restarts: nonnegative.int() })).max(8),
    api: z.object({ completed: nonnegative.int(), statuses,
      routes: z.record(group, z.object({ count: nonnegative.int(), p95Ms: nonnegative.nullable(), statuses })), truncated: z.boolean() }),
    alerts: z.array(z.string().regex(/^(?:critical|warning):[a-z_]+(?::(?:[a-z_-]+|v1\/[a-z-]+))?$/).max(100)).max(64),
  })).max(2200),
  deepseek: z.object({ at: z.iso.datetime({ offset: true }), available: z.boolean(), balances: z.array(z.object({ currency: z.enum(['CNY', 'USD']), total: nonnegative })).max(2) }).nullable(),
});

export async function readMonitor(file: string): Promise<StabilityMonitor | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 8 * 1024 * 1024) return null;
    return monitorSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch { return null; }
}

@Injectable()
export class AdminStabilityService {
  private cached?: { at: number; data: StabilityDashboard };
  private pending?: Promise<StabilityDashboard>;
  constructor(private readonly database: DatabaseService) {}

  async snapshot(): Promise<StabilityDashboard> {
    if (this.cached && Date.now() - this.cached.at < 60_000) return this.cached.data;
    if (this.pending) return this.pending;
    this.pending = this.collect().then(data => { this.cached = { at: Date.now(), data }; return data; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async collect(): Promise<StabilityDashboard> {
    const to = new Date();
    // Seven complete/partial Shanghai calendar days, matching the existing reports.
    const from = new Date(to);
    from.setUTCHours(16, 0, 0, 0);
    if (from > to) from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCDate(from.getUTCDate() - 6);
    const start = from.toISOString(), end = to.toISOString();
    const monitorFile = process.env.NODE_ENV === 'production' ? '/run/icao-monitor/dashboard.json'
      : join(homedir(), '.config/icao-app/local-ops/monitor-dashboard.json');
    const [monitor, aggregates] = await Promise.all([
      readMonitor(monitorFile),
      this.database.db.transaction(async tx => {
        await tx.execute(sql`set transaction read only`);
        await tx.execute(sql`set local statement_timeout = '5s'`);
        const ai = await tx.execute(sql`
          select date_trunc('hour', created_at) as at, capability,
            count(*)::int as total,
            count(*) filter (where status = 'success')::int as succeeded,
            count(*) filter (where status = 'failed')::int as failed,
            percentile_disc(0.95) within group (order by latency_ms) filter (where status = 'success') as p95_ms,
            sum(cost_microunits)::float8 / 1000000 as estimated_cny,
            count(*) filter (where cost_microunits is null)::int as missing_cost
          from ai_usage_logs where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz
          group by 1, 2 order by 1, 2`);
        const activity = await tx.execute(sql`
          select date_trunc('day', created_at at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' as at,
            count(distinct account_id)::int as accounts, count(*)::int as clicks
          from product_click_events where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz
          group by 1 order by 1`);
        return { ai, activity };
      }).catch(() => null),
    ]);
    const ai: StabilityAiBucket[] | null = aggregates ? aggregates.ai.map(row => ({
      at: new Date(String(row.at)).toISOString(), capability: String(row.capability), total: Number(row.total),
      succeeded: Number(row.succeeded), failed: Number(row.failed), p95Ms: row.p95_ms == null ? null : Number(row.p95_ms),
      estimatedCny: row.estimated_cny == null ? null : Number(row.estimated_cny), missingCost: Number(row.missing_cost),
    })) : null;
    return { generatedAt: end, from: start, to: end, monitor, ai,
      activity: aggregates ? aggregates.activity.map(row => ({ at: new Date(String(row.at)).toISOString(), accounts: Number(row.accounts), clicks: Number(row.clicks) })) : null,
      sources: { monitor: monitor ? 'ok' : 'unavailable', ai: ai ? 'ok' : 'unavailable', activity: aggregates ? 'ok' : 'unavailable' } };
  }
}
