// Keep the frozen renderer regression suite separate from the new Native answer card.
import { render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import * as webRuntime from '@/config/web-runtime';

import { AnswerCardSheet, answerCardWebGridStyle, answerCardWebNumberStyle } from '../components/AnswerCardSheet';
jest.mock('../components/AnswerCardSheet', () => jest.requireActual('../components/AnswerCardSheet.tsx'));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('legacy <AnswerCardSheet />', () => {
  it('uses a five-column capped grid with vertically centered question labels', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <AnswerCardSheet current={0} marked={new Set([0])} onClose={jest.fn()} onSelect={jest.fn()} total={12} visible />
      </SafeAreaProvider>,
    );

    expect(StyleSheet.flatten(screen.getByLabelText('第 1 题').parent?.props.style)).toMatchObject({
      maxWidth: 368,
      width: '100%',
    });

    for (const label of ['1', '10']) {
      expect(StyleSheet.flatten(screen.getByText(label).props.style)).toMatchObject({
        height: 40,
        includeFontPadding: false,
        lineHeight: 40,
        textAlign: 'center',
        textAlignVertical: 'center',
        width: '100%',
      });
      expect(StyleSheet.flatten(screen.getByLabelText(`第 ${label} 题`).props.style)).toMatchObject({
        height: 40,
        width: '17%',
      });
    }
  });

  it('lets the Web grid span its sheet while keeping question buttons at their mobile size', () => {
    expect(answerCardWebGridStyle).toEqual({ justifyContent: 'space-between', maxWidth: '100%' });
    expect(answerCardWebNumberStyle).toEqual({ maxWidth: 62 });
  });
});


describe('Vercel answer results and tag badges', () => {
  const originalPlatform = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.restoreAllMocks();
  });

  function sheet(results: ('correct' | 'incorrect' | undefined)[] = ['correct', 'incorrect', undefined]) {
    return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <AnswerCardSheet current={0} marked={new Set([0, 1])} onClose={jest.fn()} onSelect={jest.fn()} results={results} tagColors={[[colors.answerCorrect], ['#F2C94C', '#F06570'], []]} total={3} visible />
    </SafeAreaProvider>;
  }

  it('updates the latest result, keeps current selection and exposes tag counts', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const screen = await render(sheet());
    expect(StyleSheet.flatten(screen.getByLabelText('第 1 题').props.style)).toMatchObject({ backgroundColor: colors.answerCorrectBackground, borderColor: colors.primary });
    expect(StyleSheet.flatten(screen.getByText('1').props.style).color).toBe(colors.answerCorrect);
    expect(StyleSheet.flatten(screen.getByText('2').props.style).color).toBe(colors.destructive);
    expect(screen.getByLabelText('第 1 题').props.accessibilityHint).toBe('答对，已添加1个标签');
    expect(screen.getByLabelText('第 2 题').props.accessibilityHint).toBe('答错，已添加2个标签');
    expect(StyleSheet.flatten(screen.getByLabelText('第 3 题').props.style).backgroundColor).toBe(colors.background);
    await screen.rerender(sheet(['incorrect', 'correct', undefined]));
    expect(StyleSheet.flatten(screen.getByText('1').props.style).color).toBe(colors.destructive);
    expect(StyleSheet.flatten(screen.getByText('2').props.style).color).toBe(colors.answerCorrect);
  });

  it.each(['ios', 'android', 'edgeone'])('keeps the legacy renderer answer results on %s while retaining the current marker', async (surface) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: surface === 'edgeone' ? 'web' : surface });
    if (surface === 'edgeone') jest.spyOn(webRuntime, 'isVercelLegacyWeb').mockReturnValue(false);
    const screen = await render(sheet());
    expect(StyleSheet.flatten(screen.getByLabelText('第 1 题').props.style)).toMatchObject({ backgroundColor: colors.answerCorrectBackground, borderColor: colors.primary });
    expect(StyleSheet.flatten(screen.getByText('2').props.style).color).toBe(colors.destructive);
    expect(screen.getByLabelText('第 2 题').props.accessibilityHint).toBe('答错，已添加2个标签');
    expect(screen.getByText('答对')).toBeTruthy();
    expect(screen.getByText('答错')).toBeTruthy();
  });
});
