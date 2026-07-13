import { copyFile, mkdir } from 'node:fs/promises';

const destination = new URL('../dist/src/vocabulary/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(
  new URL('../../../content/vocabulary/dataset.json', import.meta.url),
  new URL('dataset.json', destination),
);
