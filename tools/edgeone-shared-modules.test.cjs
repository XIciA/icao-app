const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { edgeOneSharedModule, sharedModules } = require('./edgeone-shared-modules.cjs');
const root = path.resolve(__dirname, '..');

test('formal web selects shared account, sync, and protected topic logic', () => {
  for (const [source, target] of Object.entries(sharedModules)) {
    assert.ok(fs.existsSync(path.join(root, source)), source);
    assert.ok(fs.existsSync(path.join(root, target)), target);
    const resolution = { type: 'sourceFile', filePath: path.join(root, source) };
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production').filePath, path.join(root, target));
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'vercel-legacy'), resolution);
    assert.equal(edgeOneSharedModule(root, resolution, 'ios', 'edgeone-production'), resolution);
    assert.equal(edgeOneSharedModule(root, resolution, 'android', 'edgeone-production'), resolution);
  }
});
test('browser media, storage and commerce adapters remain browser-owned', () => {
  for (const file of ['src/platform/storage.web.ts', 'src/features/native-commercial-testflight/CommerceRuntimeProvider.browser.tsx', 'src/features/question-bank/recording/recording-repository.web.ts']) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, file) };
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production'), resolution);
  }
  for (const name of ['member-content-cache.ts', 'member-content-cache.native.ts']) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, 'src/features/question-bank/data', name) };
    assert.match(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production').filePath, /member-content-cache\.browser\.ts$/);
  }
});

test('legacy runtime keeps its original radio and commerce providers', () => {
  for (const file of ['src/features/radio-player/RadioPlayerProvider.web.tsx', 'src/features/native-commercial-testflight/CommerceRuntimeProvider.tsx', 'src/features/native-commercial-testflight/MembershipRoutePage.tsx']) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, file) };
    for (const runtime of [undefined, '', 'vercel-legacy']) {
      assert.equal(edgeOneSharedModule(root, resolution, 'web', runtime), resolution);
    }
    assert.match(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production').filePath, /\.browser\.tsx$/);
  }
});

test('formal web includes navigation and invalid-content recovery without changing legacy resolution', () => {
  const expected = {
    'src/components/navigation/useAppRouter.ts': 'src/components/navigation/useAppRouter.native.ts',
    'src/components/navigation/TopBar.tsx': 'src/components/navigation/TopBar.native.tsx',
    'src/components/account/account-ui.tsx': 'src/components/account/account-ui.native.tsx',
    'src/app/content/[slug].tsx': 'src/app/content/[slug].native.tsx',
    'src/features/editorial/ResourceEditorialScreen.tsx': 'src/features/editorial/ResourceEditorialScreen.native.tsx',
  };
  for (const [source, target] of Object.entries(expected)) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, source) };
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production').filePath, path.join(root, target));
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'vercel-legacy'), resolution);
  }
});

test('Metro defaults ordinary web builds to formal auth and shared app routes', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
  for (const value of [undefined, '', 'unknown', 'edgeone-production', 'vercel-legacy']) {
    const sandbox = {
      __dirname: root,
      module: { exports: {} },
      process: { env: { EXPO_PUBLIC_ICAO_WEB_RUNTIME: value } },
      require(name) {
        if (name === 'expo/metro-config') return { getDefaultConfig: () => ({ resolver: { assetExts: [] } }) };
        if (name === './tools/edgeone-shared-modules.cjs') return { edgeOneSharedModule };
        throw new Error(`Unexpected Metro dependency: ${name}`);
      },
    };
    vm.runInNewContext(source, sandbox, { filename: 'metro.config.js' });
    const { resolveRequest } = sandbox.module.exports.resolver;
    for (const file of ['src/features/auth/AuthProvider.web.tsx', 'src/app/_layout.tsx']) {
      const resolution = { type: 'sourceFile', filePath: path.join(root, file) };
      const context = { resolveRequest: () => resolution };
      const expected = value === 'vercel-legacy' ? file : sharedModules[file];
      assert.equal(resolveRequest(context, './module', 'web').filePath, path.join(root, expected));
      assert.equal(resolveRequest(context, './module', 'ios'), resolution);
      assert.equal(resolveRequest(context, './module', 'android'), resolution);
    }
  }
});
