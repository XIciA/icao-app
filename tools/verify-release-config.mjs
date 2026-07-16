import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const app = JSON.parse(await readFile('app.json', 'utf8'));
const plugin = require('../plugins/with-android-release-signing');
const sample = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;
const first = plugin.applySigning(sample);
const second = plugin.applySigning(first);

if (app.expo.ios.bundleIdentifier !== 'com.anonymous.icao-app') {
  throw new Error('The existing iOS Bundle ID must remain unchanged.');
}
if (app.expo.android.package !== 'com.feizhuicao.app') {
  throw new Error('The Android release package must be com.feizhuicao.app.');
}
if (first !== second) throw new Error('The Android signing config plugin must be idempotent.');
if (!/release \{\s*signingConfig signingConfigs\.release/.test(first)) {
  throw new Error('The Android release build is not connected to release signing.');
}
if (!/debug \{\s*signingConfig signingConfigs\.debug/.test(first)) {
  throw new Error('The Android debug build signing was unexpectedly changed.');
}
if (!first.includes('Missing Android release signing environment')) {
  throw new Error('The release signing environment guard is missing.');
}

const page = await readFile('infra/download-site/index.html', 'utf8');
const caddy = await readFile('infra/gateway/Caddyfile', 'utf8');
if (!page.includes('noindex, nofollow, noarchive')) throw new Error('Download page noindex meta is missing.');
if (!caddy.includes('X-Robots-Tag "noindex, nofollow, noarchive"')) {
  throw new Error('Download response noindex header is missing.');
}

console.log('release configuration verified');
