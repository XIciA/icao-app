import { StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { fireEvent, render } from '@testing-library/react-native';
import { AnswerCardSheet } from '../components/AnswerCardSheet.native';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

it('counts learned questions independently of answers and opens the selected question directly', async () => {
  const select = jest.fn();
  const screen = await render(<AnswerCardSheet visible total={7} current={2} marked={new Set([0, 2, 99])} tagColors={[[], [], ['red', 'blue']]} highlightColors={[[], [], ['yellow']]} onSelect={select} onClose={jest.fn()} />);
  expect(screen.getByText('共 7 题')).toBeTruthy();
  expect(screen.getByText('已学习 2')).toBeTruthy();
  expect(screen.getByText('未学习 5')).toBeTruthy();
  const current = screen.getByLabelText('第 3 题');
  expect(current.props.accessibilityState.selected).toBe(true);
  expect(current.props.accessibilityHint).toBe('已学习，2 种标签，1 种高亮');
  expect(screen.queryByText('已作答')).toBeNull();
  expect(screen.queryByText('标签')).toBeNull();
  await fireEvent.press(current);
  expect(select).toHaveBeenCalledWith(2);
});

it('prioritizes listening results while retaining current, learned, unlearned and annotation states',async()=>{
 const tree=(results:('correct'|'incorrect'|undefined)[])=><AnswerCardSheet visible total={4} current={0} marked={new Set([0,1,2])} results={results} tagColors={[[colors.accent]]} onSelect={jest.fn()} onClose={jest.fn()}/>;
 const screen=await render(tree(['correct','incorrect',undefined,undefined]));
 expect(screen.getByLabelText('第 1 题').props.accessibilityHint).toBe('答对，1 种标签');
 expect(StyleSheet.flatten(screen.getByLabelText('第 1 题').props.style)).toMatchObject({backgroundColor:colors.answerCorrectBackground,borderColor:colors.primary});
 expect(StyleSheet.flatten(screen.getByText('1').props.style).color).toBe(colors.answerCorrect);
 expect(screen.getByLabelText('第 2 题').props.accessibilityHint).toBe('答错');
 expect(StyleSheet.flatten(screen.getByText('2').props.style).color).toBe(colors.destructive);
 expect(screen.getByLabelText('第 3 题').props.accessibilityHint).toBe('已学习');
 expect(screen.getByLabelText('第 4 题').props.accessibilityHint).toBe('未学习');
 await screen.rerender(tree(['incorrect','correct',undefined,undefined]));
 expect(screen.getByLabelText('第 1 题').props.accessibilityHint).toBe('答错，1 种标签');
 expect(screen.getByText('已学习 3')).toBeTruthy();
});
