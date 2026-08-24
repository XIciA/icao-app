const DEVELOPMENT_VARIANT = 'development';
const DEVELOPMENT_IOS_BUNDLE_IDENTIFIER = 'com.readyoufife.ios.dev';

module.exports = ({ config }) => {
  const isDevelopment = process.env.ICAO_APP_VARIANT === DEVELOPMENT_VARIANT;
  const plugins = (config.plugins || []).filter((entry) => {
    const pluginName = Array.isArray(entry) ? entry[0] : entry;
    return !['expo-dev-client', 'expo-apple-authentication'].includes(pluginName);
  });
  const appScheme = isDevelopment ? 'readyoufife-dev' : config.scheme;

  return {
    ...config,
    name: isDevelopment ? `${config.name} Dev` : config.name,
    scheme: appScheme,
    ios: {
      ...config.ios,
      bundleIdentifier: isDevelopment
        ? DEVELOPMENT_IOS_BUNDLE_IDENTIFIER
        : config.ios.bundleIdentifier,
      usesAppleSignIn: true,
    },
    plugins: [
      ...plugins,
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
