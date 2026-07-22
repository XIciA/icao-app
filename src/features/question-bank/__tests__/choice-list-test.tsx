import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { ChoiceList } from '../components/ChoiceList';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return { Check: Icon, X: Icon };
});

describe('<ChoiceList />', () => {
  it('reveals the correct answer even before the learner selects an option', async () => {
    const screen = await render(
      <ChoiceList choices={['A', 'B', 'C']} correctChoiceIndex={1} onSelect={jest.fn()} showResult />,
    );

    expect(screen.getByLabelText('正确答案')).toBeTruthy();
  });

  it('uses green for the correct answer and red for the selected wrong answer', async () => {
    const screen = await render(
      <ChoiceList choices={['Alpha', 'Bravo']} correctChoiceIndex={1} onSelect={jest.fn()} selectedChoiceIndex={0} showResult />,
    );

    expect(StyleSheet.flatten(screen.getByLabelText('选项 B：Bravo').props.style)).toMatchObject({
      backgroundColor: colors.answerCorrectBackground,
      borderColor: colors.answerCorrectBorder,
    });
    expect(StyleSheet.flatten(screen.getByTestId('choice-letter-1').props.style)).toMatchObject({
      backgroundColor: colors.answerCorrect,
    });
    expect(screen.getByLabelText('正确答案').props.color).toBe(colors.answerCorrect);

    expect(StyleSheet.flatten(screen.getByLabelText('选项 A：Alpha').props.style)).toMatchObject({
      backgroundColor: 'rgba(219,43,51,0.06)',
      borderColor: 'rgba(219,43,51,0.45)',
    });
    expect(StyleSheet.flatten(screen.getByTestId('choice-letter-0').props.style)).toMatchObject({
      backgroundColor: colors.destructive,
    });
    expect(screen.getByLabelText('错误答案').props.color).toBe(colors.destructive);
  });

  it('keeps the unanswered selected state blue before revealing the result', async () => {
    const screen = await render(
      <ChoiceList choices={['Alpha', 'Bravo']} correctChoiceIndex={1} onSelect={jest.fn()} selectedChoiceIndex={0} />,
    );

    expect(StyleSheet.flatten(screen.getByLabelText('选项 A：Alpha').props.style)).toMatchObject({ borderColor: colors.primary });
    expect(StyleSheet.flatten(screen.getByTestId('choice-letter-0').props.style)).toMatchObject({ backgroundColor: colors.primary });
    expect(screen.queryByLabelText('正确答案')).toBeNull();
    expect(screen.queryByLabelText('错误答案')).toBeNull();
  });

});
