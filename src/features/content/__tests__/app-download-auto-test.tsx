import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { AppDownloadScreen } from '../AppDownloadScreen.native';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), Link: ({ children, href }: any) => {
  const { Pressable } = jest.requireActual('react-native');
  return <Pressable accessibilityLabel={href}>{children}</Pressable>;
} }));
jest.mock('@/config/web-runtime', () => ({ isEdgeOneProductionWeb: () => true }));
jest.mock('@/components/platform/web-layout', () => ({ useWebLayout: () => ({ isMobile: true }) }));
jest.mock('@/components/brand/AppBrandLogo', () => ({ AppBrandLogo: () => null }));
jest.mock('@/components/navigation/TopBar', () => ({ TopBar: () => null }));
jest.mock('@/components/ui/icons', () => ({ BookOpen: () => null, Headphones: () => null, Sparkles: () => null }));
jest.mock('@/components/ui', () => {
  const { Text, View, Pressable } = jest.requireActual('react-native');
  return { AppText: Text, Card: View, Screen: View, Button: ({ children, onPress }: any) => <Pressable onPress={onPress}><Text>{children}</Text></Pressable> };
});
const apk = 'https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/official.apk';
const release = { channel: 'android-apk', available: true, version: '1.3.2', build: 3596177, url: apk, notes: '', publishedAt: '2026-11-13T00:00:00Z' };
const originalFetch = global.fetch;
const originalOS = Platform.OS;
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
const assign = jest.fn();
beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(window, 'location', { configurable: true, value: { search: '?android=auto', assign } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, releases: [release] }) });
});
afterAll(() => {
  global.fetch = originalFetch;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  else Reflect.deleteProperty(window, 'location');
});
it('attempts the official APK once and retains a manual link if the browser blocks it', async () => {
  assign.mockImplementation(() => { throw new Error('blocked'); });
  const view = await render(<AppDownloadScreen />);
  await waitFor(() => expect(assign).toHaveBeenCalledWith(apk));
  expect(view.getByLabelText(apk)).toBeTruthy();
  expect(view.getByText(/如未开始/)).toBeTruthy();
  await view.rerender(<AppDownloadScreen />);
  expect(assign).toHaveBeenCalledTimes(1);
});
it('does not auto-download on an ordinary visit', async () => {
  Object.defineProperty(window, 'location', { configurable: true, value: { search: '', assign } });
  const view = await render(<AppDownloadScreen />);
  await waitFor(() => expect(view.getByLabelText(apk)).toBeTruthy());
  expect(assign).not.toHaveBeenCalled();
});
it('recovers from a failed manifest fetch using the existing retry button', async () => {
  jest.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  const view = await render(<AppDownloadScreen />);
  await waitFor(() => expect(view.getByText('重新获取下载链接')).toBeTruthy());
  expect(assign).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('重新获取下载链接'));
  await waitFor(() => expect(assign).toHaveBeenCalledWith(apk));
});
it('never auto-downloads test builds or an untrusted manifest URL', async () => {
  jest.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, releases: [
    { ...release, channel: 'android-test' }, { ...release, url: 'https://example.com/untrusted.apk' },
  ] }) } as Response);
  const view = await render(<AppDownloadScreen />);
  await act(async () => {});
  expect(assign).not.toHaveBeenCalled();
  expect(view.queryByText('下载安卓 APK')).toBeNull();
});
