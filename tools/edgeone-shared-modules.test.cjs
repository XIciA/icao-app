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
  for (const file of ['src/platform/storage.web.ts', 'src/features/native-commercial-testflight/CommerceRuntimeProvider.web.tsx', 'src/features/question-bank/recording/recording-repository.web.ts']) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, file) };
    assert.equal(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production'), resolution);
  }
  for (const name of ['member-content-cache.ts', 'member-content-cache.native.ts']) {
    const resolution = { type: 'sourceFile', filePath: path.join(root, 'src/features/question-bank/data', name) };
    assert.match(edgeOneSharedModule(root, resolution, 'web', 'edgeone-production').filePath, /member-content-cache\.browser\.ts$/);
  }
});
