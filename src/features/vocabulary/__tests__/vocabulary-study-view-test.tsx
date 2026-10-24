import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { stopVocabularySpeech } from '../speech';
import { VocabularyStudyView } from '../components/VocabularyStudyViews';
import type { VocabularyState, VocabularyWord } from '../types';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('../speech', () => ({
  speakVocabulary: jest.fn(async () => true),
  speakVocabularyWithFeedback: jest.fn(async () => true),
  stopVocabularySpeech: jest.fn(async () => undefined),
}));

const word: VocabularyWord = {
  id: 'preview-0001',
  bookId: 'preview',
  level: 1,
  word: 'deviation',
  meaning: 'n. 偏离',
  example: 'Report any deviation.',
  exampleTranslation: '报告任何偏离。',
  source: { name: 'test', rowIndex: 1, sourceNo: 1 },
};
const state: VocabularyState = { schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() };

function renderStudy(width: number, onExit = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <VocabularyStudyView
        index={0}
        onChoose={jest.fn()}
        onExit={onExit}
        onNext={jest.fn()}
        onToggleFavorite={jest.fn()}
        onWrong={jest.fn()}
        revealed={false}
        state={state}
        words={[word]}
      />
    </SafeAreaProvider>,
  );
}

describe('VocabularyStudyView', () => {
  it('uses a working back action without an exit confirmation', async () => {
    const onExit = jest.fn();
    const screen = await renderStudy(375, onExit);

    fireEvent.press(screen.getByLabelText('返回上一页'));

    expect(stopVocabularySpeech).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it.each([360, 375, 390, 430])('keeps the back and favorite actions at %ipx', async (width) => {
    const screen = await renderStudy(width);

    expect(screen.getByLabelText('返回上一页')).toBeTruthy();
    expect(screen.getByLabelText('收藏')).toBeTruthy();
  });
});

it('advances on manual playback start, deduplicates loading taps and ignores callbacks after leaving', async () => {
  const bindings=jest.requireActual('@/features/usage-guide/GuideBindings') as typeof import('@/features/usage-guide/GuideBindings');
  const speech=jest.requireMock('../speech') as {speakVocabularyWithFeedback:jest.Mock};
  const event=jest.fn();
  const spy=jest.spyOn(bindings,'useGuide').mockReturnValue({current:'vocab',event,availability:jest.fn(),register:jest.fn(),modal:jest.fn(),surface:()=>null,offer:jest.fn(),exit:jest.fn(),start:jest.fn(async()=>undefined),suspend:jest.fn(),pause:jest.fn(),checkpoint:jest.fn()});
  let started:(()=>void)|undefined, finish!: (value:boolean)=>void;
  speech.speakVocabularyWithFeedback.mockImplementation((_word: string,_example:unknown,onStart:()=>void)=>{started=onStart;return new Promise<boolean>(resolve=>{finish=resolve;});});
  try {
    const {act}=jest.requireActual('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const screen=await renderStudy(390);
    speech.speakVocabularyWithFeedback.mockClear();
    await fireEvent.press(screen.getByLabelText('播放deviation发音'));
    await fireEvent.press(screen.getByLabelText('播放deviation发音'));
    expect(speech.speakVocabularyWithFeedback).toHaveBeenCalledTimes(1);expect(event).not.toHaveBeenCalled();
    await act(async()=>started?.());expect(event).toHaveBeenCalledWith('vocab-speech');
    await act(async()=>finish(true));
    await fireEvent.press(screen.getByLabelText('播放deviation发音'));
    await screen.unmount();
    await act(async()=>{started?.();finish(false);});expect(event).toHaveBeenCalledTimes(1);
  } finally {spy.mockRestore();}
});
