/* eslint-disable @typescript-eslint/no-require-imports */

const { APP_DISPLAY_VERSION } = require('../app-version.ts') as typeof import('../app-version');
const { APP_DISPLAY_VERSION: IOS_DISPLAY_VERSION } = require('../app-version.ios.ts') as typeof import('../app-version.ios');
const { APP_DISPLAY_VERSION: ANDROID_DISPLAY_VERSION } = require('../app-version.android.ts') as typeof import('../app-version.android');

describe('App Store launch version', () => {
  it('uses the 1.0.0 marketing version on every Native display surface', () => {
    expect(APP_DISPLAY_VERSION).toBe('1.0.0');
    expect(IOS_DISPLAY_VERSION).toBe(APP_DISPLAY_VERSION);
    expect(ANDROID_DISPLAY_VERSION).toBe(APP_DISPLAY_VERSION);
  });
});
