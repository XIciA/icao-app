import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { AppContentFrame } from '../AppContentFrame.web';

jest.mock('../web-layout', () => ({
  useWebLayout: () => ({ contentWidth: 1280 }),
}));

describe('<AppContentFrame /> on web', () => {
  it('centers and limits page content without owning the page background', async () => {
    const screen = await render(
      <AppContentFrame style={{ flex: 1 }}>
        <Text>页面内容</Text>
      </AppContentFrame>,
    );

    const frame = screen.getByTestId('app-content-frame');
    expect(StyleSheet.flatten(frame?.props.style)).toMatchObject({
      alignSelf: 'center',
      flex: 1,
      width: 1280,
    });
  });
});
