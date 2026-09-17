const { getDefaultConfig } = require('expo/metro-config');

const { edgeOneSharedModule } = require('./tools/edgeone-shared-modules.cjs');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform);
  return edgeOneSharedModule(__dirname, resolution, platform, process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME);
};

module.exports = config;
