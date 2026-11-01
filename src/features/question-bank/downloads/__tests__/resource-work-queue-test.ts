import { runResourceWorkers } from '../resource-work-queue';

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test.each([2, 4])('bounds workers to %i and does not skip or duplicate work', async limit => {
  let active = 0, maximum = 0;
  const seen: number[] = [];
  await runResourceWorkers(Array.from({ length: 11 }, (_, index) => index), limit, () => true, async value => {
    maximum = Math.max(maximum, ++active); await tick(); seen.push(value); active--;
  });
  expect(maximum).toBe(limit); expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, index) => index));
});
test('first failure cancels sibling ownership, stops dispatch and drains before rejecting', async () => {
  const held = gate(); let siblingCurrent!: () => boolean; const seen: number[] = [];
  const task = runResourceWorkers([1, 2, 3], 2, () => true, async (item, current) => {
    seen.push(item);
    if (item === 1) { await tick(); throw new Error('network_failed'); }
    siblingCurrent = current; await held.promise;
  });
  let settled = false; const checked = expect(task.finally(() => { settled = true; })).rejects.toThrow('network_failed');
  await tick(); await tick(); expect(siblingCurrent()).toBe(false); expect(settled).toBe(false); expect(seen).toEqual([1, 2]);
  held.resolve(); await checked;
});
test('external cancellation drains active workers without assigning remaining resources', async () => {
  const held = gate(); let current = true; const seen: number[] = [];
  const task = runResourceWorkers([1, 2, 3], 2, () => current, async item => { seen.push(item); await held.promise; });
  const checked = expect(task).rejects.toThrow('下载已暂停'); current = false; held.resolve(); await checked;
  expect(seen).toEqual([1, 2]);
});
