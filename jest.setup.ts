jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
const mockKvStorageValues = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({
  clear: jest.fn(async () => mockKvStorageValues.clear()),
  getItem: jest.fn(async (key: string) => mockKvStorageValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockKvStorageValues.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockKvStorageValues.delete(key); }),
  getAllKeys: jest.fn(async () => Array.from(mockKvStorageValues.keys())),
  multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockKvStorageValues.get(key) ?? null])),
  multiSet: jest.fn(async (entries: [string, string][]) => entries.forEach(([key, value]) => mockKvStorageValues.set(key, value))),
  multiRemove: jest.fn(async (keys: string[]) => keys.forEach((key) => mockKvStorageValues.delete(key))),
}));
jest.mock('@/components/ui/icons', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
