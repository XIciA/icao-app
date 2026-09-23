import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['/', '/v1/admin/users'],
  ['/admin/', '/admin/v1/admin/users'],
  ['/admin/', '/admin/v1/admin/auth/login'],
])('uses the correct same-origin route from %s', async (pathname, expected) => {
  vi.stubGlobal('location', { pathname });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const path = expected.replace(/^\/admin/, '');
  const { opsResponse } = await import('../../../apps/ops/src/api.js');
  await opsResponse(path, {}, false);
  expect(fetch.mock.calls[0]?.[0]).toBe(expected);
});
