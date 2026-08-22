import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const sourcePath = resolve('edgeone.json');
const outputPath = join(resolve(process.argv[2] ?? 'dist'), 'edgeone.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));

const uploadConfig = Object.fromEntries(
  ['redirects', 'rewrites', 'headers']
    .filter((key) => source[key] !== undefined)
    .map((key) => [key, source[key]]),
);

await writeFile(outputPath, `${JSON.stringify(uploadConfig, null, 2)}\n`, 'utf8');
console.log(`EdgeOne direct-upload configuration written to ${outputPath}.`);
