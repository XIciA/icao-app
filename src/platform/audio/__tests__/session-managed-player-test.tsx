import { renderHook } from '@testing-library/react-native';

const mockPlayer = { id: 'managed-player' };
const mockCreateAudioPlayer = jest.fn((_source?: unknown, _options?: unknown) => mockPlayer);
const mockUseAudioPlayer = jest.fn((_source?: unknown, _options?: unknown) => mockPlayer);

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
}));

// eslint-disable-next-line import/first
import {
  createSessionManagedAudioPlayer,
  useSessionManagedAudioPlayer,
} from '../session-managed-player';

describe('session-managed Expo Audio players', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forces short-lived decoder players to keep the native audio session active', () => {
    expect(createSessionManagedAudioPlayer('file:///recording.m4a', { updateInterval: 100 }))
      .toBe(mockPlayer);
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith('file:///recording.m4a', {
      keepAudioSessionActive: true,
      updateInterval: 100,
    });
  });

  it('forces mounted playback players to keep the native audio session active', async () => {
    const hook = await renderHook(() => useSessionManagedAudioPlayer(null, {
      preferredForwardBufferDuration: 10,
      updateInterval: 250,
    }));

    expect(hook.result.current).toBe(mockPlayer);
    expect(mockUseAudioPlayer).toHaveBeenCalledWith(null, {
      keepAudioSessionActive: true,
      preferredForwardBufferDuration: 10,
      updateInterval: 250,
    });
    hook.unmount();
  });
});
