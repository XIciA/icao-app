import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { APP_BRAND_LOGO_SOURCE } from '@/components/brand/AppBrandLogo';

import { GlobalLoadingScreen } from '../GlobalLoadingScreen.native';

const appConfig = require('../../../../app.json') as {
  expo: {
    icon: string;
    ios: { icon: string };
    android: { icon: string };
    plugins: [string, Record<string, unknown>][];
  };
};

describe('<GlobalLoadingScreen />', () => {
  it('renders the unique App icon master with contain sizing instead of a clipped text wordmark', async () => {
    const screen = await render(<GlobalLoadingScreen />);
    const mark = screen.getByTestId('global-loading-mark');
    const logo = screen.getByTestId('global-loading-logo');
    const icon = screen.getByTestId('global-loading-logo-image', { includeHiddenElements: true });
    const markStyle = StyleSheet.flatten(mark.props.style);
    const logoStyle = StyleSheet.flatten(logo.props.style);
    const iconStyle = StyleSheet.flatten(icon.props.style);

    expect(screen.queryByText('ICAO')).toBeNull();
    expect(icon.props.source).toBe(APP_BRAND_LOGO_SOURCE);
    expect(icon.props.resizeMode).toBe('contain');
    expect(markStyle.alignItems).toBe('center');
    expect(markStyle.justifyContent).toBe('center');
    expect(markStyle.width).toBe(markStyle.height);
    expect(logoStyle.width).toBe(logoStyle.height);
    expect(logoStyle.width).toBeLessThan(markStyle.width);
    expect(iconStyle.width).toBe('100%');
    expect(iconStyle.height).toBe('100%');
  });

  it('keeps Expo, iOS, Android, both splash screens, and loading traceable to the same icon master', () => {
    const master = './assets/images/icon.png';
    const splashPlugin = appConfig.expo.plugins.find((plugin) => plugin[0] === 'expo-splash-screen');
    expect(appConfig.expo.icon).toBe(master);
    expect(appConfig.expo.ios.icon).toBe(master);
    expect(appConfig.expo.android.icon).toBe(master);
    expect(splashPlugin?.[1].image).toBe(master);
    expect(splashPlugin?.[1].resizeMode).toBe('contain');
    expect(APP_BRAND_LOGO_SOURCE).toBe(require('../../../../assets/images/icon.png'));
  });
});
