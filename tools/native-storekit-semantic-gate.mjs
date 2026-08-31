#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const nativeStoreKitSemanticTargets = Object.freeze([
  'src/features/native-commercial-testflight/__tests__',
  'src/features/content/hotspot/__tests__/hotspot-commerce-entitlement-integration.native-test.tsx',
  'src/platform/__tests__/app-runtime-diagnostic-cleanup-test.tsx',
]);

export function assertSuccessfulSemanticRun(result) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit ${String(result.status)}`;
    throw new Error(`Native StoreKit semantic suite failed (${detail}).`);
  }
}

function selfTest() {
  assert.throws(
    () => assertSuccessfulSemanticRun({ status: 1, signal: null }),
    /semantic suite failed \(exit 1\)/u,
  );
  assert.throws(
    () => assertSuccessfulSemanticRun({ status: null, signal: 'SIGTERM' }),
    /semantic suite failed \(signal SIGTERM\)/u,
  );
  assert.doesNotThrow(() => assertSuccessfulSemanticRun({ status: 0, signal: null }));
  assert(nativeStoreKitSemanticTargets.includes(
    'src/features/native-commercial-testflight/__tests__',
  ));
  assert(nativeStoreKitSemanticTargets.includes(
    'src/features/content/hotspot/__tests__/hotspot-commerce-entitlement-integration.native-test.tsx',
  ));
  assert(nativeStoreKitSemanticTargets.includes(
    'src/platform/__tests__/app-runtime-diagnostic-cleanup-test.tsx',
  ));
  console.log('Native StoreKit semantic gate negative self-test passed');
}

function run() {
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'jest', '--runInBand', ...nativeStoreKitSemanticTargets],
    { cwd: process.cwd(), stdio: 'inherit' },
  );
  assertSuccessfulSemanticRun(result);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') {
    selfTest();
    return;
  }
  if (args.length > 0) throw new Error(`Unknown argument: ${args[0]}`);
  run();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
