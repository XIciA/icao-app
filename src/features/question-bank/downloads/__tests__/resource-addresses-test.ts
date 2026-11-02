import { resourceAddresses, retryResourceTransfer } from '../resource-addresses';
const resources = Array.from({ length: 50 }, (_, index) => ({ publicPath: `/${index}.mp3`, checksum: 'a'.repeat(64), sizeBytes: 100 }));
test('a failed signature batch can be retried without retaining a rejected promise', async () => {
  const resolve = jest.fn().mockRejectedValueOnce(new Error('network_failed')).mockResolvedValue(resources.map(resource => ({ ...resource, url: 'https://test/audio', expiresIn: 300 })));
  const address = resourceAddresses(resources, resolve);
  await expect(address('/0.mp3')).rejects.toThrow('network_failed');
  await expect(address('/0.mp3')).resolves.toMatchObject({ publicPath: '/0.mp3' });
  expect(resolve).toHaveBeenCalledTimes(2);
});
test('workers may start the next signature batch before the previous batch finishes', async () => {
  let first!: (values: any[]) => void;
  const resolve = jest.fn(async (batch: typeof resources) => batch[0].publicPath === '/0.mp3'
    ? await new Promise<any[]>(done => { first = done; }) : batch.map(resource => ({ ...resource, url: 'https://test/audio', expiresIn: 300 })));
  const address = resourceAddresses(resources, resolve);
  const pending = [address('/0.mp3'), address('/1.mp3')];
  await expect(address('/24.mp3')).resolves.toMatchObject({ publicPath: '/24.mp3' });
  expect(resolve).toHaveBeenCalledTimes(2);
  first(resources.slice(0, 24).map(resource => ({ ...resource, url: 'https://test/audio', expiresIn: 300 })));
  await Promise.all(pending);
});
test('transient transfer failures retry twice; invalid content and access fail immediately', async () => {
  jest.useFakeTimers();
  try {
    const network = jest.fn().mockRejectedValueOnce(new Error('network_failed')).mockRejectedValueOnce(new Error('network_failed')).mockResolvedValue('file:ok');
    const pending = retryResourceTransfer(network, () => true);
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toBe('file:ok'); expect(network).toHaveBeenCalledTimes(3);
    for (const message of ['resource_checksum_mismatch', 'membership_required', 'ENOSPC']) {
      const failure = jest.fn().mockRejectedValue(new Error(message));
      await expect(retryResourceTransfer(failure, () => true)).rejects.toThrow(message);
      expect(failure).toHaveBeenCalledTimes(1);
    }
  } finally { jest.useRealTimers(); }
});
