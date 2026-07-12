import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS } from '../annotations/types';
import { AnnotationToolbar } from '../components/AnnotationToolbar';
import { InteractiveStudyText } from '../components/InteractiveStudyText';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, Highlighter: Icon, Plus: Icon, Search: Icon, Tags: Icon, X: Icon };
});

describe('annotation study controls', () => {
  function StatefulToolbar() {
    const [mode, setMode] = useState<'dictionary' | 'highlight'>();
    return (
      <AnnotationToolbar
        activeHighlightId="green"
        dictionaryMode={mode === 'dictionary'}
        highlightDefinitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        highlightMode={mode === 'highlight'}
        onCreateHighlight={jest.fn()}
        onCreateTag={jest.fn()}
        onDictionaryModeChange={(value) => setMode(value ? 'dictionary' : undefined)}
        onHighlightChange={jest.fn()}
        onHighlightModeChange={(value) => setMode(value ? 'highlight' : undefined)}
        onTagToggle={jest.fn()}
        resetToken="card-stateful"
        selectedTags={[]}
        showDictionary
        showHighlights
        showTags={false}
        tagDefinitions={DEFAULT_ANNOTATION_TAGS}
      />
    );
  }

  it('returns word and sentence context for a highlight action', async () => {
    const onHighlight = jest.fn();
    const screen = await render(
      <InteractiveStudyText
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode={false}
        highlightMode
        highlights={[]}
        onHighlight={onHighlight}
        onLookup={jest.fn()}
        text="One two. Three four?"
      />,
    );
    fireEvent.press(screen.getByLabelText('添加高亮：two.'));
    expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ wordIndex: 1, quote: 'two.', sentence: 'One two.' }));
  });

  it('closes highlight mode when the tag panel opens and exposes custom creation', async () => {
    const onDictionaryModeChange = jest.fn();
    const onHighlightModeChange = jest.fn();
    const screen = await render(
      <AnnotationToolbar
        activeHighlightId="green"
        dictionaryMode={false}
        highlightDefinitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        highlightMode
        onCreateHighlight={jest.fn()}
        onCreateTag={jest.fn()}
        onDictionaryModeChange={onDictionaryModeChange}
        onHighlightChange={jest.fn()}
        onHighlightModeChange={onHighlightModeChange}
        onTagToggle={jest.fn()}
        resetToken="card-1"
        selectedTags={[]}
        showDictionary
        showHighlights
        showTags
        tagDefinitions={DEFAULT_ANNOTATION_TAGS}
      />,
    );
    fireEvent.press(screen.getByLabelText('打开标签面板'));
    expect(onHighlightModeChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('新建标注定义')).toBeTruthy();
  });

  it('keeps the newly selected dictionary or highlight mode active', async () => {
    const screen = await render(<StatefulToolbar />);

    fireEvent.press(screen.getByLabelText('开启查词模式'));
    await waitFor(() => expect(screen.getByLabelText('关闭查词模式')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await waitFor(() => expect(screen.getByLabelText('关闭高亮模式')).toBeTruthy());
  });
});
