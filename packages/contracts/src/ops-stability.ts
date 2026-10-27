/** Aggregate-only internal operations measurements; no account/request identifiers. */
export type StabilityRoute = { count: number; p95Ms: number | null; statuses: Record<string, number> };
export type StabilityPoint = {
  at: string; diskPercent: number | null; diskAvailableBytes: number | null;
  cpuPercent: number | null; memoryPercent: number | null; loadPerCpu: number | null;
  backupAgeHours: number | null; probes: Record<string, boolean>;
  containers: { name: string; running: boolean; health: string; restarts: number }[];
  api: { completed: number; statuses: Record<string, number>; routes: Record<string, StabilityRoute>; truncated: boolean };
  alerts: string[];
};
export type StabilityMonitor = {
  version: 1; generatedAt: string; points: StabilityPoint[];
  deepseek: { at: string; available: boolean; balances: { currency: string; total: number }[] } | null;
};
export type StabilityAiBucket = {
  at: string; capability: string; total: number; succeeded: number; failed: number;
  p95Ms: number | null; estimatedCny: number | null; missingCost: number;
};
export type StabilityDashboard = {
  generatedAt: string; from: string; to: string;
  monitor: StabilityMonitor | null;
  ai: StabilityAiBucket[] | null;
  activity: { at: string; accounts: number; clicks: number }[] | null;
  sources: { monitor: 'ok' | 'unavailable'; ai: 'ok' | 'unavailable'; activity: 'ok' | 'unavailable' };
};
