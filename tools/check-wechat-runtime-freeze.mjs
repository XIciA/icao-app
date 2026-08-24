import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const FORBIDDEN_RUNTIME_MARKERS = [
  'expo-native-wechat',
  'EXPO_PUBLIC_WECHAT_',
  'WECHAT_APP_',
  'WechatAuth',
  'signInWithWechat',
  '/v1/auth/wechat',
  'api.weixin.qq.com',
  'open.weixin.qq.com',
  'WechatOpenSDK',
  'WeChatSDK',
  'WXApi',
];
const REMOVED_RUNTIME_FILES = [
  'services/api/src/auth/recent-social-auth-grant.service.ts',
  'services/api/src/auth/wechat-auth.controller.ts',
  'services/api/src/auth/wechat-auth.schemas.ts',
  'services/api/src/auth/wechat-auth.service.ts',
];
const RUNTIME_FILES = [
  '.env.example',
  'app.config.js',
  'package.json',
  'packages/contracts/src/index.ts',
  'pnpm-lock.yaml',
  'services/api/.env.example',
];
const RUNTIME_DIRECTORIES = [
  'services/api/src',
  'src/components/auth',
  'src/features/account',
  'src/features/auth',
];

function fail(message) {
  throw new Error(`wechat_runtime_freeze:${message}`);
}

async function exists(relativePath) {
  return access(path.join(ROOT, relativePath)).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

async function filesBelow(relativeDirectory) {
  const result = [];
  async function visit(relativePath) {
    for (const entry of await readdir(path.join(ROOT, relativePath), { withFileTypes: true })) {
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        await visit(child);
      } else if (entry.isFile() && !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)) {
        result.push(child);
      }
    }
  }
  await visit(relativeDirectory);
  return result;
}

for (const removedFile of REMOVED_RUNTIME_FILES) {
  if (await exists(removedFile)) fail(`removed_file_present:${removedFile}`);
}

const scopedRuntimeFiles = [
  ...RUNTIME_FILES,
  ...(await Promise.all(RUNTIME_DIRECTORIES.map(filesBelow))).flat(),
];
for (const relativePath of scopedRuntimeFiles) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
    if (source.includes(marker)) fail(`forbidden_marker:${relativePath}:${marker}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.dependencies?.['expo-native-wechat'] || packageJson.devDependencies?.['expo-native-wechat']) {
  fail('dependency_present:expo-native-wechat');
}

const appJson = JSON.parse(await readFile(path.join(ROOT, 'app.json'), 'utf8'));
const appConfig = require('../app.config.js');
const originalVariant = process.env.ICAO_APP_VARIANT;
try {
  process.env.ICAO_APP_VARIANT = 'development';
  const development = appConfig({ config: appJson.expo });
  process.env.ICAO_APP_VARIANT = 'production';
  const production = appConfig({ config: appJson.expo });
  const productionPluginNames = production.plugins.map((entry) => Array.isArray(entry) ? entry[0] : entry);

  if (development.scheme !== 'readyoufife-dev') fail('development_scheme_invalid');
  if (production.scheme !== 'readyoufife') fail('production_scheme_invalid');
  if (production.ios?.usesAppleSignIn !== true) fail('apple_sign_in_capability_missing');
  if (Object.hasOwn(production.ios ?? {}, 'associatedDomains')) fail('associated_domains_present');
  if (!productionPluginNames.includes('expo-apple-authentication')) fail('apple_plugin_missing');
  if (productionPluginNames.some((name) => /wechat|weixin/iu.test(String(name)))) {
    fail('wechat_plugin_present');
  }
} finally {
  if (originalVariant === undefined) delete process.env.ICAO_APP_VARIANT;
  else process.env.ICAO_APP_VARIANT = originalVariant;
}

process.stdout.write('WeChat runtime freeze verified.\n');
