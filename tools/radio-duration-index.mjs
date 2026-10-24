/** App-only duration hints derived from the existing content manifest and media.
 * Never changes bank payloads, source audio, or frozen Vercel artifacts. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const banks = read(join(root, 'src/features/question-bank/data/question-bank.json'));
const files = read(join(root, 'content/question-banks/resources/manifest.source.json')).files;
const manifest = new Map(files.map(file => [file.publicPath, file]));
const output = join(root, 'src/features/radio-player/audio-duration-hints.json');
const previous = existsSync(output) ? read(output) : {};
const hints = {};
const paths = new Set(banks.flatMap(bank => bank.categories.flatMap(category => category.topics.flatMap(topic => topic.cards.flatMap(card => card.audio && !card.audioDurationSeconds ? [card.audio] : [])))));
for (const path of [...paths].sort()) {
  const file = manifest.get(path);
  if (!file) throw new Error(`radio_audio_missing_manifest:${path}`);
  let duration = file.durationSeconds || (previous[path]?.checksum === file.checksum ? previous[path].duration : undefined);
  if (!(duration > 0)) {
    if (process.argv.includes('--check')) throw new Error(`radio_duration_hint_missing:${path}`);
    const candidates = [join(root, 'content/question-banks/resources/files', file.sourceRelativePath), join(root, 'content/question-banks/resources/audio', file.sourceRelativePath.replace(/^audio\//, '')), join(process.env.QUESTION_BANK_AUDIO_ROOT ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio', file.sourceRelativePath.replace(/^audio\//, ''))];
    const source = candidates.find(existsSync);
    if (!source) throw new Error(`radio_audio_source_missing:${path}`);
    if (createHash('sha256').update(readFileSync(source)).digest('hex') !== file.checksum) throw new Error(`radio_audio_checksum_mismatch:${path}`);
    duration = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source], { encoding: 'utf8' }).trim()) * 1000) / 1000;
  }
  if (!(duration > 0)) throw new Error(`radio_audio_duration_invalid:${path}`);
  hints[path] = { checksum: file.checksum, duration };
}
const json = `${JSON.stringify(hints, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== json) throw new Error('radio_duration_hints_outdated');
} else writeFileSync(output, json);
console.log(`radio_duration_hints_ok files=${Object.keys(hints).length}`);
