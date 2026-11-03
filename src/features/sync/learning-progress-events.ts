const listeners = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | undefined;
export function subscribeLearningProgress(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Coalesce a pulled page of card changes; notify only after durable writes. */
export function notifyLearningProgress() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    for (const listener of listeners) {
      try { listener(); } catch { /* A view cannot fail the sync commit. */ }
    }
  }, 50);
}
