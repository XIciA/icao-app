const mockDatabases = new Map<string, Map<string, string>>();
jest.mock('expo-sqlite/kv-store', () => {
  class SQLiteStorage {
    private values: Map<string, string>;
    constructor(name: string) {
      if (!mockDatabases.has(name)) mockDatabases.set(name, new Map());
      this.values = mockDatabases.get(name)!;
    }
    async getItem(key: string) { return this.values.get(key) ?? null; }
    async setItem(key: string, value: string) { this.values.set(key, value); }
    async clear() { this.values.clear(); }
    async getAllKeys() { return [...this.values.keys()]; }
    async multiGet(keys: string[]) { return keys.map(key => [key, this.values.get(key) ?? null]); }
    async multiSet(entries: [string, string][]) { entries.forEach(([key, value]) => this.values.set(key, value)); }
    async multiRemove(keys: string[]) { keys.forEach(key => this.values.delete(key)); }
    async removeItem(key: string) { this.values.delete(key); }
  }
  return { __esModule: true, default: new SQLiteStorage('ExpoSQLiteStorage'), SQLiteStorage };
});

const original = process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT;
const originalKey = process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT;
  else process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT = original;
  if (originalKey === undefined) delete process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY;
  else process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY = originalKey;
  jest.resetModules();
});

function load(environment?: string) {
  if (environment === undefined) delete process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT;
  else process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT = environment;
  jest.resetModules();
  return require('../storage').default as typeof import('../storage').default;
}

test('production → testing → shipped production preserves independent pending writes and cleanup', async () => {
  mockDatabases.clear();
  const production = load();
  await production.multiSet([['outbox', 'real-user-work'], ['session', 'real-session']]);
  const testing = load('testing');
  expect(await testing.getAllKeys()).toEqual([]);
  await testing.multiSet([['outbox', 'test-work'], ['session', 'test-session']]);
  expect(await load('production').multiGet(['outbox', 'session'])).toEqual([
    ['outbox', 'real-user-work'], ['session', 'real-session'],
  ]);
  await load('testing').clear();
  expect(await load().getItem('outbox')).toBe('real-user-work');
});

test('testing files and Keychain use a separate namespace without renaming existing production data', () => {
  load();
  expect(require('@/config/data-environment').dataStorageName('icao.auth.session')).toBe('icao.auth.session');
  load('testing');
  expect(require('@/config/data-environment').dataStorageName('icao.auth.session')).toBe('icao-testing.icao.auth.session');
  expect(require('@/config/data-environment').dataStorageName('icao-recordings')).toBe('icao-testing.icao-recordings');
  expect(() => load('sandbox')).toThrow('invalid_data_environment');
});


test('testing offline signatures require a separate public key', () => {
  load('testing');
  const { contentCredentialPublicKey } = require('@/config/data-environment');
  delete process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY;
  expect(contentCredentialPublicKey).toThrow('testing_content_public_key_missing_or_shared');
  process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY = require('@icao/contracts').CONTENT_CREDENTIAL_PUBLIC_KEY_BASE64;
  expect(contentCredentialPublicKey).toThrow('testing_content_public_key_missing_or_shared');
  process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
  expect(contentCredentialPublicKey()).toBe(process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY);
});
