import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { OfflineManifest } from '@icao/contracts';
import { DownloadManagementScreen } from '../DownloadManagementScreen.native';
const mockState: Record<string, unknown> = {};
const mockManifest = jest.fn(); const mockStart = jest.fn(); const mockDelete = jest.fn();
const mockListeners = new Set<() => void>();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => ({ target: 'icao4_initial', studyScope: 'selected' }) }));
jest.mock('@/platform/audio/audio-session-orchestrator', () => ({ audioSessionOrchestrator: { getActiveOwner: () => undefined } }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ isConnected: true, type: 'WIFI' }), NetworkStateType: { CELLULAR: 'CELLULAR' } }));
jest.mock('@/components/navigation/TopBar', () => ({ TopBar: ({ title, right }: any) => { const { Text, View } = jest.requireActual('react-native'); return <View><Text>{title}</Text>{right}</View>; } }));
jest.mock('@/components/ui', () => {
  const { Text, View, Pressable } = jest.requireActual('react-native');
  return { AppText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>, Screen: ({ header, children }: any) => <View>{header}{children}</View>, Button: ({ children, onPress, disabled }: any) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}><Text>{children}</Text></Pressable> };
});
jest.mock('../download-manager.native', () => ({
  downloadSnapshot: () => mockState, subscribeDownloads: (fn: () => void) => { mockListeners.add(fn); return () => mockListeners.delete(fn); },
  prepareDownloads: async () => undefined, checkDownloadUpdates: async () => '已是最新',
  loadDownloadManifest: (...args: unknown[]) => mockManifest(...args), startDownload: (...args: unknown[]) => mockStart(...args),
  deleteDownload: (...args: unknown[]) => mockDelete(...args), cancelDownload: jest.fn(),
  packageIncludes: (item: any, scope: string) => item?.saved?.scope === scope,
  remainingDownloadBytes: async () => 1000000,
}));
const manifest = (bankId: string, scope: string) => ({ bankId, scope, version: 1, checksum: 'a'.repeat(64), fingerprint: 'one', sizeBytes: scope === 'all' ? 2000000 : 1000000, resources: [], topics: [] }) as OfflineManifest;
beforeEach(() => { for (const key of Object.keys(mockState)) delete mockState[key]; mockManifest.mockReset().mockImplementation(async (bank, scope) => manifest(bank, scope)); mockStart.mockReset().mockResolvedValue(undefined); mockDelete.mockReset().mockResolvedValue(undefined); });
test('always shows all banks and consistent size before downloading; range changes do not download', async () => {
  await render(<DownloadManagementScreen />);
  for (const name of ['听力', '900 句', '陆空通话', 'OPI', '故事复诵']) expect(screen.getByText(name)).toBeTruthy();
  await waitFor(() => expect(screen.getByText('约 1.0 MB')).toBeTruthy());
  expect(screen.getByText('下载大小').props.variant).toBe('micro');
  expect(screen.getByText('约 1.0 MB').props.variant).toBe('micro');
  await fireEvent.press(screen.getByText('最全题库'));
  await waitFor(() => expect(screen.getByText('约 2.0 MB')).toBeTruthy());
  expect(mockStart).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('900 句'));
  await waitFor(() => expect(screen.getByText('四级')).toBeTruthy());
  expect(screen.getByText('五级')).toBeTruthy();
});
test('download uses a button and completed content keeps size without a success popup', async () => {
  await render(<DownloadManagementScreen />);
  await waitFor(() => expect(screen.getByText('下载')).toBeTruthy());
  await fireEvent.press(screen.getByText('下载'));
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ scope: 'selected' })));
});
test('downloaded and progress data use the same small text; deletion needs one confirmation', async () => {
  mockState.listening = { saved: manifest('listening', 'selected'), target: manifest('listening', 'all'), phase: 'paused', completed: 6, total: 10 };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<DownloadManagementScreen />);
  await waitFor(() => expect(screen.getByText('60%')).toBeTruthy());
  expect(screen.getByText('下载进度').props.variant).toBe(screen.getByText('60%').props.variant);
  await fireEvent.press(screen.getByText('删除下载'));
  expect(alert).toHaveBeenCalledTimes(1); expect(mockDelete).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map(button => button.text)).toEqual(['取消', '删除']);
  await act(async () => { buttons[1].onPress?.(); });
  expect(mockDelete).toHaveBeenCalledWith('listening'); alert.mockRestore();
});
