import SQLiteStorage from 'expo-sqlite/kv-store';

// Expo's multiSet/multiRemove open a separate transaction connection. Writers
// must exclude every other operation until the complete SDK operation settles.
// Reads can share the connection; a slow old-account read must not block another
// read. A queued writer closes that read group, so later reads cannot starve it.
let writer: Promise<unknown> = Promise.resolve();
const readers = new Set<Promise<unknown>>();
function read<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> => {
    const result = writer.catch(() => undefined).then(() => operation(...args));
    readers.add(result);
    void result.then(() => readers.delete(result), () => readers.delete(result));
    return result;
  };
}
function write<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> => {
    const preceding = Promise.allSettled([writer, ...readers]);
    readers.clear();
    const result = preceding.then(() => operation(...args));
    writer = result;
    return result;
  };
}

export default {
  getItem: read((key: string) => SQLiteStorage.getItem(key)),
  setItem: write((...args: Parameters<typeof SQLiteStorage.setItem>) => SQLiteStorage.setItem(...args)),
  removeItem: write((key: string) => SQLiteStorage.removeItem(key)),
  getAllKeys: read(() => SQLiteStorage.getAllKeys()),
  multiGet: read((keys: string[]) => SQLiteStorage.multiGet(keys)),
  multiSet: write((entries: [string, string][]) => SQLiteStorage.multiSet(entries)),
  multiRemove: write((keys: string[]) => SQLiteStorage.multiRemove(keys)),
  clear: write(() => SQLiteStorage.clear()),
};
