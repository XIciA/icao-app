import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { Screen } from './Screen';

jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => <MockView {...props}>{children}</MockView> };
});

describe('<Screen />', () => {
  it('renders an optional full-screen background behind safe-area content', async () => {
    const screen = await render(
      <Screen background={<View testID="ambient-background" />} scroll>
        <Text>首页内容</Text>
      </Screen>,
    );

    expect(screen.getByTestId('ambient-background').parent?.props.pointerEvents).toBe('none');
    expect(screen.getByText('首页内容')).toBeTruthy();
  });

  it('does not add a background layer unless the caller requests one', async () => {
    const screen = await render(<Screen><Text>普通页面</Text></Screen>);

    expect(screen.queryByTestId('ambient-background')).toBeNull();
    expect(screen.getByText('普通页面')).toBeTruthy();
  });
});
