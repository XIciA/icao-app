import { newerAppUpdate, parseAppUpdates, type AppUpdate } from '../update-model';
const android: AppUpdate = { channel: 'android-apk', version: '1.2.0', build: 100, available: true, notes: '学习体验优化', publishedAt: '2026-09-23T00:00:00Z', url: 'https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/app-100.apk' };
it('isolates TestFlight, App Store and Android releases', () => {
  const beta: AppUpdate = { ...android, channel: 'ios-testflight', url: 'https://testflight.apple.com/join/ABC123' };
  expect(newerAppUpdate([beta], 'ios-app-store', '1.1.0', '90')).toBeUndefined();
  expect(newerAppUpdate([beta], 'ios-testflight', '1.1.0', '90')).toBe(beta);
  expect(newerAppUpdate([android], 'android-apk', '1.2.0', '100')).toBeUndefined();
  expect(newerAppUpdate([android], 'android-apk', '1.2.0', '99')).toBe(android);
  expect(newerAppUpdate([android], 'android-apk', null, null)).toBeUndefined();
});
it('never offers an APK whose build cannot cover the installed build', () => {
  expect(newerAppUpdate([android], 'android-apk', '1.1.0', '101')).toBeUndefined();
  expect(newerAppUpdate([{ ...android, version: '1.0.0', build: 101 }], 'android-apk', '1.1.0', '100')).toBeUndefined();
});
it('ignores unpublished or invalid entries and untrusted download URLs', () => {
  expect(parseAppUpdates({ schemaVersion: 1, releases: [android, { ...android, available: false }, { ...android, url: 'https://evil.test/app.apk' }, { ...android, build: -1 }, { ...android, publishedAt: 'unknown' }] })).toEqual([android]);
  expect(parseAppUpdates({ schemaVersion: 2, releases: [android] })).toEqual([]);
});
it('compares semantic versions numerically and picks the newest usable release', () => {
  const newer = { ...android, version: '1.10.0', build: 110 };
  expect(newerAppUpdate([newer, android], 'android-apk', '1.9.0', '105')).toBe(newer);
});
