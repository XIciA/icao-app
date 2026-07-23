import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnswerCardSheet, answerCardWebGridStyle, answerCardWebNumberStyle } from '../components/AnswerCardSheet';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<AnswerCardSheet />', () => {
  it('uses a five-column capped grid with vertically centered question labels', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <AnswerCardSheet current={0} onClose={jest.fn()} onSelect={jest.fn()} total={12} visible visited={new Set([0])} />
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
