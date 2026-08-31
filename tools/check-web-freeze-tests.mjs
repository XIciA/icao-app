import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareFreezeFiles,
  expoResolutionContext,
  isNativeOnlyFreezePath,
} from './check-web-freeze.mjs';

function entry(path, sha256 = 'a'.repeat(64), sources = ['metro_web_dependency_graph']) {
  return { path, sha256, sources };
}

test('Native implementations and generated brand products stay outside the Web freeze', () => {
  const expected = [
    entry('src/example.native.tsx'),
    entry('src/example.ios.tsx'),
    entry('assets/images/icon.png', 'b'.repeat(64), ['exact_web_config_or_asset']),
    entry('ios/app/Images.xcassets/AppIcon.appiconset/icon.png'),
  ];
  const current = [
    entry('src/example.native.tsx', 'c'.repeat(64)),
    entry('src/example.ios.tsx', 'd'.repeat(64)),
    entry('assets/images/icon.png', 'e'.repeat(64), ['exact_web_config_or_asset']),
    entry('ios/app/Images.xcassets/AppIcon.appiconset/icon.png', 'f'.repeat(64)),
  ];

  assert.equal(isNativeOnlyFreezePath('src/example.native.tsx'), true);
  assert.deepEqual(compareFreezeFiles(expected, current), {
    selectionAdded: [],
    selectionRemoved: [],
    contentChanged: [],
    ownershipChanged: [],
  });
});

test('the Web graph uses Expo CLI resolver semantics instead of Metro native fallback', () => {
  const nativeContext = { preferNativePlatform: true, sentinel: 'kept' };

  assert.deepEqual(expoResolutionContext(nativeContext, 'web'), {
    preferNativePlatform: false,
    sentinel: 'kept',
  });
  assert.equal(expoResolutionContext(nativeContext, 'ios'), nativeContext);
});

test('a frozen Web or shared Web behavior mutation still fails path by path', () => {
  const expected = [
    entry('vercel.json', 'a'.repeat(64), ['exact_web_config_or_asset']),
    entry('src/example.web.tsx'),
    entry('src/shared.ts'),
  ];
  const current = [
    entry('vercel.json', 'b'.repeat(64), ['exact_web_config_or_asset']),
    entry('src/example.web.tsx', 'c'.repeat(64)),
    entry('src/shared.ts', 'd'.repeat(64)),
  ];

  assert.deepEqual(compareFreezeFiles(expected, current).contentChanged, [
    'vercel.json',
    'src/example.web.tsx',
    'src/shared.ts',
  ]);
});

test('new or removed Web inputs remain freeze failures', () => {
  const comparison = compareFreezeFiles(
    [entry('src/legacy.web.tsx')],
    [entry('src/new.web.tsx')],
  );

  assert.deepEqual(comparison.selectionAdded, ['src/new.web.tsx']);
  assert.deepEqual(comparison.selectionRemoved, ['src/legacy.web.tsx']);
});
