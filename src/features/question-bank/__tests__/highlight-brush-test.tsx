import { act, fireEvent, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { InteractiveStudyText } from '../components/InteractiveStudyText';
import { DEFAULT_ANNOTATION_HIGHLIGHTS } from '../annotations/types';

async function fixture() {
  const onHighlightRange = jest.fn(), onHighlight = jest.fn(), onLookup = jest.fn();
  const props = { activeHighlightId: 'green', blockId: 'question' as const, definitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
    dictionaryMode: false, highlightMode: true, lookupEnabled: true, onHighlightRange, onHighlight, onLookup,
    text: 'One two three four.', highlights: [{ blockId: 'question' as const, wordIndex: 0, colorId: 'green', quote: 'One', sentence: 'One two three four.', contentFingerprint: 'abc' }] };
  const screen = await render(<InteractiveStudyText {...props} />);
  const labels = ['更新或取消高亮：One', '添加高亮：two', '添加高亮：three', '添加高亮：four.'];
  for (const [index, label] of labels.entries()) {
    await fireEvent(screen.getByLabelText(label), 'layout', { nativeEvent: { layout: { x: (index % 2) * 50, y: Math.floor(index / 2) * 25, width: 45, height: 25 } } });
  }
  return { screen, props, onHighlightRange, onHighlight, onLookup };
}
it('paints from an already highlighted word across lines and suppresses the trailing tap', async () => {
  const { screen, onHighlightRange, onHighlight, onLookup } = await fixture();
  await act(() => fireGestureHandler(getByGestureTestId('highlight-brush'), [
    { state: State.BEGAN, x: 10, y: 10, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, x: 20, y: 10, translationX: 10, translationY: 0 },
    { state: State.ACTIVE, x: 60, y: 35, translationX: 50, translationY: 25 },
    { state: State.END, x: 60, y: 35, translationX: 50, translationY: 25 },
  ]));
  expect(onHighlightRange).toHaveBeenCalledTimes(1);
  expect(onHighlightRange).toHaveBeenCalledWith(expect.objectContaining({ action: 'apply', startWordIndex: 0, endWordIndex: 3 }));
  await fireEvent.press(screen.getByLabelText('添加高亮：four.'));
  expect(onHighlight).not.toHaveBeenCalled();
  expect(onLookup).not.toHaveBeenCalled();
});
it('supports reverse strokes and does not persist a cancelled stroke', async () => {
  const { onHighlightRange } = await fixture();
  await act(() => fireGestureHandler(getByGestureTestId('highlight-brush'), [
    { state: State.BEGAN, x: 60, y: 35, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, x: 55, y: 35, translationX: -5, translationY: 0 },
    { state: State.ACTIVE, x: 10, y: 10, translationX: -50, translationY: -25 },
    { state: State.END, x: 10, y: 10, translationX: -50, translationY: -25 },
  ]));
  expect(onHighlightRange).toHaveBeenCalledWith(expect.objectContaining({ action: 'apply', startWordIndex: 3, endWordIndex: 0 }));
  onHighlightRange.mockClear();
  await act(() => fireGestureHandler(getByGestureTestId('highlight-brush'), [
    { state: State.BEGAN, x: 10, y: 10 },
    { state: State.ACTIVE, x: 20, y: 10, translationX: 10, translationY: 0 },
    { state: State.CANCELLED, x: 60, y: 10 },
  ]));
  expect(onHighlightRange).not.toHaveBeenCalled();
});
it('retains single-word toggles and disables both lookup and system text highlighting', async () => {
  const { screen, onHighlight, onLookup } = await fixture();
  const word = screen.getByLabelText('更新或取消高亮：One');
  expect(word.props.suppressHighlighting).toBe(true);
  expect(word.props.selectable).toBe(false);
  await fireEvent(word, 'longPress');
  expect(onHighlight).not.toHaveBeenCalled();
  expect(onLookup).not.toHaveBeenCalled();
  await fireEvent.press(word);
  expect(onHighlight).toHaveBeenCalledWith(expect.objectContaining({ wordIndex: 0 }));
});
