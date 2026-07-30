import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const forbidden = [
  'api.feizhuicao.com',
  'cloud.feizhuicao.com',
  '47.109.132.161',
];

if (!existsSync(dist)) throw new Error('web_dist_missing_run_web_export');

const files = [];
function walk(path) {
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) walk(child);
    else if (/\.(?:html|js|json|map)$/u.test(name)) files.push(child);
  }
}
walk(dist);

const matches = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const value of forbidden) {
    if (text.includes(value)) matches.push(`${file.slice(root.length + 1)}:${value}`);
  }
}
if (matches.length) throw new Error(`web_forbidden_runtime_origin:${matches.join(',')}`);
console.log(`web_network_boundary_ok files=${files.length}`);
