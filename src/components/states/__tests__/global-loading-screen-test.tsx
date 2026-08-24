import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { GLOBAL_LOADING_ICON_SOURCE, GlobalLoadingScreen } from '../GlobalLoadingScreen.native';

const appConfig = require('../../../../app.json') as {
  expo: { icon: string; ios: { icon: string }; android: { icon: string } };
};

describe('<GlobalLoadingScreen />', () => {
  it('renders the unique App icon master with contain sizing instead of a clipped text wordmark', async () => {
    const screen = await render(<GlobalLoadingScreen />);
    const mark = screen.getByTestId('global-loading-mark');
    const icon = screen.getByTestId('global-loading-icon');
    const markStyle = StyleSheet.flatten(mark.props.style);
    const iconStyle = StyleSheet.flatten(icon.props.style);

    expect(screen.queryByText('ICAO')).toBeNull();
    expect(icon.props.source).toBe(GLOBAL_LOADING_ICON_SOURCE);
    expect(icon.props.resizeMode).toBe('contain');
    expect(markStyle.alignItems).toBe('center');
    expect(markStyle.justifyContent).toBe('center');
    expect(markStyle.width).toBe(markStyle.height);
    expect(iconStyle.width).toBe(iconStyle.height);
    expect(iconStyle.width).toBeLessThan(markStyle.width);
  });

  it('keeps Expo, iOS, Android, and the loading screen traceable to the same icon master', () => {
    const master = './assets/images/icon.png';
    expect(appConfig.expo.icon).toBe(master);
    expect(appConfig.expo.ios.icon).toBe(master);
    expect(appConfig.expo.android.icon).toBe(master);
    expect(GLOBAL_LOADING_ICON_SOURCE).toBe(require('../../../../assets/images/icon.png'));
  });
});
