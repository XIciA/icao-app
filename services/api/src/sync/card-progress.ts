import type { CardStateMutation } from '@icao/contracts';
type State = CardStateMutation['payload']['state'];

/** Cumulative progress and latest visit survive out-of-order device versions. */
export function mergeCardProgress(current: State, incoming: State, acceptMutable: boolean, now = Date.now()): State {
  const dates = [current.lastVisitedAt, incoming.lastVisitedAt]
    .map(value => value ? Date.parse(value) : NaN).filter(Number.isFinite)
    .map(value => Math.min(value, now));
  return {
    ...(acceptMutable ? incoming : current),
    visited: current.visited || incoming.visited,
    completed: current.completed || incoming.completed,
    ...(dates.length ? { lastVisitedAt: new Date(Math.max(...dates)).toISOString() } : {}),
  };
}
