import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'icao.auth.session',
};

function metaKey(key: string) {
  return `${key}.meta`;
}

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

async function chunkCount(key: string) {
  const value = await SecureStore.getItemAsync(metaKey(key), OPTIONS);
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export const secureSessionStorage = {
  async getItem(key: string) {
    const count = await chunkCount(key);
    if (!count) return null;
    const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index), OPTIONS)));
    return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join('') : null;
  },

  async setItem(key: string, value: string) {
    const previousCount = await chunkCount(key);
    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk, OPTIONS)));
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length), OPTIONS);
    await Promise.all(Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) => SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset), OPTIONS)));
  },

  async removeItem(key: string) {
    const count = await chunkCount(key);
    await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index), OPTIONS)));
    await SecureStore.deleteItemAsync(metaKey(key), OPTIONS);
  },
};
