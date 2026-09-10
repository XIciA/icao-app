import { render } from '@testing-library/react-native';

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
  it('shows only the activity indicator and preparation copy without repeating the logo', async () => {
    const screen = await render(<GlobalLoadingScreen />);
    expect(screen.getByText('正在准备学习空间…')).toBeTruthy();
    expect(screen.getByTestId('global-loading-spinner')).toBeTruthy();
    expect(screen.queryByTestId('global-loading-mark')).toBeNull();
    expect(screen.queryByTestId('global-loading-logo')).toBeNull();
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.queryByText('ICAO')).toBeNull();
  });

  it('keeps the frozen Web fallback and approved Native brand master unchanged', () => {
    const master = './assets/images/icon.png';
    const splashPlugin = appConfig.expo.plugins.find((plugin) => plugin[0] === 'expo-splash-screen');
    expect(appConfig.expo.icon).toBe(master);
    expect(appConfig.expo.ios.icon).toBe(master);
    expect(appConfig.expo.android.icon).toBe(master);
    expect(splashPlugin?.[1].image).toBe(master);
    expect(splashPlugin?.[1].resizeMode).toBe('contain');
    expect(APP_BRAND_LOGO_SOURCE).toBe(require('../../../../assets/images/icon-native.png'));
  });
});
