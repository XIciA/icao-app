import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  appStoreConnectApi as api,
  appStoreConnectAppContext as appContextForRoot,
  appStoreConnectCredentials as credentials,
} from './lib/app-store-connect-api.mjs';

const root = process.cwd();
const command = process.argv[2];
async function appContext(credentialsValue) {
  return appContextForRoot(credentialsValue, root);
}

async function recentBuilds(credentialsValue, appId, limit = 20) {
  const result = await api(credentialsValue, `/v1/builds?filter%5Bapp%5D=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=${limit}`);
  return result.data ?? [];
}

async function prepareBuild() {
  const credentialsValue = await credentials();
  const { app, appId, bundleId } = await appContext(credentialsValue);
  const builds = await recentBuilds(credentialsValue, appId, 1);
  const remote = Number(builds[0]?.attributes?.version ?? 0);
  const local = Number(app.expo.ios?.buildNumber ?? 0);
  if (!Number.isSafeInteger(remote) || !Number.isSafeInteger(local)) throw new Error('iOS build numbers must be integers.');
  const buildNumber = String(Math.max(remote, local) + 1);
  app.expo.ios = { ...app.expo.ios, buildNumber };
  await writeFile(path.join(root, 'app.json'), `${JSON.stringify(app, null, 2)}\n`);
  const outputPath = path.join(root, '.generated/testflight/version.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ appId, buildNumber, bundleId, marketingVersion: app.expo.version }, null, 2)}\n`);
  console.log(`Prepared iOS TestFlight build ${buildNumber}.`);
}

async function verifyBuild() {
  const credentialsValue = await credentials();
  const { app, appId } = await appContext(credentialsValue);
  const local = Number(app.expo.ios?.buildNumber ?? 0);
  const builds = await recentBuilds(credentialsValue, appId, 1);
  const remote = Number(builds[0]?.attributes?.version ?? 0);
  if (!Number.isSafeInteger(local) || local <= remote) {
    throw new Error('Local iOS build number is not newer than App Store Connect. Run release:ios:testflight:prepare, review, and commit it first.');
  }
  console.log(`iOS build ${local} is newer than the current App Store Connect build.`);
}

async function assignInternalGroups() {
  const credentialsValue = await credentials();
  const { app, appId } = await appContext(credentialsValue);
  const buildNumber = String(app.expo.ios?.buildNumber ?? '');
  let builds = [];
  let target;
  for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
    builds = await recentBuilds(credentialsValue, appId, 50);
    target = builds.find((build) => String(build.attributes?.version) === buildNumber);
    if (!target) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  if (!target) throw new Error('The uploaded TestFlight build is not visible in App Store Connect yet.');
  let groups = [];
  for (const previous of builds.filter((build) => build.id !== target.id)) {
    const related = await api(
      credentialsValue,
      `/v1/betaGroups?filter%5Bbuilds%5D=${encodeURIComponent(previous.id)}&filter%5BisInternalGroup%5D=true&limit=200`,
    );
    groups = (related.data ?? []).filter((group) => group.attributes?.isInternalGroup === true);
    if (groups.length > 0) break;
  }
  const targetGroups = await api(
    credentialsValue,
    `/v1/betaGroups?filter%5Bbuilds%5D=${encodeURIComponent(target.id)}&filter%5BisInternalGroup%5D=true&limit=200`,
  );
  const targetGroupIds = new Set((targetGroups.data ?? []).map((group) => group.id));
  const missingGroups = groups.filter(
    (group) => group.attributes?.hasAccessToAllBuilds !== true && !targetGroupIds.has(group.id),
  );
  if (missingGroups.length > 0) {
    await api(credentialsValue, `/v1/builds/${target.id}/relationships/betaGroups`, {
      body: JSON.stringify({ data: missingGroups.map((group) => ({ id: group.id, type: 'betaGroups' })) }),
      method: 'POST',
    });
  }
  console.log(
    `Uploaded build is available to ${groups.length} existing internal TestFlight group(s); added ${missingGroups.length}.`,
  );
}

if (command === 'prepare') await prepareBuild();
else if (command === 'verify-build') await verifyBuild();
else if (command === 'assign-groups') await assignInternalGroups();
else throw new Error('Usage: node tools/app-store-connect-testflight.mjs <prepare|verify-build|assign-groups>');
