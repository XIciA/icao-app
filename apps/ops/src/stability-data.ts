import type { StabilityAiBucket, StabilityPoint } from '@icao/contracts';

export const capabilityNames: Record<string, string> = { transcribe: '语音转写', grammar_review: '语法纠错', polish: '表达优化' };
export const shanghaiDay = (at: string) => new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
export const stamp = (at?: string | null) => at ? new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未接入';
export const finite = (n: number | null | undefined) => n != null && Number.isFinite(n) ? n : null;
export function aiRate(rows: StabilityAiBucket[]) {
  const succeeded = rows.reduce((n, r) => n + r.succeeded, 0);
  const completed = rows.reduce((n, r) => n + r.succeeded + r.failed, 0);
  return { succeeded, completed, rate: completed ? succeeded / completed * 100 : null };
}
export function costBuckets(rows: StabilityAiBucket[], daily: boolean) {
  const groups = new Map<string, { known: number; value: number; missing: number }>();
  for (const row of rows) {
    const at = daily ? shanghaiDay(row.at) + 'T00:00:00+08:00' : row.at;
    const entry = groups.get(at) ?? { known: 0, value: 0, missing: 0 };
    if (row.estimatedCny != null) { entry.known++; entry.value += row.estimatedCny; }
    entry.missing += row.missingCost;
    groups.set(at, entry);
  }
  return [...groups.entries()].map(([at, v]) => ({ at, value: v.known ? v.value : null, missing: v.missing })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function routeP95(point: StabilityPoint, name: string) { return point.api.routes[name]?.p95Ms ?? null; }
export function statusCount(point: StabilityPoint, prefix: string) { return Object.entries(point.api.statuses).reduce((n, [code, count]) => n + (code.startsWith(prefix) ? count : 0), 0); }
export function monitorEvents(points: StabilityPoint[]) {
  const events: { at: string; text: string }[] = [];
  const names: Record<string, string> = { disk_space: '磁盘空间', memory_available: '可用内存', cpu_load: 'CPU 负载', database_backup_stale: '备份时效', api_payload_rejected: '上传大小限制', api_server_errors: '接口 5xx', container: '核心容器', container_restarted: '容器重启', probe: '接口探测', api_latency: '接口耗时' };
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!, current = points[i]!;
    if (Date.parse(current.at) - Date.parse(previous.at) > 10 * 60_000) continue;
    const added = current.alerts.filter(a => !previous.alerts.includes(a));
    const removed = previous.alerts.filter(a => !current.alerts.includes(a));
    for (const [list, state] of [[added, '出现异常'], [removed, '恢复']] as const) for (const code of list) {
      const [, kind, detail] = code.split(':');
      events.push({ at: current.at, text: `${names[kind!] ?? '监控项'}${detail ? ` · ${detail}` : ''}：${state}` });
    }
  }
  return events.reverse().slice(0, 30);
}
