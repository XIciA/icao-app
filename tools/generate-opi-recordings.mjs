// Generate missing OPI recordings once; playback continues through private resources.
// node tools/generate-opi-recordings.mjs [--limit=1]
// Outputs are checkpointed locally. Publication uses the existing content importer.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const write = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); };
const out = path.join(root, '.generated/opi-web-audio');
fs.mkdirSync(out, { recursive: true });
const topics = path.join(root, 'content/question-banks/banks/opi/topics');
const questions = fs.readdirSync(topics).filter(p => p.endsWith('.json')).sort().flatMap(p =>
  read(path.join(topics, p)).cards.filter(c => c.kind !== 'image' && c.audioText).map(c => ({ id: c.id, text: c.audioText })));
if (new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('duplicate_question_id');
const existing = read(path.join(root, 'content/question-banks/native-audio/opi/manifest.json'));
const old = new Map(existing.rows.map(row => [row.id, row]));
const missing = questions.filter(q => old.get(q.id)?.text !== q.text);
const settings = { provider: 'macOS-say', voice: 'Samantha', rate: 165, sampleRate: 24000, bitrate: '64k', macOS: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() };
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? missing.length);
if (!Number.isInteger(limit) || limit < 1) throw new Error('invalid_limit');
const run = promisify(execFile);
const rows = [];
async function generate(question) {
  const recipeHash = hash(JSON.stringify({ text: question.text, settings }));
  const file = `${question.id}-${recipeHash.slice(0, 12)}.mp3`;
  const dest = path.join(out, file);
  if (!fs.existsSync(dest)) {
    const textFile = dest + '.txt';
    const aiff = dest + '.aiff';
    fs.writeFileSync(textFile, question.text);
    await run('say', ['-v', settings.voice, '-r', String(settings.rate), '-f', textFile, '-o', aiff], { timeout: 90000 });
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', aiff, '-ac', '1', '-ar', String(settings.sampleRate), '-codec:a', 'libmp3lame', '-b:a', settings.bitrate, dest + '.part.mp3'], { timeout: 30000 });
    fs.renameSync(dest + '.part.mp3', dest);
    fs.unlinkSync(textFile); fs.unlinkSync(aiff);
  }
  const decoded = await run('ffmpeg', ['-v', 'info', '-nostdin', '-i', dest, '-af', 'volumedetect', '-f', 'null', '-'], { timeout: 30000 });
  const peakDb = Number(decoded.stderr.match(/max_volume: ([-.\d]+) dB/)?.[1]);
  if (!(peakDb > -60)) throw new Error(`silent_audio:${question.id}`);
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest], { encoding: 'utf8' }).trim());
  if (!(duration >= 0.4 && duration < 90)) throw new Error(`invalid_duration:${question.id}`);
  const bytes = fs.readFileSync(dest);
  return { ...question, file, recipeHash, duration, peakDb, bytes: bytes.length, sha256: hash(bytes) };
}
const selected = missing.slice(0, limit);
for (let index = 0; index < selected.length; index += 2) {
  rows.push(...await Promise.all(selected.slice(index, index + 2).map(generate)));
  write(path.join(out, 'checkpoint.json'), { settings, count: rows.length, rows });
  if (rows.length % 50 === 0) console.log(`opi_audio_progress ${rows.length}/${missing.length}`);
}
if (rows.length !== missing.length) {
  console.log(`sample_complete count=${rows.length}; full manifest unchanged`);
  process.exit(0);
}
const newRows = new Map(rows.map(row => [row.id, row]));
const records = {};
const resources = [];
for (const question of questions) {
  const reused = old.get(question.id)?.text === question.text;
  const row = reused ? old.get(question.id) : newRows.get(question.id);
  if (!row || row.text !== question.text) throw new Error(`missing_audio:${question.id}`);
  const objectKey = `revisions/opi/${row.sha256}/audio/opi/${reused ? 'rev13' : 'web-v1'}/${row.file}`;
  const publicPath = `/question-bank-assets/${objectKey}`;
  records[question.id] = { textSha256: hash(question.text), path: publicPath };
  if (!reused) {
    const target = path.join(out, 'resources', objectKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(out, row.file), target);
    resources.push({ objectKey, publicPath, checksum: row.sha256, bankId: 'opi', sizeBytes: row.bytes, mimeType: 'audio/mpeg', status: 'ready' });
  }
}
const sourceDir = path.join(root, 'content/question-banks/web-audio/opi');
fs.mkdirSync(sourceDir, { recursive: true });
for (const row of rows) fs.copyFileSync(path.join(out, row.file), path.join(sourceDir, row.file));
write(path.join(sourceDir, 'manifest.json'), { settings, count: rows.length, rows });
write(path.join(root, 'src/platform/audio/opi-recorded-audio.json'), { sourceRelease: 17, records });
write(path.join(out, 'release/resources.json'), { files: resources });
write(path.join(out, 'release/manifest.json'), { banks: [], resources: { file: 'resources.json' } });
console.log(`opi_audio_complete recordings=${questions.length} generated=${rows.length} bytes=${rows.reduce((n, r) => n + r.bytes, 0)}`);
