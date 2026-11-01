import { describe, expect, it, vi } from 'vitest';
import { VersionedReadCache } from '../src/content/versioned-read-cache';

describe('bounded immutable release cache', () => {
  it('coalesces concurrent readers, freezes cached data and keeps versions separate', async () => {
    const cache = new VersionedReadCache<{ nested: { value: number } }>();
    const load = vi.fn(async () => ({ nested: { value: 1 } }));
    const results = await Promise.all(Array.from({ length: 100 }, () => cache.get('v1', load)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[99]);
    expect(() => { results[0]!.nested.value = 9; }).toThrow();
    expect(await cache.get('v2', async () => ({ nested: { value: 2 } }))).toEqual({ nested: { value: 2 } });
    expect(await cache.get('v1', load)).toEqual({ nested: { value: 1 } });
  });
  it('does not retain failures and allows recovery', async () => {
    const cache = new VersionedReadCache<number>();
    await expect(cache.get('v1', async () => { throw new Error('transient'); })).rejects.toThrow('transient');
    expect(await cache.get('v1', async () => 1)).toBe(1);
  });
  it('evicts least recently used versions, and bypasses oversized values', async () => {
    const cache = new VersionedReadCache<string>({ maxEntries: 2, maxBytes: 100 });
    await cache.get('a', async () => 'a'); await cache.get('b', async () => 'b');
    await cache.get('a', async () => 'wrong'); await cache.get('c', async () => 'c');
    expect(await cache.get('b', async () => 'reloaded')).toBe('reloaded');
    const large = vi.fn(async () => 'x'.repeat(100));
    await cache.get('large', large); await cache.get('large', large);
    expect(large).toHaveBeenCalledTimes(2);
  });
  it('bounds pending cache entries without changing responses on overflow', async () => {
    const cache = new VersionedReadCache<number>({ maxPending: 1 });
    let release!: (value: number) => void;
    const first = cache.get('a', () => new Promise<number>(resolve => { release = resolve; }));
    await Promise.resolve();
    const overflow = vi.fn(async () => 2);
    expect(await cache.get('b', overflow)).toBe(2);
    release(1); expect(await first).toBe(1);
    await cache.get('b', overflow);
    expect(overflow).toHaveBeenCalledTimes(2);
  });
  it('supports bypass without persisting new cache entries', async () => {
    const cache = new VersionedReadCache<number>({ enabled: false });
    let count = 0;
    expect(await cache.get('same', async () => ++count)).toBe(1);
    expect(await cache.get('same', async () => ++count)).toBe(2);
  });
});
