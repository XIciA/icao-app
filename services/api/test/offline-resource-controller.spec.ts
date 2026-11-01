import { expect, it, vi } from 'vitest';
import { ResourceController } from '../src/resource/resource.controller';
import type { ResourceService } from '../src/resource/resource.service';
import type { AuthenticatedRequest } from '../src/auth/auth.types';
const request = { id: 'request', user: { id: 'account' }, auth: { sessionId: 'session' } } as AuthenticatedRequest;
const resource = { publicPath: '/question-bank-assets/audio/one.mp3', checksum: 'a'.repeat(64) };
it('batch resolution uses the same authorized account, session, environment and checksum as streaming', async () => {
  const resolveBatch = vi.fn(async () => [resource]);
  const controller = new ResourceController({ resolveBatch } as unknown as ResourceService);
  const result = await controller.batch({ resources: [resource] }, 'production', request);
  expect(resolveBatch).toHaveBeenCalledWith('account', [resource], 'session', 'production');
  expect(result.data).toHaveLength(1);
});
it('resolves vocabulary and question-bank download resources through the same service', async () => {
  const word = { ...resource, publicPath: `/pronunciation-assets/${'b'.repeat(64)}.mp3` };
  const resolveBatch = vi.fn(async (_account, resources) => resources);
  const resolve = vi.fn(async () => word);
  const controller = new ResourceController({ resolveBatch, resolve } as unknown as ResourceService);
  const result = await controller.batch({ resources: [word, resource] }, 'production', request);
  expect(result.data).toEqual([word, resource]);
  expect(resolveBatch).toHaveBeenCalledWith('account', [word, resource], 'session', 'production');
  await controller.resolve(word.publicPath, word.checksum, 'production', request);
  expect(resolve).toHaveBeenCalledWith('account', word.publicPath, 'session', 'production', word.checksum);
});
it('rejects oversized, malformed and unsupported batches before resolving anything', async () => {
  const resolveBatch = vi.fn(); const controller = new ResourceController({ resolveBatch } as unknown as ResourceService);
  for (const resources of [[], Array(25).fill(resource), [{ ...resource, checksum: 123 }], [{ ...resource, publicPath: '/private/key' }], [{ ...resource, publicPath: '/pronunciation-assets/../private/key' }], [{ ...resource, publicPath: '/editorial-assets/item.mp3' }], [null]]) {
    await expect(controller.batch({ resources } as never, 'production', request)).rejects.toThrow('invalid_download_resources');
  }
  expect(resolveBatch).not.toHaveBeenCalled();
});
it('does not turn permission errors into playable URLs', async () => {
  const controller = new ResourceController({ resolveBatch: vi.fn().mockRejectedValue(new Error('membership_required')) } as unknown as ResourceService);
  await expect(controller.batch({ resources: [resource] }, 'production', request)).rejects.toThrow('membership_required');
});
