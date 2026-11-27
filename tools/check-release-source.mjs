import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveReleaseEnvironment } from './release-environment.mjs';

export function validateReleaseSource({ branch, head, remoteHead, dirty }, target) {
  if (branch !== target.branch) throw new Error(`release_source_requires_${target.branch}`);
  if (dirty) throw new Error('release_source_dirty');
  if (!remoteHead) throw new Error(`release_source_origin_${target.branch}_missing`);
  if (head !== remoteHead) throw new Error(`release_source_not_origin_${target.branch}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (!args[0] || args[0].startsWith('--')) throw new Error('release_environment_required');
  const target = resolveReleaseEnvironment(args[0]);
  const flag = args.indexOf('--root');
  if (flag >= 0 && !args[flag + 1]) throw new Error('release_source_root_missing');
  const root = path.resolve(flag >= 0 ? args[flag + 1] : process.cwd());
  const git = (...params) => execFileSync('git', params, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let remoteHead = '';
  try { remoteHead = git('rev-parse', `refs/remotes/origin/${target.branch}`); } catch { /* stable error below */ }
  validateReleaseSource({ branch: git('branch', '--show-current'), head: git('rev-parse', 'HEAD'),
    remoteHead, dirty: Boolean(git('status', '--porcelain', '--untracked-files=all')) }, target);
  console.log(`Release source verified: ${target.environment} ${target.branch} ${remoteHead}`);
}
