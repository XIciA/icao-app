import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(root, 'scripts/release-ios-testflight.sh');
const source = readFileSync(scriptPath, 'utf8');
const optionsStart = source.indexOf('plutil -create xml1 "$EXPORT_OPTIONS"');
const optionsEnd = source.indexOf('\nexport NODE_BINARY=', optionsStart);
const exportStart = source.indexOf('EXPORT_ARGUMENTS=(');
const exportEnd = source.indexOf('\nIPA_PATH=', exportStart);

function exerciseExport(profile, check) {
  assert.ok(optionsStart >= 0 && optionsEnd > optionsStart && exportStart >= 0 && exportEnd > exportStart);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'icao-export-signing-'));
  const plistPath = path.join(directory, 'Export Options.plist');
  try {
    const profileName = typeof profile === 'function' ? profile(directory) : profile;
    // Execute only the actual option-writing and export-argument stanzas. The
    // local stub records argv; no archive, signer, provisioning or upload runs.
    const output = execFileSync('/bin/bash', ['-euc', [
      'set -o pipefail',
      source.slice(optionsStart, optionsEnd),
      'xcodebuild() { node -e \'process.stdout.write(JSON.stringify(process.argv.slice(1)))\' -- "$@"; }',
      'redact_asc_output() { cat; }',
      source.slice(exportStart, exportEnd),
    ].join('\n')], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        EXPORT_OPTIONS: plistPath,
        EXPORT_PATH: path.join(directory, 'Export Folder'),
        ARCHIVE_PATH: path.join(directory, 'Test Archive.xcarchive'),
        IOS_TEAM_ID: 'TESTTEAMID',
        IOS_BUNDLE_ID: 'com.readyoufife.ios',
        APP_STORE_CONNECT_KEY_PATH: path.join(directory, 'fake-key.p8'),
        APP_STORE_CONNECT_KEY_ID: 'TESTKEYID',
        APP_STORE_CONNECT_ISSUER_ID: 'TESTISSUER',
        ...(profileName === undefined ? {} : { ICAO_IOS_EXPORT_PROFILE_NAME: profileName }),
      },
    });
    const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], { encoding: 'utf8' }));
    check({ plist, args: JSON.parse(output), profileName, directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('TestFlight release shell is valid and archive remains automatically signed', () => {
  execFileSync('/bin/bash', ['-n', scriptPath]);
  const archive = source.slice(source.indexOf('\nxcodebuild \\'), source.indexOf('\nAPP_PATH='));
  assert.match(archive, /CODE_SIGN_STYLE=Automatic/u);
  assert.match(archive, /-allowProvisioningUpdates/u);
  assert.match(archive, /-authenticationKeyPath/u);
  assert.doesNotMatch(archive, /ICAO_IOS_EXPORT_PROFILE_NAME|provisioningProfiles|Manual/u);
});

for (const profile of [undefined, '']) {
  test(`export retains automatic signing when the profile is ${profile === undefined ? 'unset' : 'empty'}`, { skip: process.platform !== 'darwin' }, () => {
    exerciseExport(profile, ({ plist, args }) => {
      assert.equal(plist.method, 'app-store-connect');
      assert.equal(plist.destination, 'export');
      assert.equal(plist.signingStyle, 'automatic');
      assert.equal(plist.teamID, 'TESTTEAMID');
      assert.equal(plist.uploadSymbols, true);
      assert.equal(plist.signingCertificate, undefined);
      assert.equal(plist.provisioningProfiles, undefined);
      for (const flag of ['-exportArchive', '-allowProvisioningUpdates', '-authenticationKeyPath', '-authenticationKeyID', '-authenticationKeyIssuerID']) assert.ok(args.includes(flag));
      assert.equal(args[args.indexOf('-authenticationKeyID') + 1], 'TESTKEYID');
    });
  });
}

test('manual export selects the installed profile and local Apple Distribution identity without cloud-signing options', { skip: process.platform !== 'darwin' }, () => {
  exerciseExport('Read You 5 App Store Associated Domains 20260910', ({ plist, args, profileName, directory }) => {
    assert.equal(plist.signingStyle, 'manual');
    assert.equal(plist.signingCertificate, 'Apple Distribution');
    assert.deepEqual(plist.provisioningProfiles, { 'com.readyoufife.ios': profileName });
    assert.equal(plist.teamID, 'TESTTEAMID');
    assert.deepEqual(args, [
      '-exportArchive', '-archivePath', path.join(directory, 'Test Archive.xcarchive'),
      '-exportPath', path.join(directory, 'Export Folder'),
      '-exportOptionsPlist', path.join(directory, 'Export Options.plist'),
    ]);
  });
});

test('profile punctuation, Unicode and shell metacharacters remain literal structured plist data', { skip: process.platform !== 'darwin' }, () => {
  exerciseExport(directory => `Read You 5 "中文" & 'quoted' $(touch ${directory}/injected) \`touch ${directory}/backtick\`; \\ profile`, ({ plist, profileName, directory }) => {
    assert.deepEqual(plist.provisioningProfiles, { 'com.readyoufife.ios': profileName });
    assert.equal(existsSync(path.join(directory, 'injected')), false);
    assert.equal(existsSync(path.join(directory, 'backtick')), false);
  });
});
