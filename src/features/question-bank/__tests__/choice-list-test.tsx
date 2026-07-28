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

  it('keeps translations hidden until the answer card is revealed', async () => {
    const screen = await render(
      <ChoiceList choices={['Check the lighting system']} choicesZh={['检查照明系统']} onSelect={jest.fn()} />,
    );

    expect(screen.queryByText('检查照明系统')).toBeNull();
    expect(screen.getByLabelText('选项 A：Check the lighting system')).toBeTruthy();
  });

  it('shows every translation without revealing the correct answer before a selection', async () => {
    const screen = await render(
      <ChoiceList
        choices={['Check the lighting system', 'Make sure the systems are ok']}
        choicesZh={['检查照明系统', '确保各系统正常']}
        correctChoiceIndex={1}
        onSelect={jest.fn()}
        showTranslations
      />,
    );

    expect(screen.getByText('检查照明系统')).toBeTruthy();
    expect(screen.getByText('确保各系统正常')).toBeTruthy();
    expect(screen.getByLabelText('选项 A：Check the lighting system；翻译：检查照明系统')).toBeTruthy();
    expect(screen.queryByLabelText('正确答案')).toBeNull();
    expect(screen.queryByLabelText('错误答案')).toBeNull();
  });

  it('shows translations together with the existing result feedback after answering', async () => {
    const screen = await render(
      <ChoiceList
        choices={['Alpha', 'Bravo']}
        choicesZh={['阿尔法', '布拉沃']}
        correctChoiceIndex={1}
        onSelect={jest.fn()}
        selectedChoiceIndex={0}
        showResult
        showTranslations
      />,
    );

    expect(screen.getByText('阿尔法')).toBeTruthy();
    expect(screen.getByText('布拉沃')).toBeTruthy();
    expect(screen.getByLabelText('正确答案')).toBeTruthy();
    expect(screen.getByLabelText('错误答案')).toBeTruthy();
  });

  it('hides translations again while retaining the selected option when the answer is collapsed', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <ChoiceList
        choices={['Alpha', 'Bravo']}
        choicesZh={['阿尔法', '布拉沃']}
        correctChoiceIndex={1}
        onSelect={onSelect}
        selectedChoiceIndex={0}
        showResult
        showTranslations
      />,
    );

    await screen.rerender(
      <ChoiceList
        choices={['Alpha', 'Bravo']}
        choicesZh={['阿尔法', '布拉沃']}
        correctChoiceIndex={1}
        onSelect={onSelect}
        selectedChoiceIndex={0}
      />,
    );

    expect(screen.queryByText('阿尔法')).toBeNull();
    expect(StyleSheet.flatten(screen.getByLabelText('选项 A：Alpha').props.style)).toMatchObject({
      borderColor: colors.primary,
    });
    expect(screen.queryByLabelText('正确答案')).toBeNull();
    expect(screen.queryByLabelText('错误答案')).toBeNull();
  });

  it('remains compatible when an older release does not contain translations', async () => {
    const screen = await render(
      <ChoiceList choices={['Alpha']} onSelect={jest.fn()} showTranslations />,
    );

    expect(screen.getByLabelText('选项 A：Alpha')).toBeTruthy();
  });

});
