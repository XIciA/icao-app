#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function exactlyOne(entries, suffix, iosRoot) {
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one top-level ${suffix} in ${iosRoot}; found ${matches.length}: ${matches.join(', ') || 'none'}`,
    );
  }
  return matches[0];
}

export async function discoverIosCngProduct(iosRoot) {
  const entries = await readdir(iosRoot, { withFileTypes: true });
  const workspaceName = exactlyOne(entries, '.xcworkspace', iosRoot);
  const projectName = exactlyOne(entries, '.xcodeproj', iosRoot);
  const workspaceStem = workspaceName.slice(0, -'.xcworkspace'.length);
  const projectStem = projectName.slice(0, -'.xcodeproj'.length);
  if (workspaceStem !== projectStem) {
    throw new Error(
      `Generated workspace and project names do not match: ${workspaceName}, ${projectName}`,
    );
  }
  return {
    workspace: path.join(iosRoot, workspaceName),
    project: path.join(iosRoot, projectName),
    productName: projectStem,
  };
}

async function verifyGeneratedProduct(iosRoot) {
  const identity = await discoverIosCngProduct(iosRoot);
  const listing = spawnSync('xcodebuild', ['-list', '-json', '-project', identity.project], {
    encoding: 'utf8',
  });
  if (listing.status !== 0) {
    throw new Error(`Unable to inspect generated Xcode schemes: ${listing.stderr.trim()}`);
  }

  let schemes;
  try {
    schemes = JSON.parse(listing.stdout).project?.schemes;
  } catch {
    throw new Error('xcodebuild returned invalid project JSON.');
  }
  if (!Array.isArray(schemes) || schemes.length !== 1) {
    throw new Error(
      `Expected exactly one generated application scheme; found ${Array.isArray(schemes) ? schemes.length : 0}.`,
    );
  }
  if (schemes[0] !== identity.productName) {
    throw new Error(
      `Generated scheme ${schemes[0]} does not match product ${identity.productName}.`,
    );
  }

  process.stdout.write(`${identity.workspace}\n${schemes[0]}\n${identity.productName}\n`);
}

async function selfTest() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'icao-ios-cng-gate-'));
  const iosRoot = path.join(temporaryRoot, 'ios');
  try {
    await mkdir(path.join(iosRoot, 'app.xcworkspace'), { recursive: true });
    await mkdir(path.join(iosRoot, 'app.xcodeproj'));
    await mkdir(path.join(iosRoot, 'ICAO.xcworkspace'));
    await expectFailure(iosRoot, 'two workspaces');

    await rm(path.join(iosRoot, 'ICAO.xcworkspace'), { recursive: true });
    const clean = await discoverIosCngProduct(iosRoot);
    if (path.basename(clean.workspace) !== 'app.xcworkspace' || clean.productName !== 'app') {
      throw new Error('Clean generated iOS identity was not discovered deterministically.');
    }

    await mkdir(path.join(iosRoot, 'ICAO.xcodeproj'));
    await expectFailure(iosRoot, 'two projects');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  console.log('iOS CNG stale-project gate self-test passed');
}

async function expectFailure(iosRoot, scenario) {
  try {
    await discoverIosCngProduct(iosRoot);
  } catch {
    return;
  }
  throw new Error(`The iOS CNG gate accepted ${scenario}.`);
}

try {
  if (process.argv[2] === '--self-test') await selfTest();
  else if (process.argv.length === 3) await verifyGeneratedProduct(path.resolve(process.argv[2]));
  else throw new Error('Usage: verify-ios-cng-product.mjs <ios-root> | --self-test');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
