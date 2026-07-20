type StorageEntry = readonly [string, string];
type StorageResult = readonly [string, string | null];

const DATABASE_NAME = 'feizhu-icao-web';
const DATABASE_VERSION = 1;
const STORE_NAME = 'key-value';
const memoryFallback = new Map<string, string>();

let databasePromise: Promise<IDBDatabase | null> | undefined;

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return databasePromise;
}

async function read<T>(run: (store: IDBObjectStore) => IDBRequest<T>, fallback: () => T): Promise<T> {
  const database = await openDatabase();
  if (!database) return fallback();

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(fallback());
  });
}

async function write(run: (store: IDBObjectStore) => void, fallback: () => void): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    fallback();
    return;
  }

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
    const value = await read<IDBValidKey | undefined>(
      (store) => store.get(key),
      () => memoryFallback.get(key),
    );
    return typeof value === 'string' ? value : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await write(
      (store) => { store.put(value, key); },
      () => { memoryFallback.set(key, value); },
    );
  },

  async removeItem(key: string): Promise<void> {
    await write(
      (store) => { store.delete(key); },
      () => { memoryFallback.delete(key); },
    );
  },

  async clear(): Promise<void> {
    await write(
      (store) => { store.clear(); },
      () => { memoryFallback.clear(); },
    );
  },

  async getAllKeys(): Promise<string[]> {
    const keys = await read<IDBValidKey[]>(
      (store) => store.getAllKeys(),
      () => [...memoryFallback.keys()],
    );
    return keys.filter((key): key is string => typeof key === 'string');
  },

  async multiGet(keys: readonly string[]): Promise<StorageResult[]> {
    return Promise.all(keys.map(async (key) => [key, await Storage.getItem(key)] as const));
  },

  async multiSet(entries: readonly StorageEntry[]): Promise<void> {
    await write(
      (store) => { entries.forEach(([key, value]) => store.put(value, key)); },
      () => { entries.forEach(([key, value]) => memoryFallback.set(key, value)); },
    );
  },

  async multiRemove(keys: readonly string[]): Promise<void> {
    await write(
      (store) => { keys.forEach((key) => store.delete(key)); },
      () => { keys.forEach((key) => memoryFallback.delete(key)); },
    );
  },
};

export default Storage;
