import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnswerCardSheet } from '../components/AnswerCardSheet';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<AnswerCardSheet />', () => {
  it('centers single- and double-digit question labels inside their pills', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <AnswerCardSheet current={0} onClose={jest.fn()} onSelect={jest.fn()} total={12} visible visited={new Set([0])} />
      </SafeAreaProvider>,
    );

    for (const label of ['1', '10']) {
      expect(StyleSheet.flatten(screen.getByText(label).props.style)).toMatchObject({
        includeFontPadding: false,
        textAlign: 'center',
        textAlignVertical: 'center',
        width: '100%',
      });
    }
  });
});
