const DEVELOPMENT_VARIANT = 'development';
const DEVELOPMENT_IOS_BUNDLE_IDENTIFIER = 'com.readyoufife.ios.dev';

module.exports = ({ config }) => {
  const dataEnvironment = process.env.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT || 'production';
  if (!['production', 'testing'].includes(dataEnvironment)) throw new Error('invalid_data_environment');
  if (process.env.ICAO_RELEASE_ENVIRONMENT && process.env.ICAO_RELEASE_ENVIRONMENT !== dataEnvironment) {
    throw new Error('release_data_namespace_does_not_match_environment');
  }
  if (dataEnvironment === 'testing') {
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(process.env.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY || '')) {
      throw new Error('testing_content_public_key_required');
    }
    const environments = require('./config/release/environments.json');
    for (const [key, field] of [['EXPO_PUBLIC_ICAO_API_URL', 'apiUrl'], ['EXPO_PUBLIC_SUPABASE_URL', 'supabaseUrl']]) {
      const value = process.env[key];
      if (!value || value !== environments.testing[field] || Object.values(environments.production).includes(value)) {
        throw new Error('testing_runtime_does_not_match_selected_environment');
      }
    }
  }
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
