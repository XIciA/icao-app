import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

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
    const [highlightId, setHighlightId] = useState('green');
    return (
      <AnnotationToolbar
        activeHighlightId={highlightId}
        dictionaryMode={mode === 'dictionary'}
        highlightDefinitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        highlightMode={mode === 'highlight'}
        onCreateHighlight={jest.fn()}
        onCreateTag={jest.fn()}
        onDictionaryModeChange={(value) => setMode(value ? 'dictionary' : undefined)}
        onHighlightChange={setHighlightId}
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
        activeHighlightId="green"
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode={false}
        highlightMode
        highlights={[]}
        lookupEnabled
        onHighlight={onHighlight}
        onHighlightRange={jest.fn()}
        onLookup={jest.fn()}
        text="One two. Three four?"
      />,
    );
    fireEvent.press(screen.getByLabelText('添加高亮：two.'));
    expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ wordIndex: 1, quote: 'two.', sentence: 'One two.' }));
  });

  it('looks up a word on long press without enabling dictionary mode', async () => {
    const onLookup = jest.fn();
    const screen = await render(
      <InteractiveStudyText
        activeHighlightId="green"
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode={false}
        highlightMode={false}
        highlights={[]}
        lookupEnabled
        onHighlight={jest.fn()}
        onHighlightRange={jest.fn()}
        onLookup={onLookup}
        text="Request deviation to avoid weather."
      />,
    );

    fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
    expect(onLookup).toHaveBeenCalledWith({ word: 'deviation', sentence: 'Request deviation to avoid weather.' });
  });

  it('uses a highlighter background and disables lookup while highlight mode is active', async () => {
    const onLookup = jest.fn();
    const screen = await render(
      <InteractiveStudyText
        activeHighlightId="yellow"
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode={false}
        highlightMode
        highlights={[{ blockId: 'question', wordIndex: 1, colorId: 'yellow', quote: 'two.', sentence: 'One two.', contentFingerprint: 'abc' }]}
        lookupEnabled
        onHighlight={jest.fn()}
        onHighlightRange={jest.fn()}
        onLookup={onLookup}
        text="One two. Three four?"
      />,
    );

    const highlighted = screen.getByLabelText('更新或取消高亮：two.');
    expect(StyleSheet.flatten(highlighted.props.style).backgroundColor).toBe('rgba(242, 201, 76, 0.38)');
    fireEvent(highlighted, 'longPress');
    expect(onLookup).not.toHaveBeenCalled();
  });

  it('fills the space between adjacent highlights that use the same color', async () => {
    const screen = await render(
      <InteractiveStudyText
        activeHighlightId="green"
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode={false}
        highlightMode
        highlights={[
          { blockId: 'question', wordIndex: 0, colorId: 'green', quote: 'One', sentence: 'One two.', contentFingerprint: 'abc' },
          { blockId: 'question', wordIndex: 1, colorId: 'green', quote: 'two.', sentence: 'One two.', contentFingerprint: 'abc' },
        ]}
        lookupEnabled
        onHighlight={jest.fn()}
        onHighlightRange={jest.fn()}
        onLookup={jest.fn()}
        text="One two. Three four?"
      />,
    );

    const first = StyleSheet.flatten(screen.getByLabelText('更新或取消高亮：One').props.style);
    const second = StyleSheet.flatten(screen.getByLabelText('更新或取消高亮：two.').props.style);
    expect(first.paddingRight).toBe(4);
    expect(first.marginRight).toBeUndefined();
    expect(second.marginRight).toBe(4);
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
    await waitFor(() => expect(screen.getByLabelText('新建标注定义')).toBeTruthy());
  });

  it('keeps the newly selected dictionary or highlight mode active', async () => {
    const screen = await render(<StatefulToolbar />);

    fireEvent.press(screen.getByLabelText('开启查词模式'));
    await waitFor(() => expect(screen.getByLabelText('关闭查词模式')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await waitFor(() => expect(screen.getByTestId('annotation-picker-panel')).toBeTruthy());
    expect(StyleSheet.flatten(screen.getByTestId('annotation-picker-panel').props.style).position).toBe('absolute');

    fireEvent.press(screen.getByLabelText('使用重点高亮'));
    await waitFor(() => expect(screen.getByTestId('highlight-mode-status')).toBeTruthy());
    expect(screen.getByLabelText('调整高亮颜色')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('结束高亮模式'));
    await waitFor(() => expect(screen.getByLabelText('开启高亮模式')).toBeTruthy());
  });
});
