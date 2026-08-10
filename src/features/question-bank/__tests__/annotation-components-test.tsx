import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS } from '../annotations/types';
import { AnnotationFloatingPanel, AnnotationToolbar } from '../components/AnnotationToolbar';
import { InteractiveStudyText } from '../components/InteractiveStudyText';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, Highlighter: Icon, Plus: Icon, Search: Icon, Tags: Icon, X: Icon };
});

describe('annotation study controls', () => {
  function StatefulToolbar({ initialMode, initialTags = [] }: { initialMode?: 'dictionary' | 'highlight' | 'tags'; initialTags?: string[] }) {
    const [mode, setMode] = useState<'dictionary' | 'highlight' | 'tags' | undefined>(initialMode);
    const [highlightId, setHighlightId] = useState('green');
    const [selectedTags, setSelectedTags] = useState(initialTags);
    const toggleTag = (id: string) => setSelectedTags((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    return (
      <View>
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
          onTagModeChange={(value) => setMode(value ? 'tags' : undefined)}
          onTagToggle={toggleTag}
          resetToken="card-stateful"
          selectedTags={selectedTags}
          showDictionary
          showHighlights
          showTags
          tagDefinitions={DEFAULT_ANNOTATION_TAGS}
          tagMode={mode === 'tags'}
        />
        <Pressable accessibilityLabel="正文操作" onPress={jest.fn()} />
        <AnnotationFloatingPanel
          activeHighlightId={highlightId}
          highlightDefinitions={DEFAULT_ANNOTATION_HIGHLIGHTS}
          left={20}
          mode={mode === 'highlight' || mode === 'tags' ? mode : undefined}
          onCreateHighlight={jest.fn()}
          onCreateTag={jest.fn()}
          onHighlightChange={setHighlightId}
          onTagToggle={toggleTag}
          resetToken="card-stateful"
          selectedTags={selectedTags}
          tagDefinitions={DEFAULT_ANNOTATION_TAGS}
          top={70}
          width={350}
        />
      </View>
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

  it('keeps native highlight and tags in strict, directly switchable tool states', async () => {
    const screen = await render(<StatefulToolbar initialTags={['good']} />);

    expect(screen.queryByTestId('highlight-color-panel')).toBeNull();
    expect(screen.getByLabelText('开启标签模式').props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByLabelText('开启查词模式'));
    await waitFor(() => expect(screen.getByLabelText('关闭查词模式')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await waitFor(() => expect(screen.getByTestId('highlight-color-panel')).toBeTruthy());
    expect(screen.getByLabelText('开启查词模式')).toBeTruthy();
    expect(screen.queryByTestId('annotation-picker-panel')).toBeNull();
    expect(screen.getByText('高亮')).toBeTruthy();
    expect(within(screen.getByTestId('annotation-toolbar')).queryByTestId('highlight-color-panel')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('annotation-floating-layer').props.style)).toMatchObject({ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 });
    expect(screen.getByTestId('annotation-floating-layer').props.pointerEvents).toBe('box-none');

    await fireEvent.press(screen.getByLabelText('使用记忆高亮'));
    await waitFor(() => expect(screen.getByTestId('highlight-color-panel')).toBeTruthy());
    expect(screen.queryByTestId('highlight-mode-status')).toBeNull();
    expect(screen.getByLabelText('关闭高亮模式')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('正文操作'));
    expect(screen.getByTestId('highlight-color-panel')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('开启标签模式'));
    await waitFor(() => expect(screen.getByTestId('annotation-picker-panel')).toBeTruthy());
    expect(screen.queryByTestId('highlight-color-panel')).toBeNull();
    expect(screen.getByLabelText('关闭标签模式').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(screen.getByLabelText('关闭标签模式'));
    await waitFor(() => expect(screen.queryByTestId('annotation-picker-panel')).toBeNull());
    expect(screen.getByLabelText('开启标签模式').props.accessibilityState.selected).toBe(false);

    await fireEvent.press(screen.getByLabelText('开启标签模式'));
    await waitFor(() => expect(screen.getByLabelText('取消选择好题')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('新建标注定义'));
    expect(screen.getByLabelText('新标签名称')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('新标签名称'), '复习');
    await fireEvent.press(screen.getByLabelText('取消新建'));
    expect(screen.getByTestId('annotation-picker-panel')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('取消选择好题'));
    expect(screen.getByTestId('annotation-picker-panel')).toBeTruthy();
    expect(screen.getByLabelText('关闭标签模式')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('开启高亮模式'));
    await waitFor(() => expect(screen.getByTestId('highlight-color-panel')).toBeTruthy());
    expect(screen.queryByTestId('annotation-picker-panel')).toBeNull();
    await fireEvent.press(screen.getByLabelText('关闭高亮模式'));
    await waitFor(() => expect(screen.getByLabelText('开启高亮模式')).toBeTruthy());
    expect(screen.queryByTestId('highlight-color-panel')).toBeNull();
  });
});
