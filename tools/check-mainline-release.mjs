import { execFileSync } from 'node:child_process';
import path from 'node:path';

function validateMainlineState({ branch, dirty, head, originMain }) {
  if (branch !== 'main') throw new Error(`release_source_not_main:${branch || 'detached'}`);
  if (dirty) throw new Error('release_source_dirty');
  if (!originMain) throw new Error('release_source_origin_main_missing');
  if (head !== originMain) throw new Error('release_source_not_origin_main');
}

function selfTest() {
  const valid = { branch: 'main', dirty: false, head: 'abc', originMain: 'abc' };
  validateMainlineState(valid);
  const cases = [
    [{ ...valid, branch: 'codex/task' }, 'release_source_not_main'],
    [{ ...valid, dirty: true }, 'release_source_dirty'],
    [{ ...valid, originMain: '' }, 'release_source_origin_main_missing'],
    [{ ...valid, originMain: 'def' }, 'release_source_not_origin_main'],
  ];
  for (const [state, code] of cases) {
    try {
      validateMainlineState(state);
      throw new Error(`self_test_expected_failure:${code}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith(code)) throw error;
    }
  }
  console.log('Mainline release guard self-test passed.');
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const rootFlag = args.indexOf('--root');
const requestedRoot = rootFlag >= 0 ? args[rootFlag + 1] : process.cwd();
if (!requestedRoot) throw new Error('release_source_root_missing');
const root = path.resolve(requestedRoot);

let originMain = '';
try {
  originMain = git(root, ['rev-parse', 'refs/remotes/origin/main']);
} catch {
  // Report a stable governance error below instead of leaking Git internals.
}

validateMainlineState({
  branch: git(root, ['branch', '--show-current']),
  dirty: Boolean(git(root, ['status', '--porcelain', '--untracked-files=all'])),
  head: git(root, ['rev-parse', 'HEAD']),
  originMain,
});

console.log(`Mainline release source verified: ${originMain}`);
