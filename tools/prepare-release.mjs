import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'app.json');
const versionPath = path.join(root, 'src/config/app-version.ts');
const outputPath = path.join(root, '.generated/release/current.json');

const app = JSON.parse(await readFile(appPath, 'utf8'));
const now = new Date();
const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
);
const displayVersion = `v${parts.year}.${parts.month}.${parts.day}.${parts.hour}${parts.minute}`;
const epochMinutes = Math.floor((now.getTime() - Date.UTC(2020, 0, 1)) / 60_000);
const currentCode = Number(app.expo.android?.versionCode ?? 0);
const versionCode = Math.max(currentCode + 1, epochMinutes);

app.expo.ios = { ...app.expo.ios, buildNumber: String(versionCode) };
app.expo.android = { ...app.expo.android, versionCode };

await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`);
await writeFile(versionPath, `export const APP_DISPLAY_VERSION = '${displayVersion}';\n`);
await mkdir(path.dirname(outputPath), { recursive: true });

const release = {
  displayVersion,
  marketingVersion: app.expo.version,
  versionCode,
  iosBuildNumber: String(versionCode),
  createdAt: now.toISOString(),
  updatedAtDisplay: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（北京时间）`,
  androidPackage: app.expo.android.package,
  iosBundleIdentifier: app.expo.ios.bundleIdentifier,
};
await writeFile(outputPath, `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify(release, null, 2));
