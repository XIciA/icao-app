import { expect, it, vi } from 'vitest';
import { ResourceController } from '../src/resource/resource.controller';
import type { ResourceService } from '../src/resource/resource.service';
import type { AuthenticatedRequest } from '../src/auth/auth.types';
const request = { id: 'request', user: { id: 'account' }, auth: { sessionId: 'session' } } as AuthenticatedRequest;
const resource = { publicPath: '/question-bank-assets/audio/one.mp3', checksum: 'a'.repeat(64) };
it('batch resolution uses the same authorized account, session, environment and checksum as streaming', async () => {
  const resolve = vi.fn(async () => ({ publicPath: resource.publicPath, checksum: resource.checksum }));
  const controller = new ResourceController({ resolve } as unknown as ResourceService);
  const result = await controller.batch({ resources: [resource] }, 'production', request);
  expect(resolve).toHaveBeenCalledWith('account', resource.publicPath, 'session', 'production', resource.checksum);
  expect(result.data).toHaveLength(1);
});
it('resolves vocabulary and question-bank download resources through the same service', async () => {
  const word = { ...resource, publicPath: `/pronunciation-assets/${'b'.repeat(64)}.mp3` };
  const resolve = vi.fn(async (_account, publicPath, _session, _environment, checksum) => ({ publicPath, checksum }));
  const controller = new ResourceController({ resolve } as unknown as ResourceService);
  const result = await controller.batch({ resources: [word, resource] }, 'production', request);
  expect(result.data).toEqual([word, resource]);
  expect(resolve).toHaveBeenCalledWith('account', word.publicPath, 'session', 'production', word.checksum);
  await controller.resolve(word.publicPath, word.checksum, 'production', request);
  expect(resolve.mock.calls[0]).toEqual(resolve.mock.calls[2]);
});
it('rejects oversized, malformed and unsupported batches before resolving anything', async () => {
  const resolve = vi.fn(); const controller = new ResourceController({ resolve } as unknown as ResourceService);
  for (const resources of [[], Array(25).fill(resource), [{ ...resource, checksum: 123 }], [{ ...resource, publicPath: '/private/key' }], [{ ...resource, publicPath: '/pronunciation-assets/../private/key' }], [{ ...resource, publicPath: '/editorial-assets/item.mp3' }], [null]]) {
    await expect(controller.batch({ resources } as never, 'production', request)).rejects.toThrow('invalid_download_resources');
  }
  expect(resolve).not.toHaveBeenCalled();
});
it('does not turn permission errors into playable URLs', async () => {
  const controller = new ResourceController({ resolve: vi.fn().mockRejectedValue(new Error('membership_required')) } as unknown as ResourceService);
  await expect(controller.batch({ resources: [resource] }, 'production', request)).rejects.toThrow('membership_required');
});
