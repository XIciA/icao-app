const { getDefaultConfig } = require('expo/metro-config');

const { edgeOneSharedModule } = require('./tools/edgeone-shared-modules.cjs');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform);
  const runtime = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME === 'vercel-legacy'
    ? 'vercel-legacy'
    : 'edgeone-production';
  return edgeOneSharedModule(__dirname, resolution, platform, runtime);
};

module.exports = config;
