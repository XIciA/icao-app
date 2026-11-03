import NativeStorage from 'expo-sqlite/kv-store';
import Storage from '../storage';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => { await Storage.clear(); jest.clearAllMocks(); });

test('an atomic learning save excludes concurrent audio reads and download writes', async () => {
  const gate = deferred();
  const events: string[] = [];
  let transaction = false;
  jest.mocked(NativeStorage.multiSet).mockImplementationOnce(async () => {
    transaction = true; events.push('begin'); await gate.promise;
    transaction = false; events.push('commit');
  });
  jest.mocked(NativeStorage.getItem).mockImplementationOnce(async () => {
    if (transaction) throw new Error('database is locked');
    events.push('audio'); return 'local-audio-index';
  });
  jest.mocked(NativeStorage.setItem).mockImplementationOnce(async () => {
    if (transaction) throw new Error('database is locked');
    events.push('download');
  });
  const saving = Storage.multiSet([['progress', 'new'], ['outbox', 'new']]);
  const audio = Storage.getItem('audio-index');
  const download = Storage.setItem('download-state', 'complete');
  await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 10 && !events.length; i++) await Promise.resolve();
  expect(events).toEqual(['begin']);
  gate.resolve();
  await expect(audio).resolves.toBe('local-audio-index');
  await Promise.all([saving, download]);
  expect(events).toEqual(['begin', 'commit', 'audio', 'download']);
});

test('a failed transaction is reported and does not poison later storage operations', async () => {
  await Storage.multiSet([['progress', 'old'], ['outbox', 'old']]);
  jest.mocked(NativeStorage.multiSet).mockRejectedValueOnce(new Error('disk full'));
  await expect(Storage.multiSet([['progress', 'new'], ['outbox', 'new']])).rejects.toThrow('disk full');
  expect(await Storage.multiGet(['progress', 'outbox'])).toEqual([['progress', 'old'], ['outbox', 'old']]);
  await Storage.setItem('audio-index', 'valid');
  expect(await Storage.getItem('audio-index')).toBe('valid');
});

test('account cleanup and reads wait for an accepted save, without exposing partial state', async () => {
  const gate = deferred();
  const original = jest.mocked(NativeStorage.multiSet).getMockImplementation()!;
  jest.mocked(NativeStorage.multiSet).mockImplementationOnce(async entries => { await gate.promise; await original(entries); });
  const save = Storage.multiSet([['account-a', 'saved']]);
  const remove = Storage.multiRemove(['account-a']);
  const read = Storage.getAllKeys();
  gate.resolve(); await Promise.all([save, remove]);
  expect(await read).not.toContain('account-a');
});


test('independent reads overlap but a queued writer excludes earlier and later readers', async () => {
  const oldRead = deferred(); const writeGate = deferred();
  const events: string[] = [];
  jest.mocked(NativeStorage.getItem).mockImplementationOnce(async () => { events.push('old-read'); await oldRead.promise; return 'old'; });
  jest.mocked(NativeStorage.getItem).mockImplementationOnce(async () => { events.push('new-read'); return 'new'; });
  const first = Storage.getItem('old-account');
  await expect(Storage.getItem('new-account')).resolves.toBe('new');
  expect(events).toEqual(['old-read', 'new-read']);
  jest.mocked(NativeStorage.multiSet).mockImplementationOnce(async () => { events.push('write'); await writeGate.promise; });
  const writing = Storage.multiSet([['outbox', 'new']]);
  jest.mocked(NativeStorage.getItem).mockImplementationOnce(async () => { events.push('after-write'); return 'new'; });
  const last = Storage.getItem('audio');
  await Promise.resolve(); expect(events).toEqual(['old-read', 'new-read']);
  oldRead.resolve(); await first;
  for (let i = 0; i < 10 && !events.includes('write'); i++) await Promise.resolve();
  expect(events).toEqual(['old-read', 'new-read', 'write']);
  writeGate.resolve(); await Promise.all([writing, last]);
  expect(events).toEqual(['old-read', 'new-read', 'write', 'after-write']);
});
