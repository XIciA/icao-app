import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

import { AppViewport } from '../AppViewport.web';

jest.mock('../web-layout', () => ({
  useWebLayout: () => ({ mode: 'desktop' }),
}));

describe('<AppViewport /> on web', () => {
  it('keeps the shared app and its page backgrounds full width', async () => {
    const screen = await render(
      <AppViewport>
        <Text>共享页面</Text>
      </AppViewport>,
    );

    const viewport = screen.getByTestId('app-viewport-desktop');
    expect(StyleSheet.flatten(viewport.props.style)).toMatchObject({
      backgroundColor: colors.background,
      flex: 1,
      overflow: 'hidden',
    });
    expect(screen.queryByTestId('app-viewport-content')).toBeNull();
    expect(screen.getByText('共享页面').parent).toBe(viewport);
  });
});
