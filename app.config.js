const DEVELOPMENT_VARIANT = 'development';
const DEVELOPMENT_IOS_BUNDLE_IDENTIFIER = 'com.readyoufife.ios.dev';

module.exports = ({ config }) => {
  const isDevelopment = process.env.ICAO_APP_VARIANT === DEVELOPMENT_VARIANT;
  const wechatAppId = process.env.EXPO_PUBLIC_WECHAT_APP_ID?.trim();
  const wechatUniversalLink = process.env.EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK?.trim();
  let wechatAssociatedDomain;
  if (wechatUniversalLink) {
    try {
      wechatAssociatedDomain = `applinks:${new URL(wechatUniversalLink).host}`;
    } catch {
      throw new Error('invalid_EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK');
    }
  }
  const {
    associatedDomains: configuredAssociatedDomains = [],
    ...baseIosConfig
  } = config.ios || {};
  const associatedDomains = [
    ...configuredAssociatedDomains,
    ...(wechatAssociatedDomain ? [wechatAssociatedDomain] : []),
  ];
  const plugins = (config.plugins || []).filter((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return !['expo-dev-client', 'expo-apple-authentication', 'expo-native-wechat'].includes(pluginName);
  });
  const appScheme = isDevelopment ? 'readyoufife-dev' : config.scheme;

  return {
    ...config,
    name: isDevelopment ? `${config.name} Dev` : config.name,
    scheme: wechatAppId ? [appScheme, wechatAppId] : appScheme,
    ios: {
      ...baseIosConfig,
      ...(associatedDomains.length > 0 ? { associatedDomains } : {}),
      bundleIdentifier: isDevelopment
        ? DEVELOPMENT_IOS_BUNDLE_IDENTIFIER
        : config.ios.bundleIdentifier,
      usesAppleSignIn: true,
    },
    plugins: [
      ...plugins,
      'expo-apple-authentication',
      'expo-native-wechat',
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
