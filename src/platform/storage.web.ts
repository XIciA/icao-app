type StorageEntry = readonly [string, string];
type StorageResult = readonly [string, string | null];
const DATABASE_NAME = 'feizhu-icao-web';
const STORE_NAME = 'key-value';
let databasePromise: Promise<IDBDatabase | null> | undefined;

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    // Static rendering has no personal workspace. A browser without storage
    // must not report a successful write to an ephemeral memory fallback.
    if (typeof window === 'undefined') return Promise.resolve(null);
    return Promise.reject(new Error('web_storage_unavailable'));
  }
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(DATABASE_NAME, 1);
    const fail = () => { failed = true; reject(request.error ?? new Error('web_storage_unavailable')); };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
    request.onerror = fail;
    request.onblocked = fail;
  });
  databasePromise = opening;
  void opening.catch(() => { if (databasePromise === opening) databasePromise = undefined; });
  return opening;
}

async function read<T>(run: (store: IDBObjectStore) => IDBRequest<T>, serverValue: T): Promise<T> {
  const database = await openDatabase();
  if (!database) return serverValue;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('web_storage_read_failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('web_storage_read_aborted'));
  });
}

async function write(run: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();
  if (!database) throw new Error('web_storage_unavailable');
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('web_storage_write_failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('web_storage_write_aborted'));
  });
}

const Storage = {
  async getItem(key: string): Promise<string | null> {
    const value = await read<unknown>(store => store.get(key), undefined);
    return typeof value === 'string' ? value : null;
  },
  async setItem(key: string, value: string): Promise<void> { await write(store => { store.put(value, key); }); },
  async removeItem(key: string): Promise<void> { await write(store => { store.delete(key); }); },
  async clear(): Promise<void> { await write(store => { store.clear(); }); },
  async getAllKeys(): Promise<string[]> {
    const keys = await read<IDBValidKey[]>(store => store.getAllKeys(), []);
    return keys.filter((key): key is string => typeof key === 'string');
  },
  async multiGet(keys: readonly string[]): Promise<StorageResult[]> {
    const database = await openDatabase();
    if (!database) return keys.map(key => [key, null] as const);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const requests = keys.map(key => store.get(key));
      transaction.oncomplete = () => resolve(keys.map((key, index) => [key,
        typeof requests[index].result === 'string' ? requests[index].result as string : null] as const));
      transaction.onerror = () => reject(transaction.error ?? new Error('web_storage_read_failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('web_storage_read_aborted'));
    });
  },
  async multiSet(entries: readonly StorageEntry[]): Promise<void> {
    await write(store => { entries.forEach(([key, value]) => store.put(value, key)); });
  },
  async multiRemove(keys: readonly string[]): Promise<void> {
    await write(store => { keys.forEach(key => store.delete(key)); });
  },
};
export default Storage;
