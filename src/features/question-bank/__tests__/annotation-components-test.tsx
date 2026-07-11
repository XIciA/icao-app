import { fireEvent, render } from '@testing-library/react-native';

import { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS } from '../annotations/types';
import { AnnotationToolbar } from '../components/AnnotationToolbar';
import { InteractiveStudyText } from '../components/InteractiveStudyText';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, Highlighter: Icon, Plus: Icon, Search: Icon, Tags: Icon, X: Icon };
});

describe('annotation study controls', () => {
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
});
