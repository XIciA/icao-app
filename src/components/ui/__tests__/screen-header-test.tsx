import { render, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Screen } from '../Screen';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
it('keeps navigation outside the independently scrolling content', async () => {
  const screen=await render(<Screen scroll header={<Text>固定导航</Text>} scrollProps={{testID:'page-scroll'}}><Text>滚动列表</Text></Screen>);
  expect(screen.getByText('固定导航')).toBeTruthy();
  const content=within(screen.getByTestId('page-scroll'));
  expect(content.getByText('滚动列表')).toBeTruthy();expect(content.queryByText('固定导航')).toBeNull();
});
