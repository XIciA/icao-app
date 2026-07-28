import { act, render } from '@testing-library/react-native';

import type { QuestionBankCard } from '../types';
import {
  ensureQuestionBankAudioConnectionHint,
  useQuestionBankAudioPreload,
} from '../hooks/useQuestionBankAudioPreload.web';

const mockClearPreloadedSource = jest.fn();
const mockPreload = jest.fn();

jest.mock('expo-audio', () => ({
  clearPreloadedSource: (source: string) => mockClearPreloadedSource(source),
  preload: (source: string) => mockPreload(source),
}));

const cards = [
  { audio: 'https://audio-08.example.test/001.mp3', id: 'card-1', kind: 'speaking' },
  { audio: 'https://audio-07.example.test/002.mp3', id: 'card-2', kind: 'speaking' },
  { audio: 'https://audio-06.example.test/003.mp3', id: 'card-3', kind: 'speaking' },
] as unknown as QuestionBankCard[];

function Harness({ currentAudioReady, currentIndex = 0 }: {
  currentAudioReady: boolean;
  currentIndex?: number;
}) {
  useQuestionBankAudioPreload(cards, currentIndex, currentAudioReady);
  return null;
}

describe('useQuestionBankAudioPreload.web', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('waits for the current audio and then preloads only the next card', async () => {
    const screen = await render(<Harness currentAudioReady={false} />);

    await act(async () => {
      jest.runAllTimers();
    });
    expect(mockPreload).not.toHaveBeenCalled();

    await screen.rerender(<Harness currentAudioReady />);
    await act(async () => {
      jest.advanceTimersByTime(749);
    });
    expect(mockPreload).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockPreload).toHaveBeenCalledTimes(1);
    expect(mockPreload).toHaveBeenCalledWith('https://audio-07.example.test/002.mp3');
  });

  it('adds reusable connection hints without duplicating an origin', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const links: { crossOrigin?: string; href?: string; rel?: string }[] = [];
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => ({}),
        head: {
          appendChild: (link: { crossOrigin?: string; href?: string; rel?: string }) => {
            links.push(link);
          },
          querySelectorAll: () => links,
        },
      },
    });

    ensureQuestionBankAudioConnectionHint('https://audio-08.example.test/001.mp3');
    ensureQuestionBankAudioConnectionHint('https://audio-07.example.test/002.mp3');
    ensureQuestionBankAudioConnectionHint('https://audio-08.example.test/003.mp3');
    expect(links.map((link) => link.href)).toEqual([
      'https://audio-08.example.test',
      'https://audio-07.example.test',
    ]);

    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
});
