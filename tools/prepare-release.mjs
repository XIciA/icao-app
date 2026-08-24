import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'app.json');
const versionPaths = [
  'src/config/app-version.ts',
  'src/config/app-version.ios.ts',
  'src/config/app-version.android.ts',
].map((entry) => path.join(root, entry));
const outputPath = path.join(root, '.generated/release/current.json');
const materializeOnly = process.argv.includes('--materialize');

const app = JSON.parse(await readFile(appPath, 'utf8'));
const now = new Date();
const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
);
const displayVersion = String(app.expo.version);
let versionCode;

if (materializeOnly) {
  for (const versionPath of versionPaths) {
    const versionSource = await readFile(versionPath, 'utf8');
    const match = versionSource.match(/APP_DISPLAY_VERSION\s*=\s*['"]([^'"]+)['"]/u);
    if (!match) throw new Error('committed_display_version_missing');
    if (match[1] !== displayVersion) throw new Error('committed_display_version_mismatch');
  }
  versionCode = Number(app.expo.android?.versionCode ?? 0);
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error('committed_version_code_invalid');
  if (!/^\d+$/u.test(String(app.expo.ios?.buildNumber ?? ''))) throw new Error('committed_ios_build_number_invalid');
} else {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!branch || branch === 'main') throw new Error('release_prepare_requires_task_branch');
  if (dirty) throw new Error('release_prepare_requires_clean_worktree');
  const epochMinutes = Math.floor((now.getTime() - Date.UTC(2020, 0, 1)) / 60_000);
  const currentCode = Number(app.expo.android?.versionCode ?? 0);
  versionCode = Math.max(currentCode + 1, epochMinutes);

  app.expo.ios = { ...app.expo.ios, buildNumber: String(versionCode) };
  app.expo.android = { ...app.expo.android, versionCode };

  await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`);
  await Promise.all(versionPaths.map((versionPath) => (
    writeFile(versionPath, `export const APP_DISPLAY_VERSION = '${displayVersion}';\n`)
  )));
}

await mkdir(path.dirname(outputPath), { recursive: true });

const release = {
  displayVersion,
  marketingVersion: app.expo.version,
  versionCode,
  iosBuildNumber: String(app.expo.ios.buildNumber),
  createdAt: now.toISOString(),
  updatedAtDisplay: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（北京时间）`,
  androidPackage: app.expo.android.package,
  iosBundleIdentifier: app.expo.ios.bundleIdentifier,
};
await writeFile(outputPath, `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify(release, null, 2));
