import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenSafeArea } from './ScreenSafeArea.native';

let mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));

beforeEach(() => { mockInsets = { top: 59, bottom: 34, left: 0, right: 0 }; });

it('reserves the top inset in the first render and after changing page content', async () => {
  const screen = await render(<ScreenSafeArea testID="frame" edges={['top']}><Text>Loading</Text></ScreenSafeArea>);
  expect(screen.getByTestId('frame')).toHaveStyle({ paddingTop: 59 });
  await screen.rerender(<ScreenSafeArea testID="frame" edges={['top']}><Text>Ready</Text></ScreenSafeArea>);
  expect(screen.getByTestId('frame')).toHaveStyle({ paddingTop: 59 });
});

it('preserves content spacing and only adds requested edges', async () => {
  const screen = await render(<ScreenSafeArea testID="frame" edges={['top']} style={{ padding: 24, paddingTop: 8 }} />);
  expect(screen.getByTestId('frame')).toHaveStyle({ padding: 24, paddingTop: 67 });
});

it('responds to rotation and to the nearest modal provider instead of caching a window inset', async () => {
  const screen = await render(<ScreenSafeArea testID="frame" />);
  mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
  await screen.rerender(<ScreenSafeArea testID="frame" />);
  expect(screen.getByTestId('frame')).toHaveStyle({ paddingTop: 0, paddingBottom: 21, paddingLeft: 59, paddingRight: 59 });
});
