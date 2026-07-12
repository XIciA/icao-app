import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/src/ai/', import.meta.url), { recursive: true });
await cp(new URL('../src/ai/assets/', import.meta.url), new URL('../dist/src/ai/assets/', import.meta.url), { recursive: true });
