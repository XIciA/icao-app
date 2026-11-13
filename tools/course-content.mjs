import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalAppContentJson } from '../packages/contracts/src/app-content.ts';
import { isCourseCatalog, isCourseRelease } from '../src/features/content/courses/course-content-schema.ts';

const payload = JSON.parse(await readFile('content/courses/catalog.json', 'utf8'));
if (!isCourseCatalog(payload)) throw new Error('invalid_course_catalog');
const checksum = createHash('sha256').update(canonicalAppContentJson(payload)).digest('hex');
let previous;
try { previous = JSON.parse(await readFile('public/course-content.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous && !isCourseRelease(previous)) throw new Error('invalid_previous_course_release');
if (process.argv.includes('--check')) {
  if (!previous || previous.checksum !== checksum || canonicalAppContentJson(previous.payload) !== canonicalAppContentJson(payload)) {
    throw new Error('course_content_requires_build');
  }
} else {
  const version = previous?.checksum === checksum ? previous.version : (previous?.version ?? 0) + 1;
  await writeFile('public/course-content.json', `${JSON.stringify({ schemaVersion: 1, version, checksum, payload }, null, 2)}\n`);
}
console.log('Course content is valid and synchronized.');
