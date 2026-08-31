import { act, render } from '@testing-library/react-native';
import { AppState, View } from 'react-native';

import { AppRuntime } from '../AppRuntime';

const mockCleanupRecordings = jest.fn();
const mockPurgeDiagnostics = jest.fn(async () => undefined);
const mockCommerceRuntimeProvider = jest.fn();

jest.mock('@/features/question-bank/recording/recording-repository', () => ({
  recordingRepository: { cleanupExpired: () => mockCleanupRecordings() },
}));

jest.mock('@/features/radio-player/RadioMiniPlayer', () => ({ RadioMiniPlayer: () => null }));
jest.mock('@/features/radio-player/RadioPlayerProvider', () => ({
  RadioPlayerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({
  CommerceRuntimeProvider: ({ children }: { children: React.ReactNode }) => {
    mockCommerceRuntimeProvider();
    return children;
  },
}));
jest.mock('@/platform/diagnostics/safe-diagnostic-store', () => ({
  purgeExpiredSafeDiagnostics: () => mockPurgeDiagnostics(),
}));

describe('AppRuntime diagnostic retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('purges at startup, on foreground resume, and periodically while mounted', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove };
    });

    const screen = await render(<AppRuntime><View testID="content" /></AppRuntime>);

    await act(async () => { await Promise.resolve(); });
    expect(mockCommerceRuntimeProvider).toHaveBeenCalledTimes(1);
    expect(mockPurgeDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockCleanupRecordings).toHaveBeenCalledTimes(1);

    await act(async () => { appStateListener?.('background'); await Promise.resolve(); });
    expect(mockPurgeDiagnostics).toHaveBeenCalledTimes(1);
    await act(async () => { appStateListener?.('active'); await Promise.resolve(); });
    expect(mockPurgeDiagnostics).toHaveBeenCalledTimes(2);

    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1_000); });
    expect(mockPurgeDiagnostics).toHaveBeenCalledTimes(3);

    await screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
