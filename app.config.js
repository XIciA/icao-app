const DEVELOPMENT_VARIANT = 'development';
const DEVELOPMENT_IOS_BUNDLE_IDENTIFIER = 'com.readyoufife.ios.dev';

module.exports = ({ config }) => {
  const isAndroidTest = process.env.ICAO_APP_VARIANT === 'android-test';
  const isDevelopment = process.env.ICAO_APP_VARIANT === DEVELOPMENT_VARIANT;
  const plugins = (config.plugins || []).filter((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return !['expo-dev-client', 'expo-apple-authentication'].includes(pluginName);
  });
  const appScheme = isDevelopment ? 'readyoufife-dev' : isAndroidTest ? 'readyoufife-test' : config.scheme;
  // A coinstalled package cannot use the official package's WeChat registration.
  const wechatAppId = isAndroidTest ? '' : process.env.ICAO_WECHAT_APP_ID?.trim() || '';
  const wechatUniversalLink = isAndroidTest ? '' : process.env.ICAO_WECHAT_UNIVERSAL_LINK?.trim() || '';

  return {
    ...config,
    name: isAndroidTest ? `${config.name} 测试版` : isDevelopment ? `${config.name} Dev` : config.name,
    scheme: appScheme,
    android: { ...config.android, package: isAndroidTest ? `${config.android.package}.test` : config.android.package },
    ios: {
      ...config.ios,
      bundleIdentifier: isDevelopment
        ? DEVELOPMENT_IOS_BUNDLE_IDENTIFIER
        : config.ios.bundleIdentifier,
      usesAppleSignIn: true,
    },
    plugins: [
      ...plugins,
      [
        './plugins/with-wechat-auth',
        {
          appId: wechatAppId,
          universalLink: wechatUniversalLink,
        },
      ],
      'expo-apple-authentication',
      [
        'expo-dev-client',
        {
          addGeneratedScheme: isDevelopment,
        },
      ],
    ],
  };
};

module.exports.DEVELOPMENT_IOS_BUNDLE_IDENTIFIER = DEVELOPMENT_IOS_BUNDLE_IDENTIFIER;
