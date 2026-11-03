import { copyFile, mkdir } from 'node:fs/promises';

const destination = new URL('../dist/src/vocabulary/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(
  new URL('../../../content/vocabulary/dataset.json', import.meta.url),
  new URL('dataset.json', destination),
);
await copyFile(new URL('../../../content/vocabulary/question-bank-core/book.json', import.meta.url), new URL('question-bank-core.json', destination));

await copyFile(new URL('../../../content/vocabulary/three-books/dataset.json', import.meta.url), new URL('three-books.json', destination));

await copyFile(new URL('../../../content/vocabulary/live/release.json', import.meta.url), new URL('live.json', destination));
// Ops uses rootDir=src; both processes consume the same immutable baseline.
const opsDestination = new URL('../dist-ops/vocabulary/', import.meta.url);
await mkdir(opsDestination, { recursive: true });
await copyFile(new URL('../../../content/vocabulary/live/release.json', import.meta.url), new URL('live.json', opsDestination));

// The API and content publisher use the same dictionary as the app bundle.
for (const directory of ['../dist/src/app-content/', '../dist-ops/app-content/']) {
  const target = new URL(directory, import.meta.url);
  await mkdir(target, { recursive: true });
  await copyFile(new URL('../../../content/word-lookup/dataset.json', import.meta.url), new URL('word-lookup.json', target));
}
