import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

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

  it('looks up a normalized word on long press without enabling dictionary mode', async () => {
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
    expect(onLookup).toHaveBeenCalledWith('deviation');
  });

  it('uses a single tap only while web dictionary mode is active', async () => {
    const onLookup = jest.fn();
    const screen = await render(
      <InteractiveStudyText
        activeHighlightId="green"
        blockId="question"
        definitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
        dictionaryMode
        highlightMode={false}
        highlights={[]}
        lookupEnabled
        lookupInteraction="tap"
        onHighlight={jest.fn()}
        onHighlightRange={jest.fn()}
        onLookup={onLookup}
        text="Request deviation to avoid weather."
      />,
    );

    const lookupTarget = screen.getByLabelText('查词：deviation');
    expect(StyleSheet.flatten(screen.getByText('deviation').props.style).textDecorationLine).toBeUndefined();
    expect(StyleSheet.flatten(lookupTarget.props.style).cursor).toBe('pointer');
    expect(StyleSheet.flatten(lookupTarget.props.style).borderRadius).toBeUndefined();
    fireEvent.press(lookupTarget);
    expect(onLookup).toHaveBeenCalledWith('deviation');
    fireEvent(lookupTarget, 'longPress');
    expect(onLookup).toHaveBeenCalledTimes(1);
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

  it('uses the same web press target for highlight mode', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const onHighlight = jest.fn();
    try {
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
          text="One two."
        />,
      );

      const target = screen.getByLabelText('添加高亮：two.');
      expect(StyleSheet.flatten(target.props.style).cursor).toBe('pointer');
      fireEvent.press(target);
      expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ wordIndex: 1, quote: 'two.' }));
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
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
    await waitFor(() => expect(screen.getByTestId('annotation-picker-panel')).toBeTruthy());
    expect(screen.getAllByLabelText('新建标注定义')).not.toHaveLength(0);
  });

  it('keeps highlight in a strict off/on state with a persistent color panel', async () => {
    const screen = await render(<StatefulToolbar />);

    expect(screen.queryByTestId('highlight-color-panel')).toBeNull();
    fireEvent.press(screen.getByLabelText('开启查词模式'));
    await waitFor(() => expect(screen.getByLabelText('关闭查词模式')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await waitFor(() => expect(screen.getByTestId('highlight-color-panel')).toBeTruthy());
    expect(screen.getByLabelText('开启查词模式')).toBeTruthy();
    expect(screen.queryByTestId('annotation-picker-panel')).toBeNull();
    expect(screen.getByText('高亮')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('使用记忆高亮'));
    await waitFor(() => expect(screen.getByTestId('highlight-color-panel')).toBeTruthy());
    expect(screen.queryByTestId('highlight-mode-status')).toBeNull();
    expect(screen.getByLabelText('关闭高亮模式')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('关闭高亮模式'));
    await waitFor(() => expect(screen.getByLabelText('开启高亮模式')).toBeTruthy());
    expect(screen.queryByTestId('highlight-color-panel')).toBeNull();
  });
});
