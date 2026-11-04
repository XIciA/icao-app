import { fireEvent, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { annotationHighlightBackgrounds } from '../annotations/colors';
import { DEFAULT_ANNOTATION_HIGHLIGHTS } from '../annotations/types';
import { ChoiceList } from '../components/ChoiceList';
import { InteractiveStudyText } from '../components/InteractiveStudyText';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  return { Check: View, X: View };
});

const originalPlatform = Platform.OS;
beforeEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }); });
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

function studyProps() {
  return {
    activeHighlightId: 'green', blockId: 'question' as const, definitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
    dictionaryMode: false, highlightMode: false, highlights: [], lookupEnabled: true,
    onHighlight: jest.fn(), onHighlightRange: jest.fn(), onLookup: jest.fn(), text: 'Alpha bravo.',
  };
}

it.each(['question', 'reference', 'choice-0'] as const)('shows only transient Android feedback in %s', async (blockId) => {
  const props = { ...studyProps(), blockId };
  const screen = await render(<InteractiveStudyText {...props} />);
  const word = () => screen.getByLabelText('长按查词：Alpha');
  const background = () => StyleSheet.flatten(word().props.style).backgroundColor;
  expect(background()).toBeUndefined();
  await fireEvent(word(), 'pressIn');
  expect(background()).toBe(colors.border);
  expect(props.onLookup).not.toHaveBeenCalled();
  await fireEvent(word(), 'longPress');
  expect(props.onLookup).toHaveBeenCalledTimes(1);
  expect(props.onLookup).toHaveBeenCalledWith('alpha');
  await fireEvent(word(), 'pressOut');
  expect(background()).toBeUndefined();
  // A cancelled press ends with pressOut, without a press/longPress action.
  await fireEvent(word(), 'pressIn');
  await fireEvent(word(), 'pressOut');
  expect(background()).toBeUndefined();
  expect(props.onLookup).toHaveBeenCalledTimes(1);
  expect(props.onHighlight).not.toHaveBeenCalled();
  expect(props.onHighlightRange).not.toHaveBeenCalled();
});

it('preserves saved highlight colors while lookup remains available', async () => {
  const props = studyProps();
  const highlights = [{ blockId: 'question' as const, wordIndex: 0, colorId: 'green', quote: 'Alpha', sentence: 'Alpha bravo.', contentFingerprint: 'test' }];
  const screen = await render(<InteractiveStudyText {...props} highlights={highlights} />);
  const word = () => screen.getByLabelText('长按查词：Alpha');
  await fireEvent(word(), 'pressIn');
  expect(StyleSheet.flatten(word().props.style).backgroundColor).toBe(annotationHighlightBackgrounds.green);
  await fireEvent(word(), 'longPress');
  await fireEvent(word(), 'pressOut');
  expect(StyleSheet.flatten(word().props.style).backgroundColor).toBe(annotationHighlightBackgrounds.green);
  expect(props.onLookup).toHaveBeenCalledWith('alpha');
  expect(props.onHighlight).not.toHaveBeenCalled();
});

it('does not add grey feedback in highlight mode or retain a press across a mode change', async () => {
  const props = studyProps();
  const screen = await render(<InteractiveStudyText {...props} />);
  await fireEvent(screen.getByLabelText('长按查词：Alpha'), 'pressIn');
  await screen.rerender(<InteractiveStudyText {...props} highlightMode />);
  const word = screen.getByLabelText('添加高亮：Alpha');
  await fireEvent(word, 'pressIn');
  expect(StyleSheet.flatten(word.props.style).backgroundColor).toBeUndefined();
  await fireEvent.press(word);
  expect(props.onHighlight).toHaveBeenCalledTimes(1);
  expect(props.onLookup).not.toHaveBeenCalled();
  await screen.rerender(<InteractiveStudyText {...props} />);
  expect(StyleSheet.flatten(screen.getByLabelText('长按查词：Alpha').props.style).backgroundColor).toBeUndefined();
});

it('keeps choice short taps and long-press lookup separate while resetting the grey background', async () => {
  const onSelect = jest.fn(); const onLookupWord = jest.fn();
  const screen = await render(<ChoiceList choices={['Alpha bravo.']} onSelect={onSelect} onLookupWord={onLookupWord} />);
  const word = () => screen.getByLabelText('长按查词：alpha');
  await fireEvent(word(), 'pressIn');
  expect(StyleSheet.flatten(word().props.style).backgroundColor).toBe(colors.border);
  await fireEvent(word(), 'longPress');
  await fireEvent(word(), 'pressOut');
  await fireEvent.press(word(), { stopPropagation: jest.fn() });
  expect(onLookupWord).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(word().props.style).backgroundColor).toBeUndefined();
  await fireEvent(word(), 'pressIn');
  await fireEvent(word(), 'pressOut');
  await fireEvent.press(word(), { stopPropagation: jest.fn() });
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it.each(['ios', 'web'])('does not add Android grey styling on %s', async (platform) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const props = studyProps();
  const screen = await render(<InteractiveStudyText {...props} />);
  await fireEvent(screen.getByLabelText('长按查词：Alpha'), 'pressIn');
  expect(StyleSheet.flatten(screen.getByLabelText('长按查词：Alpha').props.style).backgroundColor).toBeUndefined();
  await fireEvent(screen.getByLabelText('长按查词：Alpha'), 'longPress');
  expect(props.onLookup).toHaveBeenCalledWith('alpha');
});
