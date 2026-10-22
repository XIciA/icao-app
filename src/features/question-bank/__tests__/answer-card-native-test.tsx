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
