/** One foreground timer for writes, recovery and changes made on another device. */
export function createSyncScheduler(run: () => Promise<unknown>, enabled: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt = 0;
  let generation = 0;
  let failures = 0;
  function cancel() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = undefined;
    dueAt = 0;
    failures = 0;
  }
  function schedule(delay = 800) {
    if (!enabled()) return;
    const due = Date.now() + delay;
    // A stream of writes must not postpone an already scheduled upload.
    if (timer && dueAt <= due) return;
    if (timer) clearTimeout(timer);
    dueAt = due;
    const expected = generation;
    timer = setTimeout(async () => {
      timer = undefined;
      if (expected !== generation || !enabled()) return;
      let succeeded = false;
      try { await run(); succeeded = true; } catch { /* Persisted queue remains retryable. */ }
      if (expected !== generation || !enabled()) return;
      failures = succeeded ? 0 : failures + 1;
      schedule(succeeded ? 30_000 : Math.min(2_000 * 2 ** Math.min(failures - 1, 5), 60_000));
    }, delay);
  }
  return { schedule, cancel };
}
