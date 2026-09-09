const mockStorage = new Map<string, string>();
const mockGetItem = jest.fn(async (key: string) => mockStorage.get(key) ?? null);
const mockSetItem = jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); });
const mockEnqueue = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('@/platform/storage', () => ({ __esModule: true, default: {
  getItem: (...args: [string]) => mockGetItem(...args),
  setItem: (...args: [string, string]) => mockSetItem(...args),
  removeItem: async (key: string) => { mockStorage.delete(key); },
} }));
jest.mock('@/features/sync/learning-sync.native', () => ({ enqueueAccountProfile: (...args: unknown[]) => mockEnqueue(...args) }));

import { EXAM_GOALS, DEFAULT_PROFILE, normalizeProfile } from '../profile-model';
import { readProfile, replaceProfileFromSync, setProfileAccount, updateProfile } from '../profile-store.native';

beforeEach(() => {
  setProfileAccount(undefined);
  mockStorage.clear();
  jest.clearAllMocks();
  mockGetItem.mockImplementation(async (key) => mockStorage.get(key) ?? null);
  mockSetItem.mockImplementation(async (key, value) => { mockStorage.set(key, value); });
});

it('keeps profile and target with their account across logout and account changes', async () => {
  setProfileAccount('account-a');
  expect(await readProfile()).toEqual(DEFAULT_PROFILE);
  await updateProfile({ displayName: '学员 A', target: 'icao5-recert' });
  expect(mockEnqueue).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'icao5-recert' }));
  setProfileAccount(undefined);
  expect(await readProfile()).toEqual(DEFAULT_PROFILE);
  setProfileAccount('account-b');
  expect(await readProfile()).toEqual(DEFAULT_PROFILE);
  await replaceProfileFromSync({ displayName: '学员 B', target: 'icao4-recert' });
  setProfileAccount('account-a');
  expect(await readProfile()).toMatchObject({ displayName: '学员 A', target: 'icao5-recert' });
});

it('does not publish or enqueue a successful save when local persistence fails', async () => {
  setProfileAccount('account-a');
  await readProfile();
  mockSetItem.mockRejectedValueOnce(new Error('disk_full'));
  await expect(updateProfile({ target: 'icao5-first' })).rejects.toThrow('disk_full');
  expect(await readProfile()).toEqual(DEFAULT_PROFILE);
  expect(mockEnqueue).not.toHaveBeenCalled();
});

it('discards a delayed read from the account that has been left', async () => {
  let complete!: (raw: string) => void;
  mockGetItem.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  setProfileAccount('account-a');
  const previousRead = readProfile();
  setProfileAccount('account-b');
  await replaceProfileFromSync({ displayName: '学员 B', target: 'icao4-first' });
  complete(JSON.stringify({ displayName: '学员 A', target: 'icao5-recert' }));
  await previousRead;
  expect(await readProfile()).toMatchObject({ displayName: '学员 B', target: 'icao4-first' });
});

it('never syncs a device file path as an avatar and uses ICAO4 initial for unsupported targets', () => {
  expect(normalizeProfile({ avatarUri: 'file:///another-account/photo.jpg', target: 'ICAO 6 级' }))
    .toMatchObject({ avatarUri: null, target: 'icao4-first' });
});

it('uses the four approved home bank orders independently of exam module order', () => {
  expect(EXAM_GOALS.map(({ banks }) => banks)).toEqual([
    ['listening', 'sentences900', 'radiotelephony', 'opi'],
    ['radiotelephony', 'opi'],
    ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'],
    ['radiotelephony', 'opi', 'storytelling'],
  ]);
});
