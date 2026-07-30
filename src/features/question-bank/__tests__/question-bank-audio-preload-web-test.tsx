import { act, render } from '@testing-library/react-native';

import type { QuestionBankCard } from '../types';
import {
  ensureQuestionBankAudioConnectionHint,
  useQuestionBankAudioPreload,
} from '../hooks/useQuestionBankAudioPreload.web';

class MockPreloadAudio {
  static instances: MockPreloadAudio[] = [];

  crossOrigin: string | null = null;
  preload = '';
  src = '';
  load = jest.fn();
  pause = jest.fn();
  removeAttribute = jest.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor() {
    MockPreloadAudio.instances.push(this);
  }
}

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
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');

  beforeAll(() => {
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: MockPreloadAudio,
    });
  });

  afterAll(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    MockPreloadAudio.instances = [];
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
    expect(MockPreloadAudio.instances).toHaveLength(0);

    await screen.rerender(<Harness currentAudioReady />);
    await act(async () => {
      jest.advanceTimersByTime(749);
    });
    expect(MockPreloadAudio.instances).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(MockPreloadAudio.instances).toHaveLength(1);
    expect(MockPreloadAudio.instances[0]).toMatchObject({
      crossOrigin: 'anonymous',
      preload: 'auto',
      src: 'https://audio-07.example.test/002.mp3',
    });
    expect(MockPreloadAudio.instances[0].load).toHaveBeenCalledTimes(1);

    await screen.rerender(<Harness currentAudioReady currentIndex={1} />);
    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(MockPreloadAudio.instances).toHaveLength(2);
    expect(MockPreloadAudio.instances[0].pause).toHaveBeenCalled();
    expect(MockPreloadAudio.instances[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(MockPreloadAudio.instances[1].src).toBe('https://audio-06.example.test/003.mp3');
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
