import { claimAudioSession, registerAudioOwner, resetAudioSessionCoordinatorForTests } from '../audio-session-coordinator';

const mockSetAudioModeAsync = jest.fn(async (_mode: unknown) => undefined);

jest.mock('expo-audio', () => ({ setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode) }));

describe('audio session coordinator', () => {
  beforeEach(() => {
    mockSetAudioModeAsync.mockClear();
    resetAudioSessionCoordinatorForTests();
  });

  test('a new owner pauses the previous owner before changing profile', async () => {
    const events: string[] = [];
    registerAudioOwner('radio', () => events.push('pause-radio'));
    mockSetAudioModeAsync.mockImplementation(async () => { events.push('set-mode'); });
    await claimAudioSession('radio');
    events.length = 0;
    await claimAudioSession('study');
    expect(events).toEqual(['pause-radio', 'set-mode']);
  });

  test('radio profile explicitly enables sustained background playback', async () => {
    await claimAudioSession('radio');
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    }));
  });
});
