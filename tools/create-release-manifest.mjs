import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const release = JSON.parse(await readFile(path.join(root, '.generated/release/current.json'), 'utf8'));
const outputDir = path.join(root, '.generated/release', release.displayVersion);

function gitFiles(paths = []) {
  const args = ['ls-files', '-co', '--exclude-standard', '-z'];
  if (paths.length) args.push('--', ...paths);
  return execFileSync('git', args, { cwd: root, maxBuffer: 1024 * 1024 * 64 })
    .toString('utf8').split('\0').filter(Boolean).sort();
}

async function hashFiles(files) {
  const entries = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    const stat = await lstat(absolute);
    if (!stat.isFile()) continue;
    const bytes = await readFile(absolute);
    entries.push({ path: file, bytes: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return entries;
}

const workspaceEntries = await hashFiles(gitFiles());
const apiPaths = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'packages/contracts', 'services/api', 'content/vocabulary', 'infra/api',
];
const apiEntries = await hashFiles(gitFiles(apiPaths));
const apiFingerprint = createHash('sha256')
  .update(apiEntries.map(({ path: file, sha256 }) => `${sha256}  ${file}`).join('\n'))
  .digest('hex');
const workspaceFingerprint = createHash('sha256')
  .update(workspaceEntries.map(({ path: file, sha256 }) => `${sha256}  ${file}`).join('\n'))
  .digest('hex');

await mkdir(outputDir, { recursive: true });
const manifest = {
  ...release,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  gitBranch: execFileSync('git', ['branch', '--show-current'], { cwd: root }).toString().trim(),
  workspaceFingerprint,
  apiFingerprint,
  fileCount: workspaceEntries.length,
  files: workspaceEntries,
};
await writeFile(path.join(outputDir, 'workspace-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(root, '.generated/release/current-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ fileCount: manifest.fileCount, workspaceFingerprint, apiFingerprint }, null, 2));
