import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkLucideBoundary } from './check-lucide-import-boundary.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'icao-icon-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/components/ui'), { recursive: true });
  fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const put = (file, text) => fs.writeFileSync(path.join(root, 'src', file), text);
  put('components/ui/icons.ts', "export * from './lucide-icons';\nexport { MembershipMark } from './light-icons';\n");
  put('components/ui/icons.native.ts', "export { AlertCircle } from './lucide-icons';\nexport { MembershipMark } from './light-icons';\n");
  put('components/ui/lucide-icons.ts', "export type { LucideIcon } from 'lucide-react-native';\nexport { default as AlertCircle } from 'lucide-react-native/icons/circle-alert';\n");
  put('components/ui/light-icons.tsx', "import type { LucideProps } from 'lucide-react-native';\nexport const MembershipMark = createLightIcon('MembershipMark');\n");
  put('screen.tsx', "import { AlertCircle, MembershipMark } from '@/components/ui/icons';\n");
  return { put, check: () => checkLucideBoundary(root).violations };
}

test('accepts controlled split gateways and approved custom icons including root type imports', t => {
  assert.deepEqual(fixture(t).check(), []);
});
for (const [label, source, expected] of [
  ['runtime root import', "import { AlertCircle } from 'lucide-react-native';", /runtime root/],
  ['default root with named type', "import Icons, { type LucideIcon } from 'lucide-react-native';", /runtime root/],
  ['runtime root re-export', "export { AlertCircle } from 'lucide-react-native';", /runtime root/],
  ['single-icon bypass', "import AlertCircle from 'lucide-react-native/icons/circle-alert';", /bypasses/],
  ['internal leaf bypass', "import { AlertCircle } from '@/components/ui/lucide-icons';", /bypasses/],
  ['dynamic root', "const icons = import('lucide-react-native');", /dynamically/],
  ['dynamic subpath', "const icon = require('lucide-react-native/icons/circle-alert');", /dynamically/],
  ['missing public name', "import { Absent } from '@/components/ui/icons';", /does not export imported runtime icon Absent/],
  ['wildcard public import', "import * as Icons from '@/components/ui/icons';", /named icon imports/],
]) test(`rejects ${label}`, t => { const f = fixture(t); f.put('bad.ts', source); assert.match(f.check().join('\n'), expected); });

test('rejects wrong official aliases and missing single-icon files', t => {
  const f = fixture(t);
  f.put('components/ui/lucide-icons.ts', "export { default as AlertCircle } from 'lucide-react-native/icons/not-a-real-icon';");
  const errors = f.check().join('\n');
  assert.match(errors, /locked Lucide package/); assert.match(errors, /missing runtime icon/);
});
test('rejects arbitrary gateway re-exports instead of recursively trusting any local module', t => {
  const f = fixture(t); f.put('components/ui/icons.ts', "export * from './unreviewed';");
  assert.match(f.check().join('\n'), /controlled internal gateway/);
});
test('rejects missing approved light symbols', t => {
  const f = fixture(t); f.put('components/ui/light-icons.tsx', '');
  assert.match(f.check().join('\n'), /missing light icon MembershipMark/);
});
test('rejects unapproved light symbols', t => {
  const f = fixture(t); f.put('components/ui/light-icons.tsx', "export const Unknown = createLightIcon('Unknown');");
  assert.match(f.check().join('\n'), /unapproved icon declaration Unknown/);
});
test('checks the native gateway as well as the browser gateway', t => {
  const f = fixture(t); f.put('components/ui/icons.native.ts', "export { MembershipMark } from './light-icons';");
  assert.match(f.check().join('\n'), /icons.native.ts does not export imported runtime icon AlertCircle/);
});
