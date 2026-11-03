/** The browser adapter must fail closed on persistence errors, never return empty user data. */
const previousIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
function setDatabase(value: unknown) { Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value }); }
afterEach(() => {
  if (previousIndexedDB) Object.defineProperty(globalThis, 'indexedDB', previousIndexedDB);
  else Reflect.deleteProperty(globalThis, 'indexedDB');
  jest.resetModules();
});

it('rejects unavailable database writes instead of accepting a memory-only save, and retries opening', async () => {
  let opens = 0;
  const error = new Error('database_denied');
  setDatabase({ open: () => {
    opens += 1;
    const request = { error, onerror: undefined as undefined | (() => void) };
    queueMicrotask(() => request.onerror?.());
    return request;
  } });
  const storage = jest.requireActual<typeof import('../storage.web')>('../storage.web').default;
  await expect(storage.multiSet([['progress', 'value'], ['outbox', 'pending']])).rejects.toThrow('database_denied');
  await expect(storage.getItem('progress')).rejects.toThrow('database_denied');
  expect(opens).toBe(2);
});

it('closes a late connection after a blocked open instead of silently switching storage', async () => {
  const close = jest.fn();
  const request = { error: null, result: { close }, onblocked: undefined as undefined | (() => void), onsuccess: undefined as undefined | (() => void) };
  setDatabase({ open: () => { queueMicrotask(() => request.onblocked?.()); return request; } });
  const storage = jest.requireActual<typeof import('../storage.web')>('../storage.web').default;
  await expect(storage.setItem('progress', 'value')).rejects.toThrow('web_storage_unavailable');
  request.onsuccess?.();
  expect(close).toHaveBeenCalledTimes(1);
});

it('rejects aborted multi-reads and writes rather than returning an empty dataset or success', async () => {
  const database = { transaction: () => {
    const transaction = {
      error: new Error('quota_or_io_failure'), onabort: undefined as undefined | (() => void),
      objectStore: () => ({ get: () => ({ result: 'existing' }), put: jest.fn() }),
    };
    queueMicrotask(() => transaction.onabort?.());
    return transaction;
  } };
  setDatabase({ open: () => {
    const request = { result: database, onsuccess: undefined as undefined | (() => void) };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } });
  const storage = jest.requireActual<typeof import('../storage.web')>('../storage.web').default;
  await expect(storage.multiGet(['progress', 'outbox'])).rejects.toThrow('quota_or_io_failure');
  await expect(storage.getItem('progress')).rejects.toThrow('quota_or_io_failure');
  await expect(storage.multiSet([['progress', 'new']])).rejects.toThrow('quota_or_io_failure');
});
