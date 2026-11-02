import { offlineClockIsValid, acceptOnlineCredentialClock } from '../offline-clock.native';
const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockSecure.set(key, value); },
}));
const now = Date.UTC(2026, 10, 2);
test('allows ordinary long offline use, persists advancing time and rejects rollback', async () => {
  expect(await offlineClockIsValid('clock-one', 'production', now)).toBe(true);
  expect(await offlineClockIsValid('clock-one', 'production', now + 30 * 86400000)).toBe(true);
  expect(await offlineClockIsValid('clock-one', 'production', now + 86400000)).toBe(false);
  expect(await offlineClockIsValid('clock-one', 'sandbox', now)).toBe(true);
  expect(await offlineClockIsValid('another-account', 'production', now)).toBe(true);
});
test('checks secure storage on cold start and tolerates small clock correction', async () => {
  mockSecure.set('icao.offline-clock.v1.cold.production', String(now));
  expect(await offlineClockIsValid('cold', 'production', now - 10 * 60000)).toBe(false);
  expect(await offlineClockIsValid('cold', 'production', now - 60000)).toBe(true);
});
test('concurrent checks never lower the persisted watermark', async () => {
  const values = await Promise.all([now, now + 600000, now].map(time => offlineClockIsValid('parallel', 'production', time)));
  expect(values).toEqual([true, true, false]);
  expect(mockSecure.get('icao.offline-clock.v1.parallel.production')).toBe(String(now + 600000));
});
test('a fresh verified online credential recovers after correcting a future device clock', async () => {
  const time = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    await offlineClockIsValid('recovered', 'production', now + 86400000);
    await acceptOnlineCredentialClock('recovered', 'production', now - 86400000);
    expect(await offlineClockIsValid('recovered', 'production', now)).toBe(false);
    await acceptOnlineCredentialClock('recovered', 'production', now);
    expect(await offlineClockIsValid('recovered', 'production', now)).toBe(true);
  } finally { time.mockRestore(); }
});
