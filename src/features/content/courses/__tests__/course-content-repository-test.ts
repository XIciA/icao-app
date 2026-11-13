import { canonicalAppContentJson } from '@icao/contracts/app-content';
import Storage from '@/platform/storage';
import { builtinCourseRelease, readAvailableCourses, refreshCourses } from '../course-content-repository';
import { isCourseCatalog } from '../course-content-schema';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, text: string) => jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex'),
}));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('@/platform/api-client', () => ({ withApiRequestTimeout: (action: (signal: AbortSignal) => Promise<unknown>) => action(new AbortController().signal) }));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const release = () => {
  const value = JSON.parse(JSON.stringify(builtinCourseRelease));
  value.version += 1;
  value.payload.contact.wechatIds = ['new-contact'];
  value.payload.pricing.views['icao4-initial'].plans[0].unit = '元 / 16 节课 + 3 次模拟测试';
  value.checksum = jest.requireActual('node:crypto').createHash('sha256').update(canonicalAppContentJson(value.payload)).digest('hex');
  return value;
};
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  jest.mocked(Storage.getItem).mockResolvedValue(null);
  jest.mocked(Storage.setItem).mockResolvedValue(undefined);
});
afterAll(() => { global.fetch = originalFetch; });

it('loads changed contact and course hours, persists them and retains them offline', async () => {
  const next = release();
  fetchMock.mockResolvedValue({ ok: true, json: async () => next });
  expect(await refreshCourses()).toEqual(next);
  expect(Storage.setItem).toHaveBeenCalledWith('icao.course-content.v1', JSON.stringify(next));
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(next));
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(await refreshCourses()).toEqual(next);
  expect(await readAvailableCourses()).toEqual(next);
});

it('rejects incomplete or tampered payloads and keeps the last valid release', async () => {
  const cached = release();
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(cached));
  const invalid = release();
  invalid.version += 1;
  invalid.payload.contact.wechatIds = ['tampered'];
  fetchMock.mockResolvedValue({ ok: true, json: async () => invalid });
  expect(await refreshCourses()).toEqual(cached);
  expect(Storage.setItem).not.toHaveBeenCalled();
  expect(isCourseCatalog({ ...cached.payload, pricing: {} })).toBe(false);
});

it('keeps newer cached data when the server serves an older release', async () => {
  const cached = release();
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(cached));
  fetchMock.mockResolvedValue({ ok: true, json: async () => builtinCourseRelease });
  expect(await refreshCourses()).toEqual(cached);
});

it('uses bundled content on first offline entry or unreadable cache', async () => {
  jest.mocked(Storage.getItem).mockResolvedValue('invalid-json');
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(await refreshCourses()).toEqual(builtinCourseRelease);
});


it('rejects conflicting content published under an existing version', async () => {
  const next = release();
  next.version = builtinCourseRelease.version;
  fetchMock.mockResolvedValue({ ok: true, json: async () => next });
  expect(await refreshCourses()).toEqual(builtinCourseRelease);
  expect(Storage.setItem).not.toHaveBeenCalled();
});

it('shows valid remote content even if its offline cache cannot be written', async () => {
  const next = release();
  jest.mocked(Storage.setItem).mockRejectedValue(new Error('storage-full'));
  fetchMock.mockResolvedValue({ ok: true, json: async () => next });
  expect(await refreshCourses()).toEqual(next);
});
