#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSTREAM = path.join(ROOT, 'docs/workstreams/web-question-bank-content-migration');
const GENERATED = path.join(ROOT, '.generated/web-question-bank-content-migration');
const SNAPSHOT_ROOT = path.join(GENERATED, 'source-snapshot');
const SOURCE_ROOT = process.env.WEB_QUESTION_BANK_ROOT
  ? path.resolve(process.env.WEB_QUESTION_BANK_ROOT)
  : '/Users/zhouyide/Desktop/web题库';
const BATCH_SIZE = 225;

const SNAPSHOT_INPUTS = [
  'banks',
  'quarantine/banks',
  'resources/audio',
  'manifests/units',
  'manifests/extraction-state.json',
];

const APP_BANK_ROOT = path.join(ROOT, 'content/question-banks/banks');
const APP_EMBEDDED = path.join(ROOT, 'src/features/question-bank/data/question-bank.json');
const APP_RESOURCE_MANIFEST = path.join(
  ROOT,
  'content/question-banks/resources/manifest.source.json',
);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(tempPath, filePath);
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', resolve);
  });
  return hash.digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function walkFiles(rootPath) {
  const result = [];
  async function visit(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) result.push(absolutePath);
    }
  }
  if (await exists(rootPath)) await visit(rootPath);
  return result;
}

async function collectInputFiles(rootPath) {
  const files = [];
  for (const relativeInput of SNAPSHOT_INPUTS) {
    const absoluteInput = path.join(rootPath, relativeInput);
    invariant(await exists(absoluteInput), `冻结输入不存在：${absoluteInput}`);
    const stat = await fsp.stat(absoluteInput);
    if (stat.isDirectory()) files.push(...(await walkFiles(absoluteInput)));
    else files.push(absoluteInput);
  }
  return [...new Set(files)].sort((a, b) =>
    path.relative(rootPath, a).localeCompare(path.relative(rootPath, b), 'en'),
  );
}

async function createFileManifest(rootPath, files, onProgress) {
  const entries = [];
  for (let index = 0; index < files.length; index += 1) {
    const absolutePath = files[index];
    const stat = await fsp.stat(absolutePath);
    entries.push({
      path: path.relative(rootPath, absolutePath).split(path.sep).join('/'),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: await sha256File(absolutePath),
    });
    if (onProgress && ((index + 1) % 250 === 0 || index + 1 === files.length)) {
      await onProgress(index + 1, files.length);
    }
  }
  const rootChecksum = sha256Text(
    entries.map((entry) => `${entry.path}\0${entry.sizeBytes}\0${entry.sha256}`).join('\n'),
  );
  return {
    algorithm: 'sha256',
    fileCount: entries.length,
    sizeBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    rootChecksum,
    files: entries,
  };
}

async function copyFrozenInputs(sourceManifest) {
  if (await exists(SNAPSHOT_ROOT)) await fsp.rm(SNAPSHOT_ROOT, { recursive: true, force: true });
  await ensureDir(SNAPSHOT_ROOT);

  for (let index = 0; index < sourceManifest.files.length; index += 1) {
    const entry = sourceManifest.files[index];
    const sourcePath = path.join(SOURCE_ROOT, entry.path);
    const destinationPath = path.join(SNAPSHOT_ROOT, entry.path);
    await ensureDir(path.dirname(destinationPath));
    await fsp.copyFile(sourcePath, destinationPath);
    await fsp.utimes(destinationPath, new Date(), new Date(entry.modifiedAt));
    if ((index + 1) % 250 === 0 || index + 1 === sourceManifest.files.length) {
      await writeJsonAtomic(path.join(GENERATED, 'freeze-progress.json'), {
        stage: 'copy',
        completed: index + 1,
        total: sourceManifest.files.length,
        updatedAt: new Date().toISOString(),
      });
      console.log(`freeze copy ${index + 1}/${sourceManifest.files.length}`);
    }
  }
}

async function chmodSnapshotReadOnly() {
  const files = await walkFiles(SNAPSHOT_ROOT);
  for (const filePath of files) await fsp.chmod(filePath, 0o444);
  const directories = [];
  async function visit(currentPath) {
    directories.push(currentPath);
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) await visit(path.join(currentPath, entry.name));
    }
  }
  await visit(SNAPSHOT_ROOT);
  directories.sort((a, b) => b.length - a.length);
  for (const directory of directories) await fsp.chmod(directory, 0o555);
}

async function loadTopicFiles(bankId) {
  const topicRoot = path.join(APP_BANK_ROOT, bankId, 'topics');
  const files = (await walkFiles(topicRoot)).filter((filePath) => filePath.endsWith('.json'));
  return Promise.all(files.map(async (filePath) => ({ filePath, data: await readJson(filePath) })));
}

async function appBankSummary(bankId) {
  const topics = await loadTopicFiles(bankId);
  const files = [];
  let cards = 0;
  for (const topic of topics) {
    cards += topic.data.cards.length;
    files.push({
      path: path.relative(ROOT, topic.filePath).split(path.sep).join('/'),
      id: topic.data.id,
      categoryId: topic.data.categoryId,
      cards: topic.data.cards.length,
      sha256: await sha256File(topic.filePath),
    });
  }
  return {
    bankId,
    topics: topics.length,
    cards,
    files,
    contentChecksum: sha256Text(files.map((file) => `${file.path}\0${file.sha256}`).join('\n')),
  };
}

async function listJsonFiles(rootPath) {
  return (await walkFiles(rootPath)).filter((filePath) => filePath.endsWith('.json'));
}

async function loadFrozenCandidates() {
  const candidates = [];

  const listeningRoots = [
    { zone: 'banks', root: path.join(SNAPSHOT_ROOT, 'banks/listening') },
    { zone: 'quarantine', root: path.join(SNAPSHOT_ROOT, 'quarantine/banks/listening') },
  ];
  for (const source of listeningRoots) {
    for (const filePath of await listJsonFiles(source.root)) {
      const unit = await readJson(filePath);
      invariant(Array.isArray(unit.items), `听力单元缺少 items：${filePath}`);
      for (const item of unit.items) {
        candidates.push({
          kind: 'listening',
          sourceZone: source.zone,
          sourceId: item.id,
          sourceContainerId: unit.id,
          sourceJsonPath: path.relative(SNAPSHOT_ROOT, filePath).split(path.sep).join('/'),
          sourceAudioPath: item.audio,
          source: item,
        });
      }
    }
  }

  for (const filePath of await listJsonFiles(path.join(SNAPSHOT_ROOT, 'banks/radiotelephony'))) {
    const unit = await readJson(filePath);
    invariant(Array.isArray(unit.items), `陆空通话场景缺少 items：${filePath}`);
    for (const item of unit.items) {
      candidates.push({
        kind: 'radiotelephony',
        sourceZone: 'banks',
        sourceId: item.id,
        sourceContainerId: unit.id,
        sourceJsonPath: path.relative(SNAPSHOT_ROOT, filePath).split(path.sep).join('/'),
        sourceAudioPath: item.audio,
        sourceContainer: {
          taskTitle: unit.taskTitle,
          background: unit.background,
        },
        source: item,
      });
    }
  }

  for (const filePath of await listJsonFiles(path.join(SNAPSHOT_ROOT, 'banks/storytelling'))) {
    const item = await readJson(filePath);
    candidates.push({
      kind: 'storytelling',
      sourceZone: 'banks',
      sourceId: item.id,
      sourceContainerId: item.id,
      sourceJsonPath: path.relative(SNAPSHOT_ROOT, filePath).split(path.sep).join('/'),
      sourceAudioPath: item.audio,
      source: item,
    });
  }

  candidates.sort((a, b) => {
    const kindOrder = ['listening', 'radiotelephony', 'storytelling'];
    return (
      kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      a.sourceJsonPath.localeCompare(b.sourceJsonPath, 'en') ||
      a.sourceId.localeCompare(b.sourceId, 'en')
    );
  });
  return candidates;
}

async function buildAudioMetadataIndex() {
  const index = new Map();
  for (const filePath of await listJsonFiles(path.join(SNAPSHOT_ROOT, 'manifests/units'))) {
    const unit = await readJson(filePath);
    const manifestItems = Array.isArray(unit.items) ? unit.items : unit.file ? [unit] : [];
    for (const item of manifestItems) {
      if (!item.file) continue;
      index.set(item.file, {
        bytes: item.bytes,
        sha256: item.sha256,
        contentType: item.contentType,
        detectedFormat: item.detectedFormat,
        codec: item.codec,
        sampleRate: item.sampleRate,
        channels: item.channels,
        durationSeconds: item.durationSeconds,
      });
    }
  }
  return index;
}

async function createAppBaseline({ write = true } = {}) {
  const bankIds = ['listening', 'radiotelephony', 'storytelling', 'opi', 'sentences900'];
  const banks = [];
  for (const bankId of bankIds) banks.push(await appBankSummary(bankId));
  const baseline = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    banks,
    embeddedQuestionBank: {
      path: path.relative(ROOT, APP_EMBEDDED),
      sha256: await sha256File(APP_EMBEDDED),
    },
    resourceManifest: {
      path: path.relative(ROOT, APP_RESOURCE_MANIFEST),
      sha256: await sha256File(APP_RESOURCE_MANIFEST),
      version: (await readJson(APP_RESOURCE_MANIFEST)).version,
      files: (await readJson(APP_RESOURCE_MANIFEST)).files.length,
    },
  };
  baseline.rootChecksum = sha256Text(
    JSON.stringify({
      banks: baseline.banks.map((bank) => [bank.bankId, bank.contentChecksum, bank.cards]),
      embedded: baseline.embeddedQuestionBank.sha256,
      resources: baseline.resourceManifest.sha256,
    }),
  );
  if (write) await writeJsonAtomic(path.join(WORKSTREAM, 'snapshots/app-baseline.json'), baseline);
  return baseline;
}

async function createInventory(sourceManifest) {
  const candidates = await loadFrozenCandidates();
  const audioMetadata = await buildAudioMetadataIndex();
  const seenIds = new Set();
  const mapping = [];
  const counts = { listening: 0, radiotelephony: 0, storytelling: 0 };
  const zones = { banks: 0, quarantine: 0 };
  const errors = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    counts[candidate.kind] += 1;
    zones[candidate.sourceZone] += 1;
    if (seenIds.has(candidate.sourceId)) errors.push(`重复源 ID：${candidate.sourceId}`);
    seenIds.add(candidate.sourceId);

    const audioPath = path.join(SNAPSHOT_ROOT, candidate.sourceAudioPath);
    const manifestAudio = audioMetadata.get(candidate.sourceAudioPath);
    if (!(await exists(audioPath))) errors.push(`源音频缺失：${candidate.sourceId} ${candidate.sourceAudioPath}`);
    if (!manifestAudio) errors.push(`单元清单缺少音频：${candidate.sourceId} ${candidate.sourceAudioPath}`);
    else if ((await exists(audioPath)) && (await sha256File(audioPath)) !== manifestAudio.sha256) {
      errors.push(`音频 checksum 不一致：${candidate.sourceId} ${candidate.sourceAudioPath}`);
    }

    mapping.push({
      ordinal: index + 1,
      kind: candidate.kind,
      webSourceId: candidate.sourceId,
      webContainerId: candidate.sourceContainerId,
      sourceZone: candidate.sourceZone,
      sourceJsonPath: candidate.sourceJsonPath,
      sourceAudioPath: candidate.sourceAudioPath,
      sourceAudioSha256: manifestAudio?.sha256 ?? null,
      sourceDurationSeconds: manifestAudio?.durationSeconds ?? null,
      snapshotRootChecksum: sourceManifest.rootChecksum,
      decision: 'pending',
      reasonCode: null,
      closestAppId: null,
      appNewId: null,
      targetDirectory: null,
      appAudioPath: null,
    });
  }

  invariant(candidates.length === 2288, `冻结候选总数应为 2288，实际 ${candidates.length}`);
  invariant(counts.listening === 777, `听力候选应为 777，实际 ${counts.listening}`);
  invariant(counts.radiotelephony === 1367, `陆空通话候选应为 1367，实际 ${counts.radiotelephony}`);
  invariant(counts.storytelling === 144, `故事候选应为 144，实际 ${counts.storytelling}`);
  invariant(zones.quarantine === 37, `隔离区听力应为 37，实际 ${zones.quarantine}`);
  invariant(errors.length === 0, `冻结输入完整性失败：\n${errors.slice(0, 20).join('\n')}`);

  await writeJsonAtomic(path.join(GENERATED, 'mapping-skeleton.json'), mapping);
  const inventory = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    snapshotRootChecksum: sourceManifest.rootChecksum,
    candidates: candidates.length,
    counts,
    zones,
    uniqueSourceIds: seenIds.size,
    audioFilesVerified: mapping.length,
    errors,
  };
  await writeJsonAtomic(path.join(WORKSTREAM, 'snapshots/web-inventory.json'), inventory);
  return inventory;
}

async function freeze() {
  invariant(await exists(SOURCE_ROOT), `Web 题库目录不存在：${SOURCE_ROOT}`);
  await ensureDir(GENERATED);
  await ensureDir(path.join(WORKSTREAM, 'snapshots'));
  await ensureDir(path.join(WORKSTREAM, 'reports'));
  await ensureDir(path.join(WORKSTREAM, 'decisions'));

  console.log('freeze: hashing source files');
  const sourceFiles = await collectInputFiles(SOURCE_ROOT);
  const sourceBefore = await createFileManifest(SOURCE_ROOT, sourceFiles, async (completed, total) => {
    await writeJsonAtomic(path.join(GENERATED, 'freeze-progress.json'), {
      stage: 'source-hash-before-copy',
      completed,
      total,
      updatedAt: new Date().toISOString(),
    });
    console.log(`freeze source hash ${completed}/${total}`);
  });
  sourceBefore.sourceRoot = SOURCE_ROOT;
  sourceBefore.capturedAt = new Date().toISOString();

  console.log('freeze: copying read-only snapshot');
  await copyFrozenInputs(sourceBefore);

  console.log('freeze: verifying source did not change during copy');
  const sourceAfterFiles = await collectInputFiles(SOURCE_ROOT);
  const sourceAfter = await createFileManifest(SOURCE_ROOT, sourceAfterFiles);
  invariant(
    sourceBefore.rootChecksum === sourceAfter.rootChecksum,
    'Web 源在冻结期间发生变化；已拒绝使用不一致快照，请重新运行 freeze。',
  );

  console.log('freeze: verifying snapshot bytes');
  const snapshotFiles = await collectInputFiles(SNAPSHOT_ROOT);
  const snapshotManifest = await createFileManifest(SNAPSHOT_ROOT, snapshotFiles, async (completed, total) => {
    await writeJsonAtomic(path.join(GENERATED, 'freeze-progress.json'), {
      stage: 'snapshot-verify',
      completed,
      total,
      updatedAt: new Date().toISOString(),
    });
    console.log(`freeze snapshot verify ${completed}/${total}`);
  });
  invariant(
    sourceBefore.rootChecksum === snapshotManifest.rootChecksum,
    `源与快照根 checksum 不一致：${sourceBefore.rootChecksum} != ${snapshotManifest.rootChecksum}`,
  );

  const frozenManifest = {
    ...sourceBefore,
    snapshotPath: path.relative(ROOT, SNAPSHOT_ROOT).split(path.sep).join('/'),
    snapshotVerifiedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(path.join(WORKSTREAM, 'snapshots/web-source-manifest.json'), frozenManifest);
  await writeJsonAtomic(path.join(GENERATED, 'source-snapshot-manifest.json'), snapshotManifest);

  console.log('freeze: validating candidate inventory and App baseline');
  const inventory = await createInventory(frozenManifest);
  const appBaseline = await createAppBaseline();
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'freeze-complete',
    sourceRootChecksum: frozenManifest.rootChecksum,
    appRootChecksum: appBaseline.rootChecksum,
    inventory,
    batchSize: BATCH_SIZE,
    updatedAt: new Date().toISOString(),
  });

  await chmodSnapshotReadOnly();
  await writeJsonAtomic(path.join(GENERATED, 'freeze-progress.json'), {
    stage: 'complete',
    completed: frozenManifest.fileCount,
    total: frozenManifest.fileCount,
    sourceRootChecksum: frozenManifest.rootChecksum,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      {
        status: 'freeze-complete',
        sourceRootChecksum: frozenManifest.rootChecksum,
        files: frozenManifest.fileCount,
        sizeBytes: frozenManifest.sizeBytes,
        candidates: inventory.candidates,
        appRootChecksum: appBaseline.rootChecksum,
      },
      null,
      2,
    ),
  );
}

async function verifyFreeze() {
  const saved = await readJson(path.join(WORKSTREAM, 'snapshots/web-source-manifest.json'));
  const files = await collectInputFiles(SNAPSHOT_ROOT);
  const current = await createFileManifest(SNAPSHOT_ROOT, files);
  invariant(saved.rootChecksum === current.rootChecksum, '冻结快照 checksum 已漂移。');
  console.log(
    JSON.stringify(
      { status: 'freeze-verified', rootChecksum: current.rootChecksum, files: current.fileCount },
      null,
      2,
    ),
  );
}

const AUDIT_RULE_VERSION = 'web-question-bank-audit-v1.8.0';
const ICAO_WORDS = new Map([
  ['alpha', 'a'],
  ['bravo', 'b'],
  ['charlie', 'c'],
  ['delta', 'd'],
  ['echo', 'e'],
  ['foxtrot', 'f'],
  ['golf', 'g'],
  ['hotel', 'h'],
  ['india', 'i'],
  ['juliett', 'j'],
  ['juliet', 'j'],
  ['kilo', 'k'],
  ['lima', 'l'],
  ['mike', 'm'],
  ['november', 'n'],
  ['oscar', 'o'],
  ['papa', 'p'],
  ['quebec', 'q'],
  ['romeo', 'r'],
  ['sierra', 's'],
  ['tango', 't'],
  ['uniform', 'u'],
  ['victor', 'v'],
  ['whiskey', 'w'],
  ['x-ray', 'x'],
  ['xray', 'x'],
  ['yankee', 'y'],
  ['zulu', 'z'],
]);

const AIRLINE_ALIASES = [
  ['british airways', 'baw'],
  ['speedbird', 'baw'],
  ['speed bird', 'baw'],
  ['air france', 'afr'],
  ['singapore airlines', 'sia'],
  ['singapore', 'sia'],
  ['sinapore', 'sia'],
  ['sinagpore', 'sia'],
  ['qantas', 'qfa'],
  ['united airlines', 'ual'],
  ['united', 'ual'],
  ['japan airlines', 'jal'],
  ['japan air', 'jal'],
  ['air canada', 'aca'],
  ['air china', 'cca'],
  ['airchina', 'cca'],
  ['china southern', 'csn'],
  ['china southen', 'csn'],
  ['china eastern', 'ces'],
  ['dragonair', 'hda'],
  ['northwest', 'nwa'],
  ['lufthansa', 'dlh'],
  ['korean air', 'kal'],
  ['danair', 'dan'],
  ['karun airlines', 'kru'],
  ['greater bay airlines', 'hgb'],
  ['gulf air', 'gfa'],
  ['transworld airlines', 'twa'],
  ['trans world airlines', 'twa'],
];

const DIGIT_WORDS = new Map([
  ['zero', '0'],
  ['oh', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['tree', '3'],
  ['four', '4'],
  ['fower', '4'],
  ['five', '5'],
  ['fife', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['niner', '9'],
]);

const SMALL_NUMBER_WORDS = new Map([
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);

const NUMBER_WORD_PATTERN = [
  ...DIGIT_WORDS.keys(),
  ...SMALL_NUMBER_WORDS.keys(),
  'hundred',
  'thousand',
  'decimal',
  'point',
].sort((a, b) => b.length - a.length).join('|');
const NUMBER_RUN = new RegExp(`\\b(?:${NUMBER_WORD_PATTERN})(?:[\\s-]+(?:${NUMBER_WORD_PATTERN}))*\\b`, 'gi');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumberWords(run) {
  const words = run.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const decimalAt = words.findIndex((word) => word === 'decimal' || word === 'point');
  if (decimalAt >= 0) {
    const integerWords = words.slice(0, decimalAt);
    const decimalWords = words.slice(decimalAt + 1);
    const integer = parseNumberWords(integerWords.join(' '));
    const decimals = decimalWords.map((word) => DIGIT_WORDS.get(word)).join('');
    if (integer && decimals && decimalWords.every((word) => DIGIT_WORDS.has(word))) {
      return `${integer}.${decimals}`;
    }
    return run;
  }

  if (words.every((word) => DIGIT_WORDS.has(word))) {
    return words.map((word) => DIGIT_WORDS.get(word)).join('');
  }

  if (!words.some((word) => word === 'hundred' || word === 'thousand')) {
    const firstNonDigit = words.findIndex((word) => !DIGIT_WORDS.has(word));
    if (
      firstNonDigit > 0 &&
      words
        .slice(firstNonDigit)
        .every((word) => SMALL_NUMBER_WORDS.has(word) || DIGIT_WORDS.has(word))
    ) {
      const prefix = words
        .slice(0, firstNonDigit)
        .map((word) => DIGIT_WORDS.get(word))
        .join('');
      const tail = words.slice(firstNonDigit).reduce((sum, word) => {
        if (SMALL_NUMBER_WORDS.has(word)) return sum + SMALL_NUMBER_WORDS.get(word);
        return sum + Number(DIGIT_WORDS.get(word));
      }, 0);
      return `${prefix}${String(tail).padStart(2, '0')}`;
    }
    if (
      firstNonDigit === 0 &&
      words.every((word) => SMALL_NUMBER_WORDS.has(word) || DIGIT_WORDS.has(word))
    ) {
      return String(
        words.reduce((sum, word) => {
          if (SMALL_NUMBER_WORDS.has(word)) return sum + SMALL_NUMBER_WORDS.get(word);
          return sum + Number(DIGIT_WORDS.get(word));
        }, 0),
      );
    }
  }

  let total = 0;
  let current = 0;
  for (const word of words) {
    if (DIGIT_WORDS.has(word)) current += Number(DIGIT_WORDS.get(word));
    else if (SMALL_NUMBER_WORDS.has(word)) current += SMALL_NUMBER_WORDS.get(word);
    else if (word === 'hundred') current = Math.max(1, current) * 100;
    else if (word === 'thousand') {
      total += Math.max(1, current) * 1000;
      current = 0;
    } else return run;
  }
  return String(total + current);
}

function normalizeText(value, { story = false } = {}) {
  let text = String(value ?? '').normalize('NFKC');
  text = text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\(\s*\d+\s*words?\s*\)/gi, ' ')
    .replace(/\[\s*\d+\s*words?\s*\]/gi, ' ')
    .replace(/^\s*background information\s*/i, ' ')
    .replace(/^\s*story\s*\d+\s*[:.-]?\s*/i, ' ')
    .replace(/(^|\n)\s*(?:b|c|p|ctl|app|gnd|twr|tower|ground|approach)\s*[:：]\s*/gi, '$1 ');
  if (!story) text = text.replace(/^\s*\d+\s*[.)]\s*/, ' ');
  for (const [alias, code] of AIRLINE_ALIASES) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), code);
  }
  text = text.replace(NUMBER_RUN, (run) => parseNumberWords(run));
  for (const [word, letter] of ICAO_WORDS) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'), letter);
  }
  text = text
    .replace(/\b(?:\d\s+){1,}\d\b/g, (run) => run.replace(/\s+/g, ''))
    .replace(/\b(?:[A-Za-z]\s+){1,}[A-Za-z]\b/g, (run) => run.replace(/\s+/g, ''))
    .toLowerCase()
    .replace(/metres?/g, 'meters')
    .replace(/kilometres?/g, 'kilometers')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = text.match(/[a-z]+|\d+(?:\.\d+)?/g) ?? [];
  return {
    normalized: tokens.join(' '),
    compact: tokens.join(''),
    tokens,
  };
}

function splitListeningText(audioText) {
  const text = String(audioText ?? '');
  const match = /(?:^|\n|\s)ques(?:tion|iton)(?:\s*\d+)?\s*[:：]\s*/i.exec(text);
  if (match) {
    return {
      body: text.slice(0, match.index).trim(),
      question: text.slice(match.index + match[0].length).trim(),
    };
  }
  const lines = text.split(/\r?\n/);
  const lastQuestionLine = lines.findLastIndex((line) => /\?\s*$/.test(line.trim()));
  if (lastQuestionLine > 0) {
    return {
      body: lines.slice(0, lastQuestionLine).join('\n').trim(),
      question: lines[lastQuestionLine].replace(/^\s*\d+\s*[.)]\s*/, '').trim(),
    };
  }
  return { body: text, question: '' };
}

function ngrams(value, width = 4) {
  if (!value) return new Set();
  if (value.length <= width) return new Set([value]);
  const result = new Set();
  for (let index = 0; index <= value.length - width; index += 1) {
    result.add(value.slice(index, index + width));
  }
  return result;
}

function diceSets(left, right) {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let intersection = 0;
  for (const item of small) if (large.has(item)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function jaccardSets(left, right) {
  if (left.size === 0 && right.size === 0) return 1;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return union.size ? intersection / union.size : 0;
}

function textSimilarity(left, right) {
  const leftNgrams = left._ngrams ?? (left._ngrams = ngrams(left.compact));
  const rightNgrams = right._ngrams ?? (right._ngrams = ngrams(right.compact));
  const char = diceSets(leftNgrams, rightNgrams);
  const token = jaccardSets(new Set(left.tokens), new Set(right.tokens));
  const lengthRatio =
    Math.max(left.compact.length, right.compact.length) === 0
      ? 1
      : Math.min(left.compact.length, right.compact.length) /
        Math.max(left.compact.length, right.compact.length);
  return { char, token, lengthRatio };
}

function extractHardFacts(textProfile) {
  const text = textProfile.normalized;
  const callsigns = [];
  const runways = [];
  const units = [];
  const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const match of text.matchAll(/\b(qfa|sia|afr|baw|ual|klm|jal|aca|cca|csn|ces|hda|nwa|dal|dlh|kal|dan|kru|hgb|gfa|eal|twa)\s*(\d+)\b/g)) {
    callsigns.push(`${match[1].toUpperCase()}${match[2]}`);
  }
  for (const match of text.matchAll(/\brunway\s*(\d{1,2})\s*([lrc])?\b/g)) {
    runways.push(`${match[1]}${(match[2] ?? '').toUpperCase()}`);
  }
  for (const match of text.matchAll(/\b(meters?|feet|foot|ft|kilometers?|km|miles?|nm|knots?|kt|mhz|pounds?|lbs?|kilograms?|kg|minutes?|seconds?|hours?)\b/g)) {
    units.push(match[1]);
  }
  const critical = [];
  for (const term of [
    'left',
    'right',
    'climb',
    'descend',
    'cleared',
    'cancel',
    'hold',
    'affirm',
    'negative',
    'unable',
    'takeoff',
    'landing',
  ]) {
    if (new RegExp(`\\b${term}\\b`).test(text)) critical.push(term);
  }
  return {
    callsigns: callsigns.sort(),
    numbers: numbers.sort(),
    runways: runways.sort(),
    units: units.sort(),
    critical: critical.sort(),
  };
}

function factsDifference(left, right) {
  const result = [];
  for (const key of ['callsigns', 'numbers', 'runways', 'units', 'critical']) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      result.push(`${key}:${JSON.stringify(left[key])}!=${JSON.stringify(right[key])}`);
    }
  }
  return result;
}

function numberFactMultisetsEquivalent(leftValues, rightValues) {
  const left = [...leftValues];
  const right = [...rightValues];
  for (let index = left.length - 1; index >= 0; index -= 1) {
    const matchIndex = right.indexOf(left[index]);
    if (matchIndex >= 0) {
      left.splice(index, 1);
      right.splice(matchIndex, 1);
    }
  }
  const consumeGroupedThousands = (parts, compounds) => {
    let changed = false;
    for (let compoundIndex = compounds.length - 1; compoundIndex >= 0; compoundIndex -= 1) {
      const compound = compounds[compoundIndex];
      if (!/^\d{4,6}$/.test(compound)) continue;
      const prefix = compound.slice(0, -3);
      const suffix = compound.slice(-3);
      const prefixIndex = parts.indexOf(prefix);
      const suffixIndex = parts.findIndex((value, index) => value === suffix && index !== prefixIndex);
      if (prefixIndex < 0 || suffixIndex < 0) continue;
      for (const index of [prefixIndex, suffixIndex].sort((a, b) => b - a)) parts.splice(index, 1);
      compounds.splice(compoundIndex, 1);
      changed = true;
    }
    return changed;
  };
  while (consumeGroupedThousands(left, right) || consumeGroupedThousands(right, left)) {
    // Continue until both representations have no more deterministic joins.
  }
  return left.length === 0 && right.length === 0;
}

function deterministicFactEquivalence(left, right) {
  for (const key of ['callsigns', 'runways', 'units', 'critical']) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) return [];
  }
  return numberFactMultisetsEquivalent(left.numbers, right.numbers)
    ? ['number-grouping-equivalent']
    : [];
}

function serializeTextProfile(profile) {
  return { normalized: profile.normalized, compact: profile.compact, tokens: profile.tokens };
}

function buildContentProfile(kind, source) {
  if (kind === 'listening') {
    const split = splitListeningText(source.audioText);
    const body = normalizeText(split.body);
    const question = normalizeText(split.question);
    const choices = (source.choices ?? []).map((choice) => normalizeText(choice));
    const correct = choices[source.correctChoiceIndex] ?? normalizeText('');
    const orderedChoices = [...choices].sort((a, b) => a.compact.localeCompare(b.compact, 'en'));
    const factsText = normalizeText(
      `${source.audioText ?? ''}\n${(source.choices ?? []).join('\n')}\n${correct.normalized}`,
    );
    const exactSignature = sha256Text(
      [body.compact, question.compact, orderedChoices.map((choice) => choice.compact).join('|'), correct.compact].join('\0'),
    );
    return {
      kind,
      body,
      question,
      choices,
      correct,
      combined: normalizeText(`${split.body}\n${split.question}\n${(source.choices ?? []).join('\n')}`),
      hardFacts: extractHardFacts(factsText),
      exactSignature,
    };
  }
  if (kind === 'radiotelephony') {
    const audio = normalizeText(source.audioText);
    const reference = normalizeText(source.referenceText);
    const combined = normalizeText(`${source.audioText ?? ''}\n${source.referenceText ?? ''}`);
    return {
      kind,
      audio,
      reference,
      combined,
      hardFacts: extractHardFacts(combined),
      exactSignature: sha256Text(`${audio.compact}\0${reference.compact}`),
    };
  }
  const audio = normalizeText(source.audioText, { story: true });
  return {
    kind,
    audio,
    combined: audio,
    hardFacts: extractHardFacts(audio),
    exactSignature: sha256Text(audio.compact),
  };
}

function serializableProfile(profile) {
  const base = {
    kind: profile.kind,
    hardFacts: profile.hardFacts,
    exactSignature: profile.exactSignature,
  };
  if (profile.kind === 'listening') {
    return {
      ...base,
      body: serializeTextProfile(profile.body),
      question: serializeTextProfile(profile.question),
      choices: profile.choices.map(serializeTextProfile),
      correct: serializeTextProfile(profile.correct),
      combined: serializeTextProfile(profile.combined),
    };
  }
  if (profile.kind === 'radiotelephony') {
    return {
      ...base,
      audio: serializeTextProfile(profile.audio),
      reference: serializeTextProfile(profile.reference),
      combined: serializeTextProfile(profile.combined),
    };
  }
  return { ...base, audio: serializeTextProfile(profile.audio), combined: serializeTextProfile(profile.combined) };
}

function hydrateProfile(profile) {
  return profile;
}

function choicesSimilarity(left, right) {
  if (left.length !== right.length || left.length === 0) return 0;
  const remaining = new Set(right.map((_, index) => index));
  let sum = 0;
  for (const leftChoice of left) {
    let bestIndex = -1;
    let best = -1;
    for (const index of remaining) {
      const similarity = textSimilarity(leftChoice, right[index]).char;
      if (similarity > best) {
        best = similarity;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) remaining.delete(bestIndex);
    sum += Math.max(0, best);
  }
  return sum / left.length;
}

function compareProfiles(left, right) {
  const hardFactDifferences = factsDifference(left.hardFacts, right.hardFacts);
  const factEquivalence = hardFactDifferences.length
    ? deterministicFactEquivalence(left.hardFacts, right.hardFacts)
    : [];
  const factsEqual = hardFactDifferences.length === 0 || factEquivalence.length > 0;
  if (left.kind === 'listening') {
    const body = textSimilarity(left.body, right.body);
    const question = textSimilarity(left.question, right.question);
    const choices = choicesSimilarity(left.choices, right.choices);
    const correct = textSimilarity(left.correct, right.correct).char;
    const overall = body.char * 0.45 + question.char * 0.2 + choices * 0.2 + correct * 0.15;
    return {
      exact: left.exactSignature === right.exactSignature,
      highConfidence:
        factsEqual &&
        ((body.char >= 0.5 && question.char >= 0.95 && choices >= 0.95 && correct >= 0.95) ||
          (body.char >= 0.995 && choices >= 0.95 && correct >= 0.95) ||
          (body.char >= 0.95 && question.char >= 0.95 && choices >= 0.8 && correct >= 0.95)),
      borderline: overall >= 0.8 || (body.char >= 0.9 && question.char >= 0.75),
      overall,
      factsEqual,
      factEquivalence,
      hardFactDifferences,
      fields: { body: body.char, question: question.char, choices, correct, bodyToken: body.token },
    };
  }
  if (left.kind === 'radiotelephony') {
    const audio = textSimilarity(left.audio, right.audio);
    const reference = textSimilarity(left.reference, right.reference);
    const overall = audio.char * 0.55 + reference.char * 0.45;
    return {
      exact: left.exactSignature === right.exactSignature,
      highConfidence:
        factsEqual &&
        ((audio.char >= 0.84 && reference.char >= 0.84) ||
          (audio.char >= 0.995 && reference.char >= 0.5) ||
          (reference.char >= 0.995 && audio.char >= 0.7)),
      borderline: overall >= 0.78 || (Math.max(audio.char, reference.char) >= 0.92 && Math.min(audio.char, reference.char) >= 0.6),
      overall,
      factsEqual,
      factEquivalence,
      hardFactDifferences,
      fields: {
        audio: audio.char,
        reference: reference.char,
        audioToken: audio.token,
        referenceToken: reference.token,
      },
    };
  }
  const audio = textSimilarity(left.audio, right.audio);
  return {
    exact: left.exactSignature === right.exactSignature,
    highConfidence: factsEqual && audio.char >= 0.97 && audio.token >= 0.94 && audio.lengthRatio >= 0.97,
    borderline: audio.char >= 0.8 || (audio.token >= 0.82 && audio.lengthRatio >= 0.8),
    overall: audio.char,
    factsEqual,
    factEquivalence,
    hardFactDifferences,
    fields: { audio: audio.char, token: audio.token, lengthRatio: audio.lengthRatio },
  };
}

function roundMetrics(comparison) {
  return {
    overall: Number(comparison.overall.toFixed(6)),
    factsEqual: comparison.factsEqual,
    factEquivalence: comparison.factEquivalence ?? [],
    fields: Object.fromEntries(
      Object.entries(comparison.fields).map(([key, value]) => [key, Number(value.toFixed(6))]),
    ),
  };
}

function validateCandidate(candidate) {
  const source = candidate.source;
  if (!String(source.audioText ?? '').trim()) return 'missing-audio-text';
  if (!String(candidate.sourceAudioPath ?? '').trim()) return 'missing-audio-path';
  if (candidate.kind === 'listening') {
    if (!splitListeningText(source.audioText).question) return 'missing-question';
    if (!Array.isArray(source.choices) || source.choices.length !== 4) return 'invalid-choice-count';
    if (!Number.isInteger(source.correctChoiceIndex) || source.correctChoiceIndex < 0 || source.correctChoiceIndex > 3) {
      return 'invalid-correct-choice-index';
    }
    if (source.choices.some((choice) => !String(choice ?? '').trim())) return 'empty-choice';
  }
  if (candidate.kind === 'radiotelephony' && !String(source.referenceText ?? '').trim()) {
    return 'missing-reference-text';
  }
  return null;
}

function classifyListening(candidate, durationSeconds) {
  const { body } = splitListeningText(candidate.source.audioText);
  const normalized = normalizeText(body);
  const raw = body.toLowerCase();
  let score = 0;
  const reasons = [];
  if (/(^|\n)\s*(?:c|ctl|app|gnd|twr|tower|ground|approach)\s*[:：]/i.test(body)) {
    score += 5;
    reasons.push('controller-speaker-label');
  }
  if (/(^|\n)\s*p\s*[:：]/i.test(body) && /(^|\n)\s*(?:c|ctl|app|gnd|twr)\s*[:：]/i.test(body)) {
    score += 4;
    reasons.push('pilot-controller-exchange');
  }
  const hasCallsign = /\b(qfa|sia|afr|baw|ual|klm|jal|aca|cca|csn|ces|hda|nwa|dal|dlh|kal|dan|kru|hgb|gfa|eal|twa)\s*\d+\b/.test(
    normalized.normalized,
  );
  if (hasCallsign) {
    score += 3;
    reasons.push('callsign');
  }
  const radioTerms = raw.match(/\b(cleared|squawk|contact|heading|flight level|line up|hold position|maintain|descend|climb|taxi|report|wilco|roger|mayday|pan pan|runway|approach|tower)\b/g) ?? [];
  score += Math.min(5, new Set(radioTerms).size);
  if (radioTerms.length) reasons.push('standard-radiotelephony-terms');
  if (/\b(request|unable|affirm|negative)\b/.test(raw) && /\b(runway|heading|level|altitude|frequency|tower|approach|ground|control)\b/.test(raw)) {
    score += 2;
    reasons.push('direct-request-or-report');
  }
  if (/\b(mechanic|engineer|dispatcher|flight attendant|cabin crew|ground staff|maintenance personnel|operations staff)\b/.test(raw)) {
    score -= 5;
    reasons.push('ordinary-non-atc-dialogue');
  }
  if (/\b(according to|is defined as|refers to|the purpose of|in aviation|the accident|the incident|the pilot was|the aircraft was|ladies and gentlemen|this is your captain)\b/.test(raw)) {
    score -= 4;
    reasons.push('narration-or-explanation');
  }
  const hasExplicitControllerLabel = /(^|\n)\s*(?:c|ctl|app|gnd|twr|tower|ground|approach)\s*[:：]/i.test(body);
  const eventNarration =
    !hasExplicitControllerLabel &&
    (/^\s*on\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(body) ||
      /\b(?:the crew|the aircraft|flight\s+\d+|[a-z][a-z-]*\s+\d+)\s+(?:was|were|had|reported|declared|returned|diverted|landed)\b/i.test(body));
  if (eventNarration) {
    score -= 10;
    reasons.push('accident-or-news-narration');
  }
  const directRadioForm =
    hasExplicitControllerLabel ||
    (hasCallsign && radioTerms.length > 0) ||
    /\b(?:we|i)\s+(?:request|are unable|cannot|declare)\b/.test(raw) ||
    /^\s*(?:tower|approach|ground|control|departure)\s*[,.:]/.test(raw);
  const nature = !eventNarration && directRadioForm && score >= 4 ? 'radiotelephony' : 'aviation-english';
  const durationBorderline = durationSeconds > 18 && durationSeconds < 20;
  const length = durationSeconds < 19 ? '10s' : '20s';
  let topicId;
  if (nature === 'aviation-english') topicId = length === '10s' ? 'listening-topic-01' : 'listening-topic-03';
  else topicId = length === '10s' ? 'listening-topic-04' : 'listening-topic-02';
  return {
    nature,
    durationClass: length,
    durationSeconds,
    durationBorderline,
    score,
    reasons,
    targetTopicId: topicId,
    confidence: Math.abs(score - 4) <= 2 ? 'borderline' : 'normal',
  };
}

function classifyRadiotelephony(candidate) {
  const slug = candidate.sourceContainerId.toLowerCase();
  const match = slug.match(/-(qfa|sia|afr|baw|ual|klm|jal|aca|cca|csn|ces)(\d+)$/);
  if (!match) return { error: 'unknown-callsign-slug' };
  return {
    code: match[1].toUpperCase(),
    number: match[2],
    display: `${match[1].toUpperCase()} ${match[2]}`,
    targetCategoryId: `atc-${match[1]}`,
  };
}

async function loadAppEntries(kind) {
  const bankId = kind;
  const topics = await loadTopicFiles(bankId);
  const entries = [];
  for (const topic of topics) {
    for (const card of topic.data.cards) {
      entries.push({
        origin: 'app',
        id: card.id,
        topicId: topic.data.id,
        categoryId: topic.data.categoryId,
        profile: buildContentProfile(kind, card),
      });
    }
  }
  return entries;
}

function makeMatchReference(entry, comparison) {
  return {
    origin: entry.origin,
    id: entry.id,
    topicId: entry.topicId ?? null,
    categoryId: entry.categoryId ?? null,
    metrics: roundMetrics(comparison),
    factEquivalence: comparison.factEquivalence ?? [],
    hardFactDifferences: comparison.hardFactDifferences,
  };
}

function findBestMatch(profile, comparisonEntries) {
  let best = null;
  let bestExclusion = null;
  for (const entry of comparisonEntries) {
    const leftLength = profile.combined.compact.length;
    const rightLength = entry.profile.combined.compact.length;
    const ratio = Math.max(leftLength, rightLength)
      ? Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength)
      : 1;
    if (ratio < 0.35 && profile.exactSignature !== entry.profile.exactSignature) continue;
    const comparison = compareProfiles(profile, entry.profile);
    if (!best || comparison.overall > best.comparison.overall) best = { entry, comparison };
    if (comparison.exact || comparison.highConfidence) {
      if (
        !bestExclusion ||
        Number(comparison.exact) > Number(bestExclusion.comparison.exact) ||
        (comparison.exact === bestExclusion.comparison.exact &&
          comparison.overall > bestExclusion.comparison.overall)
      ) {
        bestExclusion = { entry, comparison };
      }
    }
  }
  return { best, bestExclusion };
}

function checkpointProfileRecord(candidate, profile, audioMetadata) {
  const classification =
    candidate.kind === 'listening'
      ? classifyListening(candidate, audioMetadata?.durationSeconds ?? 0)
      : candidate.kind === 'radiotelephony'
        ? classifyRadiotelephony(candidate)
        : { targetCategoryId: 'story-category-1', targetTopicId: 'story-flight-basic' };
  return {
    kind: candidate.kind,
    sourceZone: candidate.sourceZone,
    sourceId: candidate.sourceId,
    sourceContainerId: candidate.sourceContainerId,
    sourceJsonPath: candidate.sourceJsonPath,
    sourceAudioPath: candidate.sourceAudioPath,
    sourceAudioSha256: audioMetadata?.sha256 ?? null,
    sourceAudioBytes: audioMetadata?.bytes ?? null,
    sourceAudioFormat: audioMetadata?.detectedFormat ?? null,
    sourceDurationSeconds: audioMetadata?.durationSeconds ?? null,
    invalidReason: validateCandidate(candidate),
    classification,
    profile: serializableProfile(profile),
  };
}

function auditSummaryMarkdown(summary) {
  const lines = [
    '# Web 三类题库全量候选审计报告',
    '',
    `生成时间：${summary.generatedAt}`,
    '',
    `冻结根 checksum：\`${summary.snapshotRootChecksum}\``,
    '',
    `规则版本：\`${summary.ruleVersion}\``,
    '',
    '## 结论',
    '',
    `- 总候选：${summary.total}`,
    `- 明确迁移：${summary.decisions['migrate-unique'] ?? 0}`,
    `- 保守迁移并最终人工审核：${summary.decisions['borderline-kept'] ?? 0}`,
    `- 完全重复排除：${summary.decisions['exclude-exact'] ?? 0}`,
    `- 高置信重复排除：${summary.decisions['exclude-high-confidence'] ?? 0}`,
    `- 无效排除：${summary.decisions['exclude-invalid'] ?? 0}`,
    '',
    '## 分题型',
    '',
    '| 题型 | 总数 | 迁移 | borderline-kept | 排除 |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    const item = summary.byKind[kind];
    lines.push(`| ${kind} | ${item.total} | ${item.unique} | ${item.borderline} | ${item.excluded} |`);
  }
  lines.push(
    '',
    '所有排除项均直接匹配现有 App 题或本轮最终保留代表题；关键事实不同的高相似候选不会自动排除。',
    '',
  );
  return lines.join('\n');
}

async function audit() {
  const frozenManifest = await readJson(path.join(WORKSTREAM, 'snapshots/web-source-manifest.json'));
  const savedAppBaseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  const currentAppBaseline = await createAppBaseline({ write: false });
  invariant(
    savedAppBaseline.rootChecksum === currentAppBaseline.rootChecksum,
    `App 基线已漂移：${savedAppBaseline.rootChecksum} != ${currentAppBaseline.rootChecksum}`,
  );
  const snapshotFiles = await collectInputFiles(SNAPSHOT_ROOT);
  const snapshotManifest = await createFileManifest(SNAPSHOT_ROOT, snapshotFiles);
  invariant(
    frozenManifest.rootChecksum === snapshotManifest.rootChecksum,
    '冻结快照在审计前发生 checksum 漂移。',
  );

  const candidates = await loadFrozenCandidates();
  const audioMetadataIndex = await buildAudioMetadataIndex();
  const checkpointsRoot = path.join(GENERATED, 'checkpoints/audit');
  await ensureDir(checkpointsRoot);
  const profileRecords = [];

  for (let start = 0, batchNumber = 1; start < candidates.length; start += BATCH_SIZE, batchNumber += 1) {
    const end = Math.min(candidates.length, start + BATCH_SIZE);
    const checkpointPath = path.join(checkpointsRoot, `batch-${String(batchNumber).padStart(2, '0')}.json`);
    let checkpoint;
    if (await exists(checkpointPath)) {
      checkpoint = await readJson(checkpointPath);
      if (
        checkpoint.ruleVersion !== AUDIT_RULE_VERSION ||
        checkpoint.snapshotRootChecksum !== frozenManifest.rootChecksum ||
        checkpoint.startOrdinal !== start + 1 ||
        checkpoint.endOrdinal !== end
      ) {
        checkpoint = null;
      }
    }
    if (!checkpoint) {
      const records = [];
      for (let index = start; index < end; index += 1) {
        const candidate = candidates[index];
        records.push(
          checkpointProfileRecord(
            candidate,
            buildContentProfile(candidate.kind, candidate.source),
            audioMetadataIndex.get(candidate.sourceAudioPath),
          ),
        );
      }
      checkpoint = {
        schemaVersion: 1,
        ruleVersion: AUDIT_RULE_VERSION,
        snapshotRootChecksum: frozenManifest.rootChecksum,
        batchNumber,
        startOrdinal: start + 1,
        endOrdinal: end,
        records,
      };
      checkpoint.checksum = sha256Text(JSON.stringify(checkpoint.records));
      await writeJsonAtomic(checkpointPath, checkpoint);
    }
    profileRecords.push(...checkpoint.records);
    await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
      schemaVersion: 1,
      stage: 'audit-profiles',
      ruleVersion: AUDIT_RULE_VERSION,
      sourceRootChecksum: frozenManifest.rootChecksum,
      completed: end,
      total: candidates.length,
      lastCheckpoint: path.relative(ROOT, checkpointPath),
      lastCheckpointChecksum: checkpoint.checksum,
      updatedAt: new Date().toISOString(),
    });
    console.log(`audit profile checkpoint ${end}/${candidates.length}`);
  }

  invariant(profileRecords.length === candidates.length, '审计检查点记录数量不完整。');
  console.log('audit: running cross-batch and App-global deduplication');
  const appEntriesByKind = {
    listening: await loadAppEntries('listening'),
    radiotelephony: await loadAppEntries('radiotelephony'),
    storytelling: await loadAppEntries('storytelling'),
  };
  const representatives = { listening: [], radiotelephony: [], storytelling: [] };
  const decisions = [];

  for (let index = 0; index < profileRecords.length; index += 1) {
    const record = profileRecords[index];
    const profile = hydrateProfile(record.profile);
    let decision;
    let reasonCode;
    let closestMatch = null;
    const reviewFlags = [];

    if (record.invalidReason) {
      decision = 'exclude-invalid';
      reasonCode = record.invalidReason;
    } else if (record.classification?.error) {
      decision = 'exclude-invalid';
      reasonCode = record.classification.error;
    } else {
      const comparisons = [...appEntriesByKind[record.kind], ...representatives[record.kind]];
      const { best, bestExclusion } = findBestMatch(profile, comparisons);
      if (best) closestMatch = makeMatchReference(best.entry, best.comparison);
      if (bestExclusion) {
        decision = bestExclusion.comparison.exact ? 'exclude-exact' : 'exclude-high-confidence';
        reasonCode = bestExclusion.entry.origin === 'app' ? 'direct-app-match' : 'direct-web-representative-match';
        closestMatch = makeMatchReference(bestExclusion.entry, bestExclusion.comparison);
      } else if (best?.comparison.borderline) {
        decision = 'borderline-kept';
        reasonCode = best.comparison.factsEqual ? 'similarity-borderline' : 'critical-fact-protected';
        reviewFlags.push('borderline-kept');
      } else {
        decision = 'migrate-unique';
        reasonCode = 'no-strict-duplicate';
      }
    }

    if (record.classification?.durationBorderline) reviewFlags.push('duration-borderline');
    if (record.classification?.confidence === 'borderline') reviewFlags.push('classification-borderline');
    const decisionRecord = {
      ordinal: index + 1,
      kind: record.kind,
      sourceZone: record.sourceZone,
      sourceId: record.sourceId,
      sourceContainerId: record.sourceContainerId,
      sourceJsonPath: record.sourceJsonPath,
      sourceAudioPath: record.sourceAudioPath,
      sourceAudioSha256: record.sourceAudioSha256,
      sourceAudioBytes: record.sourceAudioBytes,
      sourceAudioFormat: record.sourceAudioFormat,
      sourceDurationSeconds: record.sourceDurationSeconds,
      snapshotRootChecksum: frozenManifest.rootChecksum,
      decision,
      reasonCode,
      classification: record.classification,
      closestMatch,
      hardFacts: profile.hardFacts,
      reviewFlags: [...new Set(reviewFlags)],
      target: null,
    };
    decisions.push(decisionRecord);

    if (decision === 'migrate-unique' || decision === 'borderline-kept') {
      representatives[record.kind].push({
        origin: 'web',
        id: record.sourceId,
        topicId: null,
        categoryId: null,
        profile,
      });
    }

    if ((index + 1) % BATCH_SIZE === 0 || index + 1 === profileRecords.length) {
      const checkpointPath = path.join(
        GENERATED,
        'checkpoints/decisions',
        `through-${String(index + 1).padStart(4, '0')}.json`,
      );
      await writeJsonAtomic(checkpointPath, {
        schemaVersion: 1,
        ruleVersion: AUDIT_RULE_VERSION,
        snapshotRootChecksum: frozenManifest.rootChecksum,
        completed: index + 1,
        total: profileRecords.length,
        representativeCounts: Object.fromEntries(
          Object.entries(representatives).map(([kind, values]) => [kind, values.length]),
        ),
        decisions: decisions.slice(Math.max(0, decisions.length - BATCH_SIZE)),
      });
      await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
        schemaVersion: 1,
        stage: 'audit-global-dedupe',
        ruleVersion: AUDIT_RULE_VERSION,
        sourceRootChecksum: frozenManifest.rootChecksum,
        completed: index + 1,
        total: profileRecords.length,
        lastCheckpoint: path.relative(ROOT, checkpointPath),
        updatedAt: new Date().toISOString(),
      });
      console.log(`audit global dedupe checkpoint ${index + 1}/${profileRecords.length}`);
    }
  }

  const decisionCounts = {};
  const byKind = {};
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    const kindItems = decisions.filter((item) => item.kind === kind);
    byKind[kind] = {
      total: kindItems.length,
      unique: kindItems.filter((item) => item.decision === 'migrate-unique').length,
      borderline: kindItems.filter((item) => item.decision === 'borderline-kept').length,
      excluded: kindItems.filter((item) => item.decision.startsWith('exclude-')).length,
    };
  }
  for (const item of decisions) decisionCounts[item.decision] = (decisionCounts[item.decision] ?? 0) + 1;
  invariant(decisions.length === 2288, `最终决定数量应为 2288，实际 ${decisions.length}`);
  invariant(decisions.every((item) => item.decision !== 'pending'), '存在未处理决定。');

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ruleVersion: AUDIT_RULE_VERSION,
    snapshotRootChecksum: frozenManifest.rootChecksum,
    appBaselineRootChecksum: savedAppBaseline.rootChecksum,
    total: decisions.length,
    decisions: decisionCounts,
    byKind,
    checkpoints: Math.ceil(decisions.length / BATCH_SIZE),
  };
  summary.decisionsChecksum = sha256Text(JSON.stringify(decisions));
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/candidate-decisions.json'), {
    ...summary,
    records: decisions,
  });
  await fsp.writeFile(
    path.join(WORKSTREAM, 'reports/audit-summary.md'),
    `${auditSummaryMarkdown(summary)}\n`,
    'utf8',
  );
  await writeJsonAtomic(path.join(WORKSTREAM, 'reports/audit-summary.json'), summary);
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'audit-complete',
    ...summary,
    updatedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({ status: 'audit-complete', ...summary }, null, 2));
}

async function verifyAudit() {
  const payload = await readJson(path.join(WORKSTREAM, 'decisions/candidate-decisions.json'));
  invariant(payload.records.length === 2288, '候选决定不是 2288 条。');
  invariant(payload.records.every((item) => item.decision !== 'pending'), '候选决定中仍有 pending。');
  invariant(
    payload.decisionsChecksum === sha256Text(JSON.stringify(payload.records)),
    '候选决定 checksum 不一致。',
  );
  const valid = new Set([
    'migrate-unique',
    'borderline-kept',
    'exclude-exact',
    'exclude-high-confidence',
    'exclude-invalid',
  ]);
  invariant(payload.records.every((item) => valid.has(item.decision)), '候选决定包含未知状态。');
  console.log(
    JSON.stringify(
      { status: 'audit-verified', total: payload.records.length, decisions: payload.decisions },
      null,
      2,
    ),
  );
}

const PREPARE_RULE_VERSION = 'web-question-bank-prepare-v1.7.0';
const TRANSLATION_BATCH_SIZES = {
  listening: 40,
  radiotelephony: 32,
  storytelling: 10,
};
const CALLSIGN_ALIASES = [
  ...AIRLINE_ALIASES,
  ['delta', 'dal'],
  ['eastern', 'eal'],
  ['klm', 'klm'],
];
const ICAO_WORD_PATTERN = [...ICAO_WORDS.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

function removeCjk(value) {
  const lines = String(value ?? '')
    .split(/\r?\n/)
    .map((rawLine) => {
      // Remove inline Chinese glosses first so English following a gloss is not
      // mistaken for part of the duplicated Chinese translation.
      let line = rawLine.replace(
        /[\p{Script=Han}]*\s*[（(][^（）()\n]*\p{Script=Han}[^（）()\n]*[）)]/gu,
        ' ',
      );
      const firstHan = line.search(/\p{Script=Han}/u);
      const containedHan = firstHan >= 0;
      if (firstHan >= 0) {
        line = line.slice(0, firstHan).trimEnd();
        // Some Chinese suffixes begin with a repeated number, such as
        // "...? 270-330度...". Keep the complete English sentence only.
        line = line.replace(/([.!?])\s*[^A-Za-z]*$/, '$1');
      }
      // A Chinese line may begin with an acronym such as "RJ被...". Such a
      // fragment is not an English source sentence and must be dropped.
      if (containedHan && /^[A-Z0-9./-]+$/.test(line.trim())) return '';
      return line;
    })
    .filter((line) => line.trim())
    .join('\n');
  return lines
    .replace(/[\p{Script=Han}]+/gu, ' ')
    .replace(/[，。；：！？【】《》]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')');
}

function displayNumberRuns(value) {
  let text = value.replace(
    /\b((?:\d\s*)+)\s*(?:decimal|point)\s*((?:\d\s*)+)\b/gi,
    (_match, integer, decimals) =>
      `${integer.replace(/\s+/g, '')}.${decimals.replace(/\s+/g, '')}`,
  );
  text = text.replace(NUMBER_RUN, (run) => {
    const words = run.toLowerCase().split(/[\s-]+/).filter(Boolean);
    const shouldConvert =
      words.length > 1 ||
      words.some((word) => ['hundred', 'thousand', 'decimal', 'point'].includes(word)) ||
      words.some((word) => SMALL_NUMBER_WORDS.has(word));
    return shouldConvert ? parseNumberWords(run) : run;
  });
  text = text.replace(/\b(?:\d\s+){1,}\d\b/g, (run) => run.replace(/\s+/g, ''));
  return text;
}

function formatCallsigns(value, { allAliases = false } = {}) {
  let text = value;
  for (const [alias, rawCode] of CALLSIGN_ALIASES) {
    const code = rawCode.toUpperCase();
    const digitWords = `(?:${NUMBER_WORD_PATTERN})`;
    const numberExpression = `((?:\\d(?:[\\s,]*\\d)*)|(?:${digitWords})(?:[\\s-]+${digitWords})*)`;
    text = text.replace(
      new RegExp(`\\b${escapeRegExp(alias)}\\s*${numberExpression}\\b`, 'gi'),
      (_match, numberRun) => {
        const number = /[a-z]/i.test(numberRun)
          ? parseNumberWords(numberRun)
          : numberRun.replace(/[\s,]+/g, '');
        return `${code} ${number}`;
      },
    );
    if (allAliases) {
      text = text.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), code);
    }
  }
  text = text.replace(
    /\b(QFA|SIA|AFR|BAW|UAL|KLM|JAL|ACA|CCA|CSN|CES|HDA|NWA|DAL|DLH|KAL|DAN|KRU|HGB|GFA|EAL|TWA)\s*(\d+)\b/gi,
    (_match, code, number) => `${code.toUpperCase()} ${number}`,
  );
  return text;
}

function formatIcaoWords(value, { aggressive = false } = {}) {
  let text = value;
  const pattern = new RegExp(`\\b((?:${ICAO_WORD_PATTERN})(?:\\s+(?:${ICAO_WORD_PATTERN}))*)(?:\\s+(\\d+))?\\b`, 'gi');
  text = text.replace(pattern, (match, wordRun, digits, offset, whole) => {
    const words = wordRun.toLowerCase().split(/\s+/);
    const prefix = whole.slice(Math.max(0, offset - 30), offset).toLowerCase();
    const contextual = /(?:information|taxiway|waypoint|way-point|via|point|vor|route|intersection)\s+$/.test(prefix);
    if (!aggressive && words.length === 1 && !digits && !contextual) return match;
    const letters = words.map((word) => ICAO_WORDS.get(word)).join('').toUpperCase();
    return `${letters}${digits ?? ''}`;
  });
  text = text
    .replace(/\b(\d+)\s+([A-Z])\b/g, '$1$2')
    .replace(/\b([A-Z]{1,8})\s+(\d+)\s*([A-Z])\b/g, '$1$2$3')
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (run) => run.replace(/\s+/g, ''));
  return text;
}

function normalizeEnglishPunctuation(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[；]/g, ';')
    .replace(/[：]/g, ':')
    .replace(/[！]/g, '!')
    .replace(/[？]/g, '?')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+([,;:.!?])/g, '$1')
    .replace(/,(?!\s|\n|$|\d)/g, ', ')
    .replace(/([;:!?])(?!\s|\n|$)/g, '$1 ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatRunwayAndProcedures(value) {
  let text = value.replace(/\brunway\b/gi, 'runway');
  text = text.replace(
    /\brunway\s*(\d(?:\s*\d)?)\s*(left|right|center|centre|[lrc])?\b/gi,
    (_match, numberRun, suffix) => {
      const suffixMap = { left: 'L', right: 'R', center: 'C', centre: 'C' };
      const normalizedSuffix = suffix ? (suffixMap[suffix.toLowerCase()] ?? suffix.toUpperCase()) : '';
      return `Runway ${numberRun.replace(/\s+/g, '')}${normalizedSuffix}`;
    },
  );
  text = text.replace(/\bflight level\s+(\d+)\b/gi, 'FL$1');
  text = text.replace(
    /\b([A-Z]{1,8})\s*(\d+[A-Z]?)\s+(arrival|departure)\b/gi,
    (_match, code, number, direction) => `${code.toUpperCase()}-${number.toUpperCase()} ${direction.toLowerCase()}`,
  );
  return text;
}

function standardizeAviationEnglish(value, kind) {
  let text = String(value ?? '').normalize('NFKC');
  text = text
    .replace(/\(\s*\d+\s*words?\s*\)/gi, ' ')
    .replace(/\[\s*\d+\s*words?\s*\]/gi, ' ');
  if (kind !== 'storytelling') text = removeCjk(text);
  if (kind === 'storytelling') {
    return normalizeEnglishPunctuation(
      formatRunwayAndProcedures(
        text
          .replace(/^\s*story\s*\d+\s*[:.-]?\s*/i, '')
          .replace(/\s*\n\s*/g, ' '),
      ),
    );
  }

  text = text.replace(/\bdecinal\b/gi, 'decimal');
  text = formatCallsigns(text, { allAliases: kind === 'radiotelephony' });
  text = displayNumberRuns(text);
  text = formatIcaoWords(text, { aggressive: kind === 'radiotelephony' });
  text = formatRunwayAndProcedures(text);
  text = text.replace(
    /(^|\n)\s*(b|c|p|ctl|app|gnd|twr)\s*[:：]\s*/gi,
    (_match, prefix, label) => `${prefix}${label.toUpperCase()}: `,
  );
  return normalizeEnglishPunctuation(text);
}

function prepareListeningCard(source, id, taskTitle, audioPath) {
  const split = splitListeningText(source.audioText);
  invariant(split.question, `听力迁移候选没有问题文本：${id}`);
  const body = standardizeAviationEnglish(
    split.body.replace(/^\s*\d+\s*[.)]\s*(?:\r?\n|\s)/, ''),
    'listening',
  );
  const question = standardizeAviationEnglish(split.question, 'listening')
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .trim();
  const choices = source.choices.map((choice) => standardizeAviationEnglish(choice, 'listening'));
  const letter = String.fromCharCode(65 + source.correctChoiceIndex);
  return {
    id,
    taskTitle,
    audioText: `${body}\nQuestion: ${question}`,
    audioTextZh: null,
    referenceText: `正确答案：${letter}. ${choices[source.correctChoiceIndex]}`,
    audio: audioPath,
    choices,
    correctChoiceIndex: source.correctChoiceIndex,
  };
}

function prepareRadiotelephonyCard(source, id, taskTitle, audioPath) {
  return {
    id,
    taskTitle,
    audioText: standardizeAviationEnglish(source.audioText, 'radiotelephony'),
    audioTextZh: null,
    referenceText: standardizeAviationEnglish(source.referenceText, 'radiotelephony'),
    referenceTextZh: null,
    audio: audioPath,
  };
}

function prepareStoryCard(source, id, taskTitle, audioPath) {
  return {
    id,
    taskTitle,
    audioText: standardizeAviationEnglish(source.audioText, 'storytelling'),
    audioTextZh: null,
    audio: audioPath,
  };
}

function extractChineseHints(value) {
  return (String(value ?? '').match(/[\p{Script=Han}][\p{Script=Han}，。；：！？、\s]*/gu) ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeSourceId(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function runProcess(command, args, { env = process.env } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 失败（${code}）：${stderr.slice(-2000)}`));
    });
  });
}

async function prepareAudio(record, target) {
  const sourcePath = path.join(SNAPSHOT_ROOT, record.sourceAudioPath);
  const destinationPath = path.join(GENERATED, 'prepared/resources/files', target.sourceRelativePath);
  await ensureDir(path.dirname(destinationPath));
  const tempPath = `${destinationPath}.tmp-${process.pid}.mp3`;
  if (await exists(destinationPath)) {
    const checksum = await sha256File(destinationPath);
    const stat = await fsp.stat(destinationPath);
    return { localPath: destinationPath, checksum, sizeBytes: stat.size };
  }
  if (record.sourceAudioFormat === 'mp3') {
    await fsp.copyFile(sourcePath, tempPath);
  } else {
    await runProcess('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-map_metadata',
      '-1',
      '-vn',
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      tempPath,
    ]);
  }
  await fsp.rename(tempPath, destinationPath);
  const checksum = await sha256File(destinationPath);
  const stat = await fsp.stat(destinationPath);
  return { localPath: destinationPath, checksum, sizeBytes: stat.size };
}

async function currentTopicIndex() {
  const index = new Map();
  for (const bankId of ['listening', 'radiotelephony', 'storytelling']) {
    for (const topic of await loadTopicFiles(bankId)) {
      index.set(topic.data.id, { bankId, filePath: topic.filePath, data: topic.data });
    }
  }
  return index;
}

function maxNumericMatch(values, pattern) {
  let maximum = 0;
  for (const value of values) {
    const match = String(value).match(pattern);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum;
}

async function createTargetPlan(decisionPayload, candidateMap) {
  const topicIndex = await currentTopicIndex();
  const resourceManifest = await readJson(APP_RESOURCE_MANIFEST);
  const currentCards = [];
  for (const topic of topicIndex.values()) currentCards.push(...topic.data.cards);
  let nextListeningNumber =
    maxNumericMatch(currentCards.map((card) => card.id), /^listening-main-(\d+)$/) + 1;
  const rtCardMaximum = Math.max(
    maxNumericMatch(currentCards.map((card) => card.id), /card-main-(\d+)$/),
    maxNumericMatch(
      resourceManifest.files
        .filter((item) => item.bankId === 'radiotelephony')
        .map((item) => item.publicPath),
      /\/main\/(\d+)\.mp3$/,
    ),
  );
  let nextRtCardNumber = rtCardMaximum + 1;
  let nextRtScenarioNumber =
    maxNumericMatch([...topicIndex.keys()], /^atc-scenario-(\d+)$/) + 1;
  const listeningTitlePrefixes = {
    'listening-topic-01': '10s航空英语',
    'listening-topic-02': '20s陆空通话',
    'listening-topic-03': '20s航空英语',
    'listening-topic-04': '10s陆空通话',
  };
  const titleCounters = Object.fromEntries(
    Object.keys(listeningTitlePrefixes).map((topicId) => [topicId, topicIndex.get(topicId).data.cards.length]),
  );
  let storyTitleCounter = topicIndex.get('story-flight-basic').data.cards.length;

  const migrateRecords = decisionPayload.records.filter((record) =>
    ['migrate-unique', 'borderline-kept'].includes(record.decision),
  );
  const rtGroups = new Map();
  for (const record of decisionPayload.records.filter((item) => item.kind === 'radiotelephony')) {
    if (!rtGroups.has(record.sourceContainerId)) rtGroups.set(record.sourceContainerId, []);
    rtGroups.get(record.sourceContainerId).push(record);
  }
  const rtScenarioPlans = new Map();
  for (const [sourceContainerId, records] of [...rtGroups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const kept = records.filter((record) => ['migrate-unique', 'borderline-kept'].includes(record.decision));
    if (!kept.length) continue;
    const categoryId = kept[0].classification.targetCategoryId;
    const votes = new Map();
    for (const record of records) {
      const match = record.closestMatch;
      if (
        match?.origin === 'app' &&
        match.topicId &&
        topicIndex.get(match.topicId)?.data.categoryId === categoryId &&
        match.metrics.overall >= 0.7
      ) {
        votes.set(match.topicId, (votes.get(match.topicId) ?? 0) + 1);
      }
    }
    const sortedVotes = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'));
    const top = sortedVotes[0] ?? null;
    const totalVotes = sortedVotes.reduce((sum, [, count]) => sum + count, 0);
    const extendExisting = Boolean(top && top[1] >= 2 && top[1] / Math.max(1, totalVotes) >= 0.6);
    const firstCandidate = candidateMap.get(kept[0].sourceId);
    const callsign = classifyRadiotelephony(firstCandidate);
    let topicId;
    let topicMode;
    let topicName;
    if (extendExisting) {
      topicId = top[0];
      topicMode = 'extend-existing';
      topicName = topicIndex.get(topicId).data.name;
    } else {
      topicId = `atc-scenario-${String(nextRtScenarioNumber).padStart(4, '0')}`;
      nextRtScenarioNumber += 1;
      topicMode = 'create-new';
      topicName = callsign.display;
    }
    rtScenarioPlans.set(sourceContainerId, {
      sourceContainerId,
      categoryId,
      callsign,
      topicId,
      topicMode,
      topicName,
      votes: Object.fromEntries(sortedVotes),
      migratedCards: kept.length,
    });
  }

  const targetRecords = [];
  const rtTopicCounters = new Map();
  for (const [topicId, topic] of topicIndex) {
    if (topic.bankId === 'radiotelephony') rtTopicCounters.set(topicId, topic.data.cards.length);
  }

  for (const record of migrateRecords) {
    const candidate = candidateMap.get(record.sourceId);
    invariant(candidate, `找不到冻结候选：${record.sourceId}`);
    const safeId = safeSourceId(record.sourceId);
    const audioRelative = `audio/${record.kind}/web-v5/${safeId}.mp3`;
    const audioPublicPath = `/question-bank-assets/${audioRelative}`;
    const resourceTarget = {
      objectKey: `v5/${audioRelative}`,
      bankId: record.kind,
      sourceRelativePath: audioRelative,
      publicPath: audioPublicPath,
      mimeType: 'audio/mpeg',
      status: 'ready',
    };
    let target;
    let card;
    if (record.kind === 'listening') {
      const topicId = record.classification.targetTopicId;
      const cardNumber = nextListeningNumber;
      nextListeningNumber += 1;
      titleCounters[topicId] += 1;
      const id = `listening-main-${String(cardNumber).padStart(3, '0')}`;
      const taskTitle = `${listeningTitlePrefixes[topicId]}-${titleCounters[topicId]}`;
      target = {
        bankId: 'listening',
        categoryId: topicIndex.get(topicId).data.categoryId,
        topicId,
        topicMode: 'existing',
        topicFile: path.relative(ROOT, topicIndex.get(topicId).filePath).split(path.sep).join('/'),
        cardId: id,
        taskTitle,
      };
      card = prepareListeningCard(candidate.source, id, taskTitle, audioPublicPath);
    } else if (record.kind === 'radiotelephony') {
      const scenarioPlan = rtScenarioPlans.get(record.sourceContainerId);
      invariant(scenarioPlan, `缺少陆空通话场景计划：${record.sourceContainerId}`);
      const cardNumber = nextRtCardNumber;
      nextRtCardNumber += 1;
      const currentCount = rtTopicCounters.get(scenarioPlan.topicId) ?? 0;
      const nextCount = currentCount + 1;
      rtTopicCounters.set(scenarioPlan.topicId, nextCount);
      const id = `${scenarioPlan.topicId}-card-main-${String(cardNumber).padStart(4, '0')}`;
      const taskTitle = `${scenarioPlan.callsign.display}-${nextCount}`;
      target = {
        bankId: 'radiotelephony',
        categoryId: scenarioPlan.categoryId,
        topicId: scenarioPlan.topicId,
        topicMode: scenarioPlan.topicMode,
        topicName: scenarioPlan.topicName,
        topicFile:
          scenarioPlan.topicMode === 'create-new'
            ? `content/question-banks/banks/radiotelephony/topics/${scenarioPlan.topicId}.json`
            : path.relative(ROOT, topicIndex.get(scenarioPlan.topicId).filePath).split(path.sep).join('/'),
        cardId: id,
        taskTitle,
      };
      card = prepareRadiotelephonyCard(candidate.source, id, taskTitle, audioPublicPath);
    } else {
      storyTitleCounter += 1;
      const sourceNumber = record.sourceId.match(/(\d+)$/)?.[1] ?? String(storyTitleCounter);
      const id = `story-pepec-${sourceNumber.padStart(4, '0')}`;
      const taskTitle = `飞行ICAO-基础题库-${storyTitleCounter}`;
      target = {
        bankId: 'storytelling',
        categoryId: 'story-category-1',
        topicId: 'story-flight-basic',
        topicMode: 'existing',
        topicFile: path
          .relative(ROOT, topicIndex.get('story-flight-basic').filePath)
          .split(path.sep)
          .join('/'),
        cardId: id,
        taskTitle,
      };
      card = prepareStoryCard(candidate.source, id, taskTitle, audioPublicPath);
    }
    targetRecords.push({
      ...record,
      sourceRaw: {
        audioText: candidate.source.audioText,
        referenceText: candidate.source.referenceText ?? null,
        choices: candidate.source.choices ?? null,
        correctChoiceIndex: candidate.source.correctChoiceIndex ?? null,
      },
      target: {
        ...target,
        audioPublicPath,
        audioObjectKey: resourceTarget.objectKey,
        audioSourceRelativePath: resourceTarget.sourceRelativePath,
        preparedCardChecksum: null,
        needsFinalReview: record.reviewFlags.length > 0 || record.decision === 'borderline-kept',
      },
      resource: resourceTarget,
      card,
      translationStatus: 'pending',
    });
  }
  return { targetRecords, rtScenarioPlans: [...rtScenarioPlans.values()] };
}

async function writeTranslationTasks(targetRecords) {
  const taskRoot = path.join(GENERATED, 'translation-tasks');
  const resultRoot = path.join(GENERATED, 'translation-results');
  await fsp.rm(taskRoot, { recursive: true, force: true });
  await ensureDir(taskRoot);
  await ensureDir(resultRoot);
  const manifest = [];
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    const items = targetRecords.filter((record) => record.kind === kind);
    const batchSize = TRANSLATION_BATCH_SIZES[kind];
    for (let start = 0, batchNumber = 1; start < items.length; start += batchSize, batchNumber += 1) {
      const batchItems = items.slice(start, start + batchSize).map((record) => ({
        sourceId: record.sourceId,
        appNewId: record.target.cardId,
        taskTitle: record.target.taskTitle,
        audioText: record.card.audioText,
        referenceText: record.card.referenceText ?? null,
        existingChineseHints: extractChineseHints(record.sourceRaw.audioText),
        requiredOutputFields:
          kind === 'radiotelephony'
            ? ['audioTextZh', 'referenceTextZh']
            : ['audioTextZh'],
      }));
      const batchId = `${kind}-${String(batchNumber).padStart(2, '0')}`;
      const taskPath = path.join(taskRoot, `${batchId}.json`);
      const resultPath = path.join(resultRoot, `${batchId}.json`);
      await writeJsonAtomic(taskPath, {
        schemaVersion: 1,
        batchId,
        kind,
        rules: {
          noAsr: true,
          preserveAllFacts: true,
          preserveCodesDigitsRunwaysUnits: true,
          callsignFormat: '三字代码 + 一个半角空格 + 原数字',
          questionFormat: '问题：单独一行',
          translateInAviationContext: true,
          noSemanticRewrite: true,
        },
        items: batchItems,
      });
      manifest.push({
        batchId,
        kind,
        items: batchItems.length,
        taskPath: path.relative(ROOT, taskPath),
        resultPath: path.relative(ROOT, resultPath),
        status: (await exists(resultPath)) ? 'result-present' : 'pending',
      });
    }
  }
  await writeJsonAtomic(path.join(GENERATED, 'translation-task-manifest.json'), {
    schemaVersion: 1,
    prepareRuleVersion: PREPARE_RULE_VERSION,
    totalItems: targetRecords.length,
    batches: manifest.length,
    itemsByKind: Object.fromEntries(
      ['listening', 'radiotelephony', 'storytelling'].map((kind) => [
        kind,
        targetRecords.filter((record) => record.kind === kind).length,
      ]),
    ),
    records: manifest,
  });
  return manifest;
}

async function prepare() {
  const decisionPayload = await readJson(path.join(WORKSTREAM, 'decisions/candidate-decisions.json'));
  invariant(decisionPayload.ruleVersion === AUDIT_RULE_VERSION, '候选审计规则版本不是当前冻结版本。');
  invariant(
    decisionPayload.decisionsChecksum === sha256Text(JSON.stringify(decisionPayload.records)),
    '候选决定 checksum 不一致。',
  );
  const savedAppBaseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  const currentAppBaseline = await createAppBaseline({ write: false });
  invariant(savedAppBaseline.rootChecksum === currentAppBaseline.rootChecksum, '准备前 App 基线已漂移。');
  const candidates = await loadFrozenCandidates();
  const candidateMap = new Map(candidates.map((candidate) => [candidate.sourceId, candidate]));
  const { targetRecords, rtScenarioPlans } = await createTargetPlan(decisionPayload, candidateMap);
  const expectedMigrationCount = decisionPayload.records.filter((record) =>
    ['migrate-unique', 'borderline-kept'].includes(record.decision),
  ).length;
  invariant(
    targetRecords.length === expectedMigrationCount,
    `迁移候选应为 ${expectedMigrationCount}，实际 ${targetRecords.length}`,
  );
  invariant(new Set(targetRecords.map((record) => record.target.cardId)).size === targetRecords.length, '新卡片 ID 冲突。');
  invariant(
    new Set(targetRecords.map((record) => record.target.audioPublicPath)).size === targetRecords.length,
    '新音频 publicPath 冲突。',
  );

  for (let start = 0, batchNumber = 1; start < targetRecords.length; start += BATCH_SIZE, batchNumber += 1) {
    const end = Math.min(targetRecords.length, start + BATCH_SIZE);
    for (let index = start; index < end; index += 1) {
      const record = targetRecords[index];
      const preparedAudio = await prepareAudio(record, record.resource);
      record.resource.sizeBytes = preparedAudio.sizeBytes;
      record.resource.checksum = preparedAudio.checksum;
      record.resource.localPreparedPath = path.relative(ROOT, preparedAudio.localPath).split(path.sep).join('/');
      record.target.preparedCardChecksum = sha256Text(JSON.stringify(record.card));
    }
    const checkpointPath = path.join(
      GENERATED,
      'checkpoints/prepare',
      `batch-${String(batchNumber).padStart(2, '0')}.json`,
    );
    await writeJsonAtomic(checkpointPath, {
      schemaVersion: 1,
      ruleVersion: PREPARE_RULE_VERSION,
      decisionChecksum: decisionPayload.decisionsChecksum,
      startOrdinal: start + 1,
      endOrdinal: end,
      records: targetRecords.slice(start, end),
    });
    await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
      schemaVersion: 1,
      stage: 'prepare-candidates',
      prepareRuleVersion: PREPARE_RULE_VERSION,
      decisionChecksum: decisionPayload.decisionsChecksum,
      completed: end,
      total: targetRecords.length,
      lastCheckpoint: path.relative(ROOT, checkpointPath),
      updatedAt: new Date().toISOString(),
    });
    console.log(`prepare checkpoint ${end}/${targetRecords.length}`);
  }

  const translationTasks = await writeTranslationTasks(targetRecords);
  const preparedPayload = {
    schemaVersion: 1,
    prepareRuleVersion: PREPARE_RULE_VERSION,
    auditRuleVersion: AUDIT_RULE_VERSION,
    snapshotRootChecksum: decisionPayload.snapshotRootChecksum,
    decisionChecksum: decisionPayload.decisionsChecksum,
    preparedAt: new Date().toISOString(),
    total: targetRecords.length,
    byKind: Object.fromEntries(
      ['listening', 'radiotelephony', 'storytelling'].map((kind) => [
        kind,
        targetRecords.filter((record) => record.kind === kind).length,
      ]),
    ),
    rtScenarioPlans,
    translationBatches: translationTasks.length,
    records: targetRecords,
  };
  preparedPayload.preparedChecksum = sha256Text(JSON.stringify(preparedPayload.records));
  await writeJsonAtomic(path.join(GENERATED, 'prepared-candidates.json'), preparedPayload);
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'), {
    schemaVersion: 1,
    snapshotRootChecksum: preparedPayload.snapshotRootChecksum,
    decisionChecksum: preparedPayload.decisionChecksum,
    preparedChecksum: preparedPayload.preparedChecksum,
    totalCandidates: decisionPayload.records.length,
    migratingCandidates: preparedPayload.total,
    records: decisionPayload.records.map((decision) => {
      const prepared = targetRecords.find((record) => record.sourceId === decision.sourceId);
      return {
        webSourceId: decision.sourceId,
        webContainerId: decision.sourceContainerId,
        kind: decision.kind,
        sourceZone: decision.sourceZone,
        sourceJsonPath: decision.sourceJsonPath,
        sourceAudioPath: decision.sourceAudioPath,
        sourceAudioSha256: decision.sourceAudioSha256,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        closestMatch: decision.closestMatch,
        reviewFlags: decision.reviewFlags,
        snapshotRootChecksum: decision.snapshotRootChecksum,
        appNewId: prepared?.target.cardId ?? null,
        targetDirectory: prepared?.target.topicFile ?? null,
        targetTopicId: prepared?.target.topicId ?? null,
        appAudioPath: prepared?.target.audioPublicPath ?? null,
        audioObjectKey: prepared?.target.audioObjectKey ?? null,
      };
    }),
  });
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'prepare-complete-translation-pending',
    prepareRuleVersion: PREPARE_RULE_VERSION,
    preparedChecksum: preparedPayload.preparedChecksum,
    total: preparedPayload.total,
    translationBatches: preparedPayload.translationBatches,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      {
        status: 'prepare-complete-translation-pending',
        total: preparedPayload.total,
        byKind: preparedPayload.byKind,
        rtScenarioPlans: rtScenarioPlans.length,
        translationBatches: preparedPayload.translationBatches,
        preparedChecksum: preparedPayload.preparedChecksum,
      },
      null,
      2,
    ),
  );
}

async function verifyPrepare() {
  const payload = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  invariant(payload.records.length === payload.total, '准备记录数量不一致。');
  invariant(payload.preparedChecksum === sha256Text(JSON.stringify(payload.records)), '准备记录 checksum 不一致。');
  const ids = new Set();
  const publicPaths = new Set();
  const objectKeys = new Set();
  for (const record of payload.records) {
    invariant(!ids.has(record.target.cardId), `重复卡片 ID：${record.target.cardId}`);
    invariant(!publicPaths.has(record.target.audioPublicPath), `重复 publicPath：${record.target.audioPublicPath}`);
    invariant(!objectKeys.has(record.target.audioObjectKey), `重复 objectKey：${record.target.audioObjectKey}`);
    ids.add(record.target.cardId);
    publicPaths.add(record.target.audioPublicPath);
    objectKeys.add(record.target.audioObjectKey);
    invariant(record.resource.checksum && record.resource.sizeBytes > 0, `音频未准备：${record.sourceId}`);
    const localPath = path.join(ROOT, record.resource.localPreparedPath);
    invariant(await exists(localPath), `准备音频缺失：${localPath}`);
    invariant((await fsp.stat(localPath)).size === record.resource.sizeBytes, `音频大小不一致：${record.sourceId}`);
    invariant((await sha256File(localPath)) === record.resource.checksum, `音频 checksum 不一致：${record.sourceId}`);
    if (record.kind === 'listening') {
      invariant(record.card.choices.length === 4, `听力选项数量错误：${record.sourceId}`);
      invariant(
        record.card.choices.every((choice) => String(choice).trim()),
        `听力选项出现空内容：${record.sourceId}`,
      );
      invariant(/\nQuestion:\s+/.test(record.card.audioText), `听力问题格式错误：${record.sourceId}`);
      const expected = `正确答案：${String.fromCharCode(65 + record.card.correctChoiceIndex)}. ${record.card.choices[record.card.correctChoiceIndex]}`;
      invariant(record.card.referenceText === expected, `听力参考答案错误：${record.sourceId}`);
    }
  }
  console.log(
    JSON.stringify(
      { status: 'prepare-verified', total: payload.total, preparedChecksum: payload.preparedChecksum },
      null,
      2,
    ),
  );
}

const AVIATION_DIGIT_WORDS = new Map([
  ['zero', '0'], ['oh', '0'], ['one', '1'], ['two', '2'], ['three', '3'], ['tree', '3'],
  ['onw', '1'],
  ['four', '4'], ['fower', '4'], ['five', '5'], ['six', '6'], ['seven', '7'],
  ['eight', '8'], ['nine', '9'], ['niner', '9'],
]);

function parseAviationDigitAtoms(value) {
  let normalized = String(value ?? '').toLowerCase();
  for (const [word, digit] of AVIATION_DIGIT_WORDS) {
    normalized = normalized.replace(new RegExp(escapeRegExp(word), 'g'), digit);
  }
  return normalized.replace(/\D/g, '');
}

function stripContextCallsign(value, context) {
  let text = String(value ?? '');
  if (!context?.code || !context?.digits) return { text, found: false };
  let found = false;
  const preserveRemainder = (digits) => {
    if (digits === context.digits) {
      found = true;
      return ' ';
    }
    if (digits.startsWith(context.digits)) {
      found = true;
      return ` ${digits.slice(context.digits.length)} `;
    }
    return null;
  };

  // Handle canonical and glued forms first: UAL 813 and UAL81311600.
  text = text.replace(
    new RegExp(`\\b${escapeRegExp(context.code)}\\s*(\\d+)\\b`, 'gi'),
    (match, digits) => preserveRemainder(digits) ?? match,
  );

  const atomPattern = [...AVIATION_DIGIT_WORDS.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const aliases = CALLSIGN_ALIASES
    .filter(([, code]) => code.toUpperCase() === context.code)
    .map(([alias]) => alias)
    .filter((alias) => alias.toUpperCase() !== context.code);
  for (const alias of aliases) {
    text = text.replace(
      new RegExp(
        `\\b${escapeRegExp(alias)}((?:(?:${atomPattern})|\\d|[\\s-])+)(?=[,.;:]|$)`,
        'gi',
      ),
      (match, atoms) => {
        const parsed = parseAviationDigitAtoms(atoms);
        const normalized = parsed === `${context.digits}${context.digits.at(-1)}`
          ? context.digits
          : parsed;
        return preserveRemainder(normalized) ?? match;
      },
    );
  }
  // A code may also be followed by a mixed form such as "83 one1".
  text = text.replace(
    new RegExp(
      `\\b${escapeRegExp(context.code)}((?:(?:${atomPattern})|\\d|[\\s-])+)(?=[,.;:]|$)`,
      'gi',
    ),
    (match, atoms) => {
      const parsed = parseAviationDigitAtoms(atoms);
      const normalized = parsed === `${context.digits}${context.digits.at(-1)}`
        ? context.digits
        : parsed;
      return preserveRemainder(normalized) ?? match;
    },
  );
  return { text, found };
}

function protectedFactsForTranslation(value) {
  const thousands = new Map([
    ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5'],
    ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'], ['niner', '9'],
  ]);
  const smallEnglishNumbers = new Map([
    ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
    ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
    ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14],
    ['fifteen', 15], ['sixteen', 16], ['seventeen', 17], ['eighteen', 18],
    ['nineteen', 19], ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50],
  ]);
  const text = String(value ?? '')
    // Numbered speaker labels (for example A1:/A2:) identify roles rather than
    // operational numeric facts. Strip the complete label before number checks.
    .replace(/(^|\n)\s*[A-Z]{1,4}\d+\s*[:：]/g, '$1')
    // Ignore obvious OCR substitutions embedded inside a lowercase word, such
    // as "a1titude", without weakening checks for registrations or models.
    .replace(/(?<=[a-z])\d+(?=[a-z])/g, '')
    .replace(/\b(Boeing|Airbus|Aiebus)\s+((?:\d+\s*(?:[-,]\s*)?){2,4})/gi, (_match, make, model) =>
      `${make} ${model.replace(/\D/g, '')}`,
    )
    .replace(/\b(\d{1,2})\s+hours?\s+(?:and\s+)?(\d{1,2})\s+minutes?\b/gi, (_match, hours, minutes) =>
      `${hours}${String(minutes).padStart(2, '0')}`,
    )
    // Normalize malformed but unambiguous mixed word/digit heights found in
    // the Web source, for example "one thousan 200" -> 1200.
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|niner)\s+thousan(?:d)?\s+(\d{1,3})\b/gi,
      (_match, leading, trailing) => `${thousands.get(leading.toLowerCase())}${trailing.padStart(3, '0')}`,
    )
    .replace(
      /\b(\d{1,2})\s+hours?\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:[-\s]+(one|two|three|four|five|six|seven|eight|nine))?\s+minutes?\b/gi,
      (_match, hours, tens, ones) => {
        const minutes = (smallEnglishNumbers.get(tens.toLowerCase()) ?? 0)
          + (ones ? (smallEnglishNumbers.get(ones.toLowerCase()) ?? 0) : 0);
        return `${hours}${String(minutes).padStart(2, '0')}`;
      },
    )
    .replace(/第([零〇一二三四五六七八九十]{1,3})/g, (_match, numeral) =>
      String(parseSimpleChineseInteger(numeral)),
    )
    .replace(/([零〇一二三四五六七八九十])(?=号)/g, (_match, numeral) =>
      String(parseSimpleChineseInteger(numeral)),
    )
    .replace(/(\d{1,2})\s*(?:小时|时)\s*(\d{1,2})\s*分钟/g, '$1$2')
    // Aircraft variants commonly use a hyphen while the source audio spelling
    // uses separated digit groups: 787-8 and "7 87 8" are the same fact.
    .replace(/\b(\d{3})\s*[-–]\s*(\d{1,3})\b/g, '$1$2')
    .replace(/\b(\d+)\s+thou\w*\s+(\d{1,3})\b/gi, (_match, leading, trailing) =>
      `${leading}${trailing.padStart(3, '0')}`,
    )
    .replace(/\bno\.\s*(\d+)/gi, '$1')
    .replace(/\bmach\s*\.\s*(\d+)/gi, 'mach 0.$1')
    .replace(/\bmach\s+(?:decimal|point)\s*(\d+)/gi, 'mach 0.$1')
    .replace(
      /\b(\d{1,3})\s+and\s+(\d{1,2})(?=\s+(?:passengers?|people|souls|persons?)\b)/gi,
      (_match, hundreds, remainder) => String(Number(hundreds) + Number(remainder)),
    )
    .replace(/(^|[^\d])\.(\d+)/g, '$10.$2')
    .replace(/(?<=[A-Za-z])(?=\d)/g, ' ')
    .replace(/(?<=\d)(?=[A-Za-z])/g, ' ')
    .replace(/(?<=\d),(?=\d{3}\b)/g, '')
    .replace(/(?<=\d):\s*(?=\d)/g, '')
    .replace(/\b\d+(?:\s+\d+)+\b/g, (run) => run.replace(/\s+/g, ''));
  const codes = (text.match(
    /\b(?:QFA|SIA|AFR|BAW|UAL|KLM|JAL|ACA|CCA|CSN|CES|HDA|NWA|DAL|DLH|KAL|DAN|KRU|HGB|GFA|EAL|TWA)\b/gi,
  ) ?? []).map((item) => item.toUpperCase());
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  const runways = [];
  for (const match of text.matchAll(
    /\brunway\s*(\d(?:\s*\d)?)(?:\s*(left|right|center|centre)(?=\b|[a-z])|\s*([lrc])\b)?/gi,
  )) {
    const suffixMap = { left: 'L', right: 'R', center: 'C', centre: 'C' };
    const rawSuffix = match[2] ?? match[3] ?? '';
    const suffix = rawSuffix ? (suffixMap[rawSuffix.toLowerCase()] ?? rawSuffix.toUpperCase()) : '';
    runways.push(`${match[1].replace(/\s+/g, '')}${suffix}`);
  }
  for (const match of text.matchAll(/(\d(?:\s*\d)?)\s*([lrc])?\s*(?:号)?跑道/gi)) {
    runways.push(`${match[1].replace(/\s+/g, '')}${(match[2] ?? '').toUpperCase()}`);
  }
  return { codes: codes.sort(), numbers, runways: runways.sort() };
}

function parseSimpleChineseInteger(value) {
  const digits = new Map([
    ['零', 0], ['〇', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4],
    ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9],
  ]);
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (tens ? (digits.get(tens) ?? 0) : 1) * 10 + (ones ? (digits.get(ones) ?? 0) : 0);
  }
  return [...value].reduce((number, character) => number * 10 + (digits.get(character) ?? 0), 0);
}

function normalizeChineseTranslation(value) {
  const chineseDigits = new Map([
    ['零', '0'], ['〇', '0'], ['一', '1'], ['二', '2'], ['三', '3'], ['四', '4'],
    ['五', '5'], ['六', '6'], ['七', '7'], ['八', '8'], ['九', '9'],
  ]);
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(
      /(?:Mach|马赫)\s*(?:点|decimal|point|\.)\s*([零〇一二三四五六七八九0-9]{2})/gi,
      (_match, digits) => `Mach 0.${[...digits].map((digit) => chineseDigits.get(digit) ?? digit).join('')}`,
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function multisetContains(actual, expected) {
  const counts = new Map();
  for (const value of actual) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of expected) {
    const count = counts.get(value) ?? 0;
    if (count <= 0) return false;
    counts.set(value, count - 1);
  }
  return true;
}

function numberFactsContain(actual, expected) {
  const normalize = (value) => String(value).replace(/\D/g, '');
  return multisetContains(actual.map(normalize), expected.map(normalize));
}

function translationItemErrors(task, result, kind) {
  const errors = [];
  if (!result) return ['missing-result-item'];
  if (result.appNewId !== task.appNewId) errors.push('app-id-mismatch');
  const requiredFields = kind === 'radiotelephony' ? ['audioTextZh', 'referenceTextZh'] : ['audioTextZh'];
  for (const field of requiredFields) {
    if (!String(result[field] ?? '').trim()) errors.push(`missing-${field}`);
    else if (field === 'audioTextZh' && !/[\p{Script=Han}]/u.test(result[field])) {
      errors.push(`${field}-has-no-chinese`);
    }
  }
  if (kind === 'listening' && !/\n问题：\s*\S/.test(result.audioTextZh ?? '')) {
    errors.push('missing-question-line');
  }
  const fieldPairs = [['audioText', 'audioTextZh']];
  if (kind === 'radiotelephony') fieldPairs.push(['referenceText', 'referenceTextZh']);
  const taskCallsign = kind === 'radiotelephony'
    ? /^([A-Z]{3})\s+(\d+)/.exec(String(task.taskTitle ?? ''))
    : null;
  const callsignContext = taskCallsign
    ? { code: taskCallsign[1].toUpperCase(), digits: taskCallsign[2] }
    : null;
  for (const [englishField, chineseField] of fieldPairs) {
    const englishValue = kind === 'listening' && englishField === 'audioText'
      ? String(task[englishField] ?? '')
        .replace(/^\s*\d+\.\s*(?:\n|\s)/, '')
        .replace(/\nA\.\s[\s\S]*$/, '')
      : task[englishField];
    const strippedExpected = stripContextCallsign(englishValue, callsignContext);
    const strippedActual = stripContextCallsign(
      normalizeChineseTranslation(result[chineseField]),
      callsignContext,
    );
    if (strippedExpected.found && !strippedActual.found) errors.push(`${chineseField}-missing-callsign`);
    const expected = protectedFactsForTranslation(strippedExpected.text);
    const actual = protectedFactsForTranslation(strippedActual.text);
    if (!multisetContains(actual.codes, expected.codes)) errors.push(`${chineseField}-missing-code`);
    if (!numberFactsContain(actual.numbers, expected.numbers)) {
      errors.push(`${chineseField}-missing-number`);
      if (process.env.DEBUG_TRANSLATION_FACTS === '1') {
        console.error(JSON.stringify({
          sourceId: task.sourceId,
          field: chineseField,
          expectedNumbers: expected.numbers,
          actualNumbers: actual.numbers,
        }));
      }
    }
    if (!multisetContains(actual.runways, expected.runways)) errors.push(`${chineseField}-missing-runway`);
    const englishLabels = String(task[englishField] ?? '').match(/(^|\n)(?:B|C|P|CTL|APP|GND|TWR):/g) ?? [];
    const chineseLabels = String(result[chineseField] ?? '').match(/(^|\n)(?:B|C|P|CTL|APP|GND|TWR)[:：]/g) ?? [];
    if (chineseLabels.length < englishLabels.length) errors.push(`${chineseField}-missing-speaker-label`);
  }
  return [...new Set(errors)];
}

async function translationStatus({ requireAll = false } = {}) {
  const manifestPath = path.join(GENERATED, 'translation-task-manifest.json');
  const manifest = await readJson(manifestPath);
  const report = [];
  let completedItems = 0;
  let validItems = 0;
  for (const batch of manifest.records) {
    const task = await readJson(path.join(ROOT, batch.taskPath));
    const resultPath = path.join(ROOT, batch.resultPath);
    if (!(await exists(resultPath))) {
      report.push({ ...batch, status: 'pending', errors: [] });
      continue;
    }
    let result;
    const errors = [];
    try {
      result = await readJson(resultPath);
    } catch (error) {
      report.push({ ...batch, status: 'invalid-json', errors: [error.message] });
      continue;
    }
    if (result.batchId !== batch.batchId) errors.push('batch-id-mismatch');
    if (result.kind !== batch.kind) errors.push('kind-mismatch');
    if (!Array.isArray(result.items)) errors.push('items-not-array');
    const resultMap = new Map((result.items ?? []).map((item) => [item.sourceId, item]));
    if (resultMap.size !== task.items.length) errors.push('item-count-mismatch');
    const itemErrors = [];
    for (const taskItem of task.items) {
      const currentErrors = translationItemErrors(taskItem, resultMap.get(taskItem.sourceId), batch.kind);
      if (currentErrors.length) itemErrors.push({ sourceId: taskItem.sourceId, errors: currentErrors });
      else validItems += 1;
    }
    for (const resultItem of result.items ?? []) {
      if (!task.items.some((taskItem) => taskItem.sourceId === resultItem.sourceId)) {
        itemErrors.push({ sourceId: resultItem.sourceId, errors: ['unexpected-source-id'] });
      }
    }
    completedItems += Math.min(task.items.length, result.items?.length ?? 0);
    report.push({
      ...batch,
      status: errors.length || itemErrors.length ? 'invalid' : 'valid',
      errors,
      itemErrors,
      resultChecksum: await sha256File(resultPath),
    });
  }
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totalBatches: manifest.records.length,
    validBatches: report.filter((item) => item.status === 'valid').length,
    invalidBatches: report.filter((item) => ['invalid', 'invalid-json'].includes(item.status)).length,
    pendingBatches: report.filter((item) => item.status === 'pending').length,
    totalItems: manifest.totalItems,
    completedItems,
    validItems,
    records: report,
  };
  await writeJsonAtomic(path.join(GENERATED, 'translation-validation-report.json'), summary);
  if (requireAll) {
    invariant(summary.pendingBatches === 0, `仍有 ${summary.pendingBatches} 个翻译批次未完成。`);
    invariant(summary.invalidBatches === 0, `仍有 ${summary.invalidBatches} 个翻译批次未通过。`);
    invariant(summary.validItems === summary.totalItems, '通过翻译校验的题目数量不完整。');
  }
  console.log(
    JSON.stringify(
      {
        status: requireAll ? 'translations-verified' : 'translation-status',
        totalBatches: summary.totalBatches,
        validBatches: summary.validBatches,
        invalidBatches: summary.invalidBatches,
        pendingBatches: summary.pendingBatches,
        totalItems: summary.totalItems,
        validItems: summary.validItems,
      },
      null,
      2,
    ),
  );
  return summary;
}

async function mergeTranslations() {
  const validation = await translationStatus({ requireAll: true });
  const preparedPath = path.join(GENERATED, 'prepared-candidates.json');
  const prepared = await readJson(preparedPath);
  const translations = [];
  for (const batch of validation.records) {
    const result = await readJson(path.join(ROOT, batch.resultPath));
    translations.push(...result.items.map((item) => ({ ...item, batchId: batch.batchId, kind: batch.kind })));
  }
  const translationMap = new Map(translations.map((item) => [item.sourceId, item]));
  invariant(translationMap.size === prepared.total, '合并翻译数量与准备候选不一致。');
  for (const record of prepared.records) {
    const translation = translationMap.get(record.sourceId);
    invariant(translation, `缺少翻译：${record.sourceId}`);
    record.card.audioTextZh = normalizeChineseTranslation(translation.audioTextZh)
      .replace(/Question:/g, '问题：')
      .replace(/\n问题:\s*/g, '\n问题：');
    if (record.kind === 'radiotelephony') {
      record.card.referenceTextZh = normalizeChineseTranslation(translation.referenceTextZh)
        .replace(/(^|\n)(B|C|P|CTL|APP|GND|TWR):/g, '$1$2：');
      record.card.audioTextZh = record.card.audioTextZh.replace(
        /(^|\n)(B|C|P|CTL|APP|GND|TWR):/g,
        '$1$2：',
      );
    }
    record.translationStatus = 'complete';
    record.target.preparedCardChecksum = sha256Text(JSON.stringify(record.card));
  }
  prepared.translatedAt = new Date().toISOString();
  prepared.translationChecksum = sha256Text(JSON.stringify(translations));
  prepared.preparedChecksumBeforeTranslation = prepared.preparedChecksum;
  prepared.preparedChecksum = sha256Text(JSON.stringify(prepared.records));
  await writeJsonAtomic(preparedPath, prepared);
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/translations.json'), {
    schemaVersion: 1,
    translationChecksum: prepared.translationChecksum,
    total: translations.length,
    records: translations,
  });
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'translations-complete',
    total: prepared.total,
    translationChecksum: prepared.translationChecksum,
    preparedChecksum: prepared.preparedChecksum,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      {
        status: 'translations-merged',
        total: prepared.total,
        translationChecksum: prepared.translationChecksum,
        preparedChecksum: prepared.preparedChecksum,
      },
      null,
      2,
    ),
  );
}

const FINAL_DEDUPE_RULE_VERSION = 'web-question-bank-final-dedupe-v1.1.0';

function uniqueFactsSignature(facts) {
  return JSON.stringify(
    Object.fromEntries(
      ['callsigns', 'numbers', 'runways', 'units', 'critical'].map((key) => [
        key,
        [...new Set(facts[key] ?? [])].sort(),
      ]),
    ),
  );
}

function isFinalHighConfidenceDuplicate(kind, comparison, left, right) {
  if (kind === 'listening') {
    const fields = comparison.fields;
    return Boolean(
      comparison.factsEqual &&
      fields.body >= 0.985 &&
      fields.question >= 0.985 &&
      fields.choices >= 0.995 &&
      fields.correct >= 0.995
    );
  }
  if (kind === 'radiotelephony') {
    const fields = comparison.fields;
    return Boolean(
      comparison.factsEqual && fields.audio >= 0.985 && fields.reference >= 0.985
    );
  }
  const fields = comparison.fields;
  const uniqueFactsEqual =
    uniqueFactsSignature(left.hardFacts) === uniqueFactsSignature(right.hardFacts);
  const [shorter, longer] =
    left.audio.compact.length <= right.audio.compact.length
      ? [left.audio.compact, right.audio.compact]
      : [right.audio.compact, left.audio.compact];
  const repeatedContainment =
    shorter.length >= 100 && longer.includes(shorter) && fields.token >= 0.99;
  if (uniqueFactsEqual && repeatedContainment && !comparison.factsEqual) {
    comparison.factEquivalence = ['repeated-content-multiplicity-only'];
  }
  return Boolean(
    uniqueFactsEqual &&
      (repeatedContainment ||
        (fields.audio >= 0.99 && fields.token >= 0.97 && fields.lengthRatio >= 0.94))
  );
}

function finalDedupeMarkdown(payload) {
  const lines = [
    '# Web 三类题库最终全局去重报告',
    '',
    `规则版本：\`${payload.ruleVersion}\``,
    '',
    `准备候选：${payload.total}`,
    '',
    `最终迁移：${payload.kept}`,
    '',
    `最终新增排除：${payload.excluded}`,
    '',
    '| 题型 | 候选 | 最终迁移 | 最终新增排除 |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    const item = payload.byKind[kind];
    lines.push(`| ${kind} | ${item.total} | ${item.kept} | ${item.excluded} |`);
  }
  lines.push('', '## 本阶段排除明细', '');
  const excluded = payload.records.filter((record) => record.finalDecision.startsWith('exclude-'));
  if (!excluded.length) lines.push('- 无');
  else {
    for (const record of excluded) {
      const equivalence = record.match.factEquivalence?.length
        ? `，事实等价证据 ${record.match.factEquivalence.join(', ')}`
        : '';
      lines.push(
        `- ${record.sourceId} → ${record.match.origin}:${record.match.id}（${record.finalDecision}，相似度 ${record.match.metrics.overall}${equivalence}）`,
      );
    }
  }
  lines.push(
    '',
    '本阶段只在准备文本完成后补做跨批次、跨目录全局检查；呼号、数字、跑道后缀、高度、航向、频率和单位差异继续受关键事实保护。',
    '',
  );
  return lines.join('\n');
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

async function buildMigrateReview() {
  const finalDedupe = await readJson(path.join(WORKSTREAM, 'decisions/final-global-dedupe.json'));
  const mapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  const prepared = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  const manualNotes = await readJson(path.join(WORKSTREAM, 'decisions/manual-review-notes.json'));
  invariant(mapping.finalDedupeChecksum === finalDedupe.recordsChecksum, '人工审核清单映射未绑定最终去重。');
  invariant(finalDedupe.preparedChecksum === prepared.preparedChecksum, '人工审核清单未基于当前准备候选。');
  const mappingBySource = new Map(mapping.records.map((record) => [record.webSourceId, record]));
  const preparedBySource = new Map(prepared.records.map((record) => [record.sourceId, record]));
  const notesBySource = new Map(manualNotes.records.map((record) => [record.sourceId, record.notes]));
  const records = [];
  for (const decision of finalDedupe.records) {
    if (decision.finalDecision.startsWith('exclude-')) continue;
    const mapRecord = mappingBySource.get(decision.sourceId);
    const preparedRecord = preparedBySource.get(decision.sourceId);
    invariant(mapRecord && preparedRecord, `人工审核清单缺少映射或候选：${decision.sourceId}`);
    const flags = [...new Set([
      ...(decision.reviewFlags ?? []),
      ...(notesBySource.has(decision.sourceId) ? ['manual-content-review'] : []),
    ])];
    const needsReview = decision.finalDecision === 'borderline-kept'
      || flags.some((flag) => [
        'classification-borderline',
        'duration-borderline',
        'source-section-incomplete',
        'manual-content-review',
      ].includes(flag));
    if (!needsReview) continue;
    records.push({
      sourceId: decision.sourceId,
      kind: decision.kind,
      finalDecision: decision.finalDecision,
      appId: mapRecord.appNewId,
      taskTitle: mapRecord.finalTaskTitle ?? preparedRecord.card.taskTitle,
      targetDirectory: mapRecord.targetDirectory,
      targetTopicId: mapRecord.targetTopicId,
      audioPath: mapRecord.appAudioPath,
      sourceZone: mapRecord.sourceZone,
      sourceJsonPath: mapRecord.sourceJsonPath,
      sourceDurationSeconds: preparedRecord.sourceDurationSeconds,
      reviewFlags: flags,
      closestMatch: mapRecord.closestMatch ?? null,
      notes: notesBySource.get(decision.sourceId) ?? [],
    });
  }
  records.sort((left, right) =>
    left.kind.localeCompare(right.kind, 'en')
    || String(left.targetDirectory).localeCompare(String(right.targetDirectory), 'zh-CN')
    || String(left.taskTitle).localeCompare(String(right.taskTitle), 'zh-CN', { numeric: true }),
  );
  const borderlineCount = records.filter((record) => record.finalDecision === 'borderline-kept').length;
  const expectedBorderline = finalDedupe.records.filter((record) => record.finalDecision === 'borderline-kept').length;
  invariant(borderlineCount === expectedBorderline, '人工审核清单未覆盖全部 borderline-kept。');
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    finalDedupeRuleVersion: finalDedupe.ruleVersion,
    finalDedupeChecksum: finalDedupe.recordsChecksum,
    mappingChecksum: sha256Text(JSON.stringify(mapping.records)),
    totalReviewRecords: records.length,
    counts: {
      borderlineKept: borderlineCount,
      durationBorderline: records.filter((record) => record.reviewFlags.includes('duration-borderline')).length,
      classificationBorderline: records.filter((record) => record.reviewFlags.includes('classification-borderline')).length,
      sourceSectionIncomplete: records.filter((record) => record.reviewFlags.includes('source-section-incomplete')).length,
      manualContentReview: records.filter((record) => record.reviewFlags.includes('manual-content-review')).length,
    },
    records,
  };
  payload.recordsChecksum = sha256Text(JSON.stringify(records));
  await writeJsonAtomic(path.join(WORKSTREAM, 'reports/migrate-review.json'), payload);
  const lines = [
    '# Web 三类题库迁移上线后人工审核清单',
    '',
    `最终去重规则：\`${payload.finalDedupeRuleVersion}\``,
    '',
    `最终去重 checksum：\`${payload.finalDedupeChecksum}\``,
    '',
    `清单记录 checksum：\`${payload.recordsChecksum}\``,
    '',
    `共 ${payload.totalReviewRecords} 条；borderline-kept ${payload.counts.borderlineKept}，时长边界 ${payload.counts.durationBorderline}，分类边界 ${payload.counts.classificationBorderline}，原隔离区 ${payload.counts.sourceSectionIncomplete}，人工内容疑点 ${payload.counts.manualContentReview}。`,
    '',
    '| 题型 | 目录 / 题号 | Web 源 ID | 状态与标记 | 最相似对象 | 事实差异或人工备注 | 音频路径 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const record of records) {
    const closest = record.closestMatch
      ? `${record.closestMatch.origin}:${record.closestMatch.id} (${record.closestMatch.metrics?.overall ?? ''})`
      : '';
    const evidence = [
      ...(record.closestMatch?.hardFactDifferences ?? []),
      ...record.notes,
      ...(record.reviewFlags.includes('duration-borderline')
        ? [`时长 ${record.sourceDurationSeconds}s，19 秒兜底分类`]
        : []),
    ].join('；');
    lines.push(`| ${markdownCell(record.kind)} | ${markdownCell(`${record.targetDirectory} / ${record.taskTitle}`)} | ${markdownCell(record.sourceId)} | ${markdownCell(`${record.finalDecision}; ${record.reviewFlags.join(', ')}`)} | ${markdownCell(closest)} | ${markdownCell(evidence)} | ${markdownCell(record.audioPath)} |`);
  }
  await fsp.writeFile(path.join(WORKSTREAM, 'reports/migrate-review.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'migrate-review-built',
    totalReviewRecords: payload.totalReviewRecords,
    counts: payload.counts,
    recordsChecksum: payload.recordsChecksum,
  }, null, 2));
}

async function finalGlobalDedupe() {
  const prepared = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  invariant(prepared.prepareRuleVersion === PREPARE_RULE_VERSION, '最终去重使用了旧准备规则。');
  invariant(
    prepared.preparedChecksum === sha256Text(JSON.stringify(prepared.records)),
    '最终去重前准备候选 checksum 不一致。',
  );
  const savedAppBaseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  const currentAppBaseline = await createAppBaseline({ write: false });
  invariant(savedAppBaseline.rootChecksum === currentAppBaseline.rootChecksum, '最终去重前 App 基线已漂移。');

  const accepted = {
    listening: await loadAppEntries('listening'),
    radiotelephony: await loadAppEntries('radiotelephony'),
    storytelling: await loadAppEntries('storytelling'),
  };
  const exactIndexes = {};
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    exactIndexes[kind] = new Map();
    for (const entry of accepted[kind]) {
      if (!exactIndexes[kind].has(entry.profile.exactSignature)) {
        exactIndexes[kind].set(entry.profile.exactSignature, entry);
      }
    }
  }

  const records = [];
  for (let index = 0; index < prepared.records.length; index += 1) {
    const record = prepared.records[index];
    const profile = buildContentProfile(record.kind, record.card);
    let duplicate = null;
    const exact = exactIndexes[record.kind].get(profile.exactSignature);
    if (exact) {
      const comparison = compareProfiles(profile, exact.profile);
      if (comparison.factsEqual) {
        duplicate = { entry: exact, comparison, decision: 'exclude-final-exact' };
      }
    }
    if (!duplicate) {
      for (const entry of accepted[record.kind]) {
        const leftLength = profile.combined.compact.length;
        const rightLength = entry.profile.combined.compact.length;
        const lengthRatio = Math.max(leftLength, rightLength)
          ? Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength)
          : 1;
        if (record.kind !== 'storytelling' && lengthRatio < 0.8) continue;
        if (record.kind === 'storytelling' && lengthRatio < 0.45) continue;
        const comparison = compareProfiles(profile, entry.profile);
        if (!isFinalHighConfidenceDuplicate(record.kind, comparison, profile, entry.profile)) continue;
        if (!duplicate || comparison.overall > duplicate.comparison.overall) {
          duplicate = { entry, comparison, decision: 'exclude-final-high-confidence' };
        }
      }
    }

    const finalRecord = {
      ordinal: index + 1,
      sourceId: record.sourceId,
      kind: record.kind,
      initialDecision: record.decision,
      finalDecision: duplicate ? duplicate.decision : record.decision,
      match: duplicate ? makeMatchReference(duplicate.entry, duplicate.comparison) : null,
      reviewFlags: [...new Set([
        ...(record.reviewFlags ?? []),
        ...(record.sourceZone === 'quarantine' ? ['source-section-incomplete'] : []),
      ])],
    };
    records.push(finalRecord);
    if (!duplicate) {
      const entry = {
        origin: 'web',
        id: record.sourceId,
        topicId: record.target.topicId,
        categoryId: record.target.categoryId,
        profile,
      };
      accepted[record.kind].push(entry);
      exactIndexes[record.kind].set(profile.exactSignature, entry);
    }

    if ((index + 1) % BATCH_SIZE === 0 || index + 1 === prepared.records.length) {
      const checkpointPath = path.join(
        GENERATED,
        'checkpoints/final-dedupe',
        `through-${String(index + 1).padStart(4, '0')}.json`,
      );
      await writeJsonAtomic(checkpointPath, {
        schemaVersion: 1,
        ruleVersion: FINAL_DEDUPE_RULE_VERSION,
        preparedChecksum: prepared.preparedChecksum,
        completed: index + 1,
        total: prepared.records.length,
        records: records.slice(Math.max(0, records.length - BATCH_SIZE)),
      });
      console.log(`final dedupe checkpoint ${index + 1}/${prepared.records.length}`);
    }
  }

  const byKind = {};
  for (const kind of ['listening', 'radiotelephony', 'storytelling']) {
    const kindRecords = records.filter((record) => record.kind === kind);
    byKind[kind] = {
      total: kindRecords.length,
      kept: kindRecords.filter((record) => !record.finalDecision.startsWith('exclude-')).length,
      excluded: kindRecords.filter((record) => record.finalDecision.startsWith('exclude-')).length,
    };
  }
  const payload = {
    schemaVersion: 1,
    ruleVersion: FINAL_DEDUPE_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    preparedChecksum: prepared.preparedChecksum,
    appBaselineRootChecksum: savedAppBaseline.rootChecksum,
    total: records.length,
    kept: records.filter((record) => !record.finalDecision.startsWith('exclude-')).length,
    excluded: records.filter((record) => record.finalDecision.startsWith('exclude-')).length,
    byKind,
    records,
  };
  payload.recordsChecksum = sha256Text(JSON.stringify(records));
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/final-global-dedupe.json'), payload);
  await writeJsonAtomic(path.join(WORKSTREAM, 'reports/final-global-dedupe.json'), {
    ...payload,
    records: undefined,
  });
  await fsp.writeFile(
    path.join(WORKSTREAM, 'reports/final-global-dedupe.md'),
    `${finalDedupeMarkdown(payload)}\n`,
    'utf8',
  );

  const mapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  const finalBySource = new Map(records.map((record) => [record.sourceId, record]));
  mapping.finalDedupeRuleVersion = FINAL_DEDUPE_RULE_VERSION;
  mapping.finalDedupeChecksum = payload.recordsChecksum;
  mapping.migratingCandidates = payload.kept;
  mapping.records = mapping.records.map((record) => {
    const finalRecord = finalBySource.get(record.webSourceId);
    const finalDecision = finalRecord?.finalDecision ?? record.decision;
    const reviewFlags = [...new Set([
      ...(finalRecord?.reviewFlags ?? record.reviewFlags ?? []),
      ...(record.sourceZone === 'quarantine' ? ['source-section-incomplete'] : []),
    ])];
    if (!finalDecision.startsWith('exclude-final-')) return { ...record, finalDecision, reviewFlags };
    return {
      ...record,
      finalDecision,
      reviewFlags,
      proposedAppId: record.appNewId,
      proposedTargetDirectory: record.targetDirectory,
      proposedTargetTopicId: record.targetTopicId,
      proposedAppAudioPath: record.appAudioPath,
      proposedAudioObjectKey: record.audioObjectKey,
      appNewId: null,
      targetDirectory: null,
      targetTopicId: null,
      appAudioPath: null,
      audioObjectKey: null,
    };
  });
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'), mapping);
  console.log(
    JSON.stringify(
      {
        status: 'final-global-dedupe-complete',
        total: payload.total,
        kept: payload.kept,
        excluded: payload.excluded,
        byKind: payload.byKind,
        recordsChecksum: payload.recordsChecksum,
      },
      null,
      2,
    ),
  );
}

const TARGET_RELEASE_VERSION = 5;
const APP_REGISTRY = path.join(ROOT, 'content/question-banks/registry.json');
const FORMAL_CANDIDATE_ROOT = path.join(GENERATED, 'formal-candidate');
const FORMAL_BACKUP_ROOT = path.join(GENERATED, 'formal-backup');

async function loadFormalBankGraph(bankId, banksRoot = APP_BANK_ROOT) {
  const bankRoot = path.join(banksRoot, bankId);
  const bank = await readJson(path.join(bankRoot, 'bank.json'));
  const categories = new Map();
  const topics = new Map();
  for (const categoryId of bank.categoryIds) {
    const category = await readJson(path.join(bankRoot, 'categories', `${categoryId}.json`));
    categories.set(categoryId, category);
    for (const topicId of category.topicIds) {
      const topic = await readJson(path.join(bankRoot, 'topics', `${topicId}.json`));
      invariant(topic.categoryId === categoryId, `话题分类不一致：${bankId}/${topicId}`);
      topics.set(topicId, topic);
    }
  }
  return { bankId, bank, categories, topics };
}

function embeddedBankFromGraph(graph) {
  const { categoryIds, capabilities: _capabilities, ...embeddedBank } = graph.bank;
  return {
    ...embeddedBank,
    categories: categoryIds.map((categoryId) => {
      const category = graph.categories.get(categoryId);
      const { topicIds, ...embeddedCategory } = category;
      return {
        ...embeddedCategory,
        topics: topicIds.map((topicId) => {
          const topic = graph.topics.get(topicId);
          const { categoryId: _categoryId, ...embeddedTopic } = topic;
          return embeddedTopic;
        }),
      };
    }),
  };
}

function bankSummaryText(bankId, topicCount, cardCount) {
  if (bankId === 'listening') return `${topicCount} 题组 / ${cardCount} 题`;
  if (bankId === 'radiotelephony') return `${topicCount} 场景 / ${cardCount} 卡`;
  return `${topicCount} 子库 / ${cardCount} 卡`;
}

function taskTitlePrefix(record) {
  if (record.kind === 'listening') {
    return {
      'listening-topic-01': '10s航空英语',
      'listening-topic-02': '20s陆空通话',
      'listening-topic-03': '20s航空英语',
      'listening-topic-04': '10s陆空通话',
    }[record.target.topicId];
  }
  if (record.kind === 'storytelling') return '飞行ICAO-基础题库';
  return record.target.taskTitle.replace(/-\d+$/, '');
}

function refreshGraphCounts(graph) {
  let bankCards = 0;
  let bankTopics = 0;
  for (const categoryId of graph.bank.categoryIds) {
    const category = graph.categories.get(categoryId);
    category.declaredTopicCount = category.topicIds.length;
    category.declaredCardCount = category.topicIds.reduce((sum, topicId) => {
      const topic = graph.topics.get(topicId);
      topic.declaredCardCount = topic.cards.length;
      return sum + topic.cards.length;
    }, 0);
    bankTopics += category.declaredTopicCount;
    bankCards += category.declaredCardCount;
  }
  graph.bank.declaredTopicCount = bankTopics;
  graph.bank.declaredCardCount = bankCards;
  graph.bank.summary = bankSummaryText(graph.bankId, bankTopics, bankCards);
}

async function writeGraphCandidate(graph, candidateRepoRoot) {
  const bankRoot = path.join(candidateRepoRoot, 'content/question-banks/banks', graph.bankId);
  await writeJsonAtomic(path.join(bankRoot, 'bank.json'), graph.bank);
  for (const category of graph.categories.values()) {
    await writeJsonAtomic(path.join(bankRoot, 'categories', `${category.id}.json`), category);
  }
  for (const topic of graph.topics.values()) {
    await writeJsonAtomic(path.join(bankRoot, 'topics', `${topic.id}.json`), topic);
  }
}

async function stageFormalCandidates() {
  const prepared = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  invariant(prepared.translatedAt, '正式候选区要求先合并全部翻译。');
  invariant(
    prepared.records.every((record) => record.translationStatus === 'complete'),
    '正式候选区存在未完成翻译。',
  );
  const finalDedupe = await readJson(path.join(WORKSTREAM, 'decisions/final-global-dedupe.json'));
  invariant(finalDedupe.ruleVersion === FINAL_DEDUPE_RULE_VERSION, '最终去重规则版本不一致。');
  invariant(finalDedupe.preparedChecksum === prepared.preparedChecksum, '最终去重未基于当前翻译后候选。');
  invariant(
    finalDedupe.recordsChecksum === sha256Text(JSON.stringify(finalDedupe.records)),
    '最终去重记录 checksum 不一致。',
  );
  const preStageMapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  invariant(preStageMapping.finalDedupeRuleVersion === FINAL_DEDUPE_RULE_VERSION, '正式候选映射未绑定最终去重规则。');
  invariant(preStageMapping.finalDedupeChecksum === finalDedupe.recordsChecksum, '正式候选映射未绑定最终去重 checksum。');
  invariant(preStageMapping.migratingCandidates === finalDedupe.kept, '正式候选映射迁移数量与最终去重不一致。');
  const preStageMappingBySource = new Map(preStageMapping.records.map((record) => [record.webSourceId, record]));
  for (const decision of finalDedupe.records) {
    const mapRecord = preStageMappingBySource.get(decision.sourceId);
    invariant(mapRecord, `正式候选映射缺失：${decision.sourceId}`);
    if (decision.finalDecision.startsWith('exclude-')) {
      invariant(
        mapRecord.appNewId === null && mapRecord.targetDirectory === null && mapRecord.appAudioPath === null,
        `最终排除项仍占用正式映射：${decision.sourceId}`,
      );
    } else {
      invariant(
        mapRecord.appNewId && mapRecord.targetDirectory && mapRecord.appAudioPath,
        `最终保留项映射不完整：${decision.sourceId}`,
      );
    }
  }
  const savedAppBaseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  const currentAppBaseline = await createAppBaseline({ write: false });
  invariant(savedAppBaseline.rootChecksum === currentAppBaseline.rootChecksum, '正式候选生成前 App 基线已漂移。');

  const embeddedBefore = await readJson(APP_EMBEDDED);
  const graphs = new Map();
  for (const bankId of ['listening', 'radiotelephony', 'storytelling']) {
    const graph = await loadFormalBankGraph(bankId);
    const currentEmbedded = embeddedBefore.find((bank) => bank.id === bankId);
    invariant(
      JSON.stringify(embeddedBankFromGraph(graph)) === JSON.stringify(currentEmbedded),
      `正式源与内嵌题库在写入前不一致：${bankId}`,
    );
    graphs.set(bankId, graph);
  }

  const finalBySource = new Map(finalDedupe.records.map((record) => [record.sourceId, record]));
  const keptRecords = prepared.records.filter(
    (record) => !finalBySource.get(record.sourceId)?.finalDecision.startsWith('exclude-'),
  );
  invariant(keptRecords.length === finalDedupe.kept, '最终迁移数量与去重结论不一致。');
  const rtScenarioPlans = new Map(prepared.rtScenarioPlans.map((plan) => [plan.topicId, plan]));
  const topicCounters = new Map();
  for (const graph of graphs.values()) {
    for (const [topicId, topic] of graph.topics) topicCounters.set(topicId, topic.cards.length);
  }
  const finalizedTargets = new Map();

  for (const record of keptRecords) {
    const graph = graphs.get(record.kind);
    let topic = graph.topics.get(record.target.topicId);
    if (!topic) {
      invariant(record.kind === 'radiotelephony', `非陆空通话候选试图新建话题：${record.sourceId}`);
      const plan = rtScenarioPlans.get(record.target.topicId);
      invariant(plan, `缺少新场景计划：${record.target.topicId}`);
      topic = {
        categoryId: record.target.categoryId,
        id: record.target.topicId,
        name: plan.topicName,
        declaredCardCount: 0,
        cards: [],
      };
      graph.topics.set(topic.id, topic);
      const category = graph.categories.get(topic.categoryId);
      invariant(category, `新场景分类不存在：${topic.categoryId}`);
      category.topicIds.push(topic.id);
      topicCounters.set(topic.id, 0);
    }
    const nextNumber = (topicCounters.get(topic.id) ?? topic.cards.length) + 1;
    topicCounters.set(topic.id, nextNumber);
    const card = structuredClone(record.card);
    card.taskTitle = `${taskTitlePrefix(record)}-${nextNumber}`;
    topic.cards.push(card);
    finalizedTargets.set(record.sourceId, {
      appNewId: card.id,
      finalTaskTitle: card.taskTitle,
      targetTopicId: topic.id,
      targetDirectory: `content/question-banks/banks/${record.kind}/topics/${topic.id}.json`,
      appAudioPath: card.audio,
      audioObjectKey: record.resource.objectKey,
    });
  }
  for (const graph of graphs.values()) refreshGraphCounts(graph);

  const registry = await readJson(APP_REGISTRY);
  invariant(registry.releaseVersion === TARGET_RELEASE_VERSION - 1, '当前本地发布版本不是预期上一版。');
  registry.releaseVersion = TARGET_RELEASE_VERSION;
  registry.releasedAt = prepared.translatedAt;

  const resourceManifest = await readJson(APP_RESOURCE_MANIFEST);
  const existingObjectKeys = new Set(resourceManifest.files.map((file) => file.objectKey));
  const existingPublicPaths = new Set(resourceManifest.files.map((file) => file.publicPath));
  const newResources = keptRecords.map((record) => structuredClone(record.resource));
  for (const resource of newResources) {
    invariant(!existingObjectKeys.has(resource.objectKey), `资源 objectKey 已存在：${resource.objectKey}`);
    invariant(!existingPublicPaths.has(resource.publicPath), `资源 publicPath 已存在：${resource.publicPath}`);
    existingObjectKeys.add(resource.objectKey);
    existingPublicPaths.add(resource.publicPath);
  }
  resourceManifest.version += 1;
  resourceManifest.files.push(...newResources);
  resourceManifest.files.sort((left, right) => left.objectKey.localeCompare(right.objectKey, 'en'));

  const embeddedAfter = structuredClone(embeddedBefore);
  for (const [bankId, graph] of graphs) {
    const index = embeddedAfter.findIndex((bank) => bank.id === bankId);
    invariant(index >= 0, `内嵌题库缺少：${bankId}`);
    embeddedAfter[index] = embeddedBankFromGraph(graph);
  }

  await fsp.rm(FORMAL_CANDIDATE_ROOT, { recursive: true, force: true });
  const candidateRepoRoot = path.join(FORMAL_CANDIDATE_ROOT, 'repo');
  for (const graph of graphs.values()) await writeGraphCandidate(graph, candidateRepoRoot);
  await writeJsonAtomic(path.join(candidateRepoRoot, path.relative(ROOT, APP_REGISTRY)), registry);
  await writeJsonAtomic(
    path.join(candidateRepoRoot, path.relative(ROOT, APP_RESOURCE_MANIFEST)),
    resourceManifest,
  );
  await writeJsonAtomic(path.join(candidateRepoRoot, path.relative(ROOT, APP_EMBEDDED)), embeddedAfter);

  const candidateFiles = await walkFiles(candidateRepoRoot);
  const fileRecords = [];
  for (const candidatePath of candidateFiles) {
    const destinationRelativePath = path.relative(candidateRepoRoot, candidatePath).split(path.sep).join('/');
    const destinationPath = path.join(ROOT, destinationRelativePath);
    fileRecords.push({
      destinationRelativePath,
      candidateRelativePath: path.relative(ROOT, candidatePath).split(path.sep).join('/'),
      beforeExists: await exists(destinationPath),
      beforeChecksum: (await exists(destinationPath)) ? await sha256File(destinationPath) : null,
      afterChecksum: await sha256File(candidatePath),
      sizeBytes: (await fsp.stat(candidatePath)).size,
    });
  }
  const audioRecords = [];
  for (const record of keptRecords) {
    const sourcePath = path.join(ROOT, record.resource.localPreparedPath);
    const destinationRelativePath = `content/question-banks/resources/files/${record.resource.sourceRelativePath}`;
    const destinationPath = path.join(ROOT, destinationRelativePath);
    invariant(!(await exists(destinationPath)), `正式资源目标已存在：${destinationRelativePath}`);
    invariant((await sha256File(sourcePath)) === record.resource.checksum, `准备音频 checksum 漂移：${record.sourceId}`);
    audioRecords.push({
      sourceId: record.sourceId,
      sourceRelativePath: record.resource.localPreparedPath,
      destinationRelativePath,
      checksum: record.resource.checksum,
      sizeBytes: record.resource.sizeBytes,
    });
  }
  const manifest = {
    schemaVersion: 1,
    releaseVersion: TARGET_RELEASE_VERSION,
    releasedAt: registry.releasedAt,
    preparedChecksum: prepared.preparedChecksum,
    translationChecksum: prepared.translationChecksum,
    finalDedupeChecksum: finalDedupe.recordsChecksum,
    appBaselineRootChecksum: savedAppBaseline.rootChecksum,
    totalNewCards: keptRecords.length,
    byKind: Object.fromEntries(
      ['listening', 'radiotelephony', 'storytelling'].map((kind) => [
        kind,
        keptRecords.filter((record) => record.kind === kind).length,
      ]),
    ),
    finalCounts: Object.fromEntries(
      [...graphs].map(([bankId, graph]) => [
        bankId,
        { topics: graph.bank.declaredTopicCount, cards: graph.bank.declaredCardCount },
      ]),
    ),
    files: fileRecords,
    audioFiles: audioRecords,
  };
  manifest.candidateChecksum = sha256Text(JSON.stringify({ files: fileRecords, audioFiles: audioRecords }));
  await writeJsonAtomic(path.join(FORMAL_CANDIDATE_ROOT, 'manifest.json'), manifest);

  const mapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  mapping.releaseVersion = TARGET_RELEASE_VERSION;
  mapping.finalCandidateChecksum = manifest.candidateChecksum;
  mapping.migratingCandidates = keptRecords.length;
  mapping.records = mapping.records.map((record) => {
    const target = finalizedTargets.get(record.webSourceId);
    return target ? { ...record, ...target } : record;
  });
  await writeJsonAtomic(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'), mapping);
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'formal-candidate-staged',
    releaseVersion: TARGET_RELEASE_VERSION,
    totalNewCards: keptRecords.length,
    candidateChecksum: manifest.candidateChecksum,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      {
        status: 'formal-candidate-staged',
        releaseVersion: TARGET_RELEASE_VERSION,
        totalNewCards: keptRecords.length,
        byKind: manifest.byKind,
        finalCounts: manifest.finalCounts,
        files: fileRecords.length,
        audioFiles: audioRecords.length,
        candidateChecksum: manifest.candidateChecksum,
      },
      null,
      2,
    ),
  );
}

async function restoreFormalBackup(manifest) {
  for (const file of manifest.files) {
    const destinationPath = path.join(ROOT, file.destinationRelativePath);
    if (file.beforeExists) {
      const backupPath = path.join(FORMAL_BACKUP_ROOT, 'repo', file.destinationRelativePath);
      await ensureDir(path.dirname(destinationPath));
      await fsp.copyFile(backupPath, destinationPath);
    } else {
      await fsp.rm(destinationPath, { force: true });
    }
  }
  for (const audio of manifest.audioFiles) {
    await fsp.rm(path.join(ROOT, audio.destinationRelativePath), { force: true });
  }
  await fsp.rm(path.join(GENERATED, 'formal-apply-receipt.json'), { force: true });
}

async function applyFormalCandidates() {
  const manifest = await readJson(path.join(FORMAL_CANDIDATE_ROOT, 'manifest.json'));
  const existingReceiptPath = path.join(GENERATED, 'formal-apply-receipt.json');
  if (await exists(existingReceiptPath)) {
    const receipt = await readJson(existingReceiptPath);
    invariant(receipt.candidateChecksum === manifest.candidateChecksum, '正式写入收据对应其他候选。');
    console.log(JSON.stringify({ status: 'formal-candidate-already-applied', ...receipt }, null, 2));
    return;
  }
  const savedAppBaseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  const currentAppBaseline = await createAppBaseline({ write: false });
  invariant(savedAppBaseline.rootChecksum === currentAppBaseline.rootChecksum, '正式写入前 App 基线已漂移。');
  for (const file of manifest.files) {
    const candidatePath = path.join(ROOT, file.candidateRelativePath);
    const destinationPath = path.join(ROOT, file.destinationRelativePath);
    invariant((await sha256File(candidatePath)) === file.afterChecksum, `候选文件漂移：${file.destinationRelativePath}`);
    invariant((await exists(destinationPath)) === file.beforeExists, `目标文件存在状态漂移：${file.destinationRelativePath}`);
    if (file.beforeExists) {
      invariant((await sha256File(destinationPath)) === file.beforeChecksum, `目标文件内容漂移：${file.destinationRelativePath}`);
    }
  }
  for (const audio of manifest.audioFiles) {
    invariant(!(await exists(path.join(ROOT, audio.destinationRelativePath))), `正式音频目标已存在：${audio.destinationRelativePath}`);
    invariant((await sha256File(path.join(ROOT, audio.sourceRelativePath))) === audio.checksum, `准备音频漂移：${audio.sourceId}`);
  }

  await fsp.rm(FORMAL_BACKUP_ROOT, { recursive: true, force: true });
  for (const file of manifest.files.filter((item) => item.beforeExists)) {
    const sourcePath = path.join(ROOT, file.destinationRelativePath);
    const backupPath = path.join(FORMAL_BACKUP_ROOT, 'repo', file.destinationRelativePath);
    await ensureDir(path.dirname(backupPath));
    await fsp.copyFile(sourcePath, backupPath);
  }
  await writeJsonAtomic(path.join(FORMAL_BACKUP_ROOT, 'manifest.json'), manifest);

  try {
    for (const file of manifest.files) {
      const sourcePath = path.join(ROOT, file.candidateRelativePath);
      const destinationPath = path.join(ROOT, file.destinationRelativePath);
      await ensureDir(path.dirname(destinationPath));
      const temporary = `${destinationPath}.tmp-${process.pid}`;
      await fsp.copyFile(sourcePath, temporary);
      await fsp.rename(temporary, destinationPath);
    }
    for (const audio of manifest.audioFiles) {
      const sourcePath = path.join(ROOT, audio.sourceRelativePath);
      const destinationPath = path.join(ROOT, audio.destinationRelativePath);
      await ensureDir(path.dirname(destinationPath));
      const temporary = `${destinationPath}.tmp-${process.pid}`;
      await fsp.copyFile(sourcePath, temporary);
      await fsp.rename(temporary, destinationPath);
    }
  } catch (error) {
    await restoreFormalBackup(manifest);
    throw error;
  }

  const receipt = {
    schemaVersion: 1,
    status: 'applied',
    appliedAt: new Date().toISOString(),
    releaseVersion: manifest.releaseVersion,
    totalNewCards: manifest.totalNewCards,
    candidateChecksum: manifest.candidateChecksum,
  };
  await writeJsonAtomic(existingReceiptPath, receipt);
  await writeJsonAtomic(path.join(GENERATED, 'state.json'), {
    schemaVersion: 1,
    stage: 'formal-candidate-applied',
    ...receipt,
    updatedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({ status: 'formal-candidate-applied', ...receipt }, null, 2));
}

async function verifyFormalCandidates({ applied = false } = {}) {
  const manifest = await readJson(path.join(FORMAL_CANDIDATE_ROOT, 'manifest.json'));
  const candidateRepoRoot = path.join(FORMAL_CANDIDATE_ROOT, 'repo');
  for (const file of manifest.files) {
    const selectedPath = applied
      ? path.join(ROOT, file.destinationRelativePath)
      : path.join(ROOT, file.candidateRelativePath);
    invariant(await exists(selectedPath), `正式${applied ? '目标' : '候选'}文件缺失：${file.destinationRelativePath}`);
    invariant((await sha256File(selectedPath)) === file.afterChecksum, `正式${applied ? '目标' : '候选'}文件 checksum 错误：${file.destinationRelativePath}`);
  }
  for (const audio of manifest.audioFiles) {
    const selectedPath = applied
      ? path.join(ROOT, audio.destinationRelativePath)
      : path.join(ROOT, audio.sourceRelativePath);
    invariant(await exists(selectedPath), `正式${applied ? '目标' : '候选'}音频缺失：${audio.sourceId}`);
    invariant((await fsp.stat(selectedPath)).size === audio.sizeBytes, `正式音频大小错误：${audio.sourceId}`);
    invariant((await sha256File(selectedPath)) === audio.checksum, `正式音频 checksum 错误：${audio.sourceId}`);
  }

  const selectedRoot = applied ? ROOT : candidateRepoRoot;
  const banksRoot = path.join(selectedRoot, 'content/question-banks/banks');
  const embedded = await readJson(path.join(selectedRoot, path.relative(ROOT, APP_EMBEDDED)));
  const registry = await readJson(path.join(selectedRoot, path.relative(ROOT, APP_REGISTRY)));
  const resources = await readJson(path.join(selectedRoot, path.relative(ROOT, APP_RESOURCE_MANIFEST)));
  invariant(registry.releaseVersion === TARGET_RELEASE_VERSION, '正式候选 registry 版本错误。');
  invariant(resources.version === 3, `正式候选资源版本应为 3，实际 ${resources.version}`);

  const graphByBank = new Map();
  for (const bankId of ['listening', 'radiotelephony', 'storytelling']) {
    const graph = await loadFormalBankGraph(bankId, banksRoot);
    graphByBank.set(bankId, graph);
    const embeddedBank = embedded.find((bank) => bank.id === bankId);
    invariant(JSON.stringify(embeddedBankFromGraph(graph)) === JSON.stringify(embeddedBank), `正式源与内嵌题库不一致：${bankId}`);
    invariant(graph.bank.declaredTopicCount === manifest.finalCounts[bankId].topics, `正式话题数量错误：${bankId}`);
    invariant(graph.bank.declaredCardCount === manifest.finalCounts[bankId].cards, `正式卡片数量错误：${bankId}`);
  }

  const allCards = embedded.flatMap((bank) =>
    bank.categories.flatMap((category) =>
      category.topics.flatMap((topic) => topic.cards.map((card) => ({ bankId: bank.id, topicId: topic.id, card }))),
    ),
  );
  invariant(new Set(allCards.map((entry) => entry.card.id)).size === allCards.length, '正式候选出现重复卡片 ID。');
  const cardById = new Map(allCards.map((entry) => [entry.card.id, entry]));
  const resourceByPublicPath = new Map(resources.files.map((resource) => [resource.publicPath, resource]));
  invariant(resourceByPublicPath.size === resources.files.length, '正式资源 publicPath 重复。');
  invariant(new Set(resources.files.map((resource) => resource.objectKey)).size === resources.files.length, '正式资源 objectKey 重复。');

  const finalDedupe = await readJson(path.join(WORKSTREAM, 'decisions/final-global-dedupe.json'));
  const mapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  const prepared = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  const preparedBySource = new Map(prepared.records.map((record) => [record.sourceId, record]));
  const mappingBySource = new Map(mapping.records.map((record) => [record.webSourceId, record]));
  let verifiedNewCards = 0;
  for (const decision of finalDedupe.records) {
    const mapRecord = mappingBySource.get(decision.sourceId);
    invariant(mapRecord, `正式映射缺失：${decision.sourceId}`);
    if (decision.finalDecision.startsWith('exclude-')) {
      if (mapRecord.proposedAppId) invariant(!cardById.has(mapRecord.proposedAppId), `最终排除卡片被写入：${decision.sourceId}`);
      continue;
    }
    invariant(mapRecord.appNewId, `最终迁移卡片没有 App ID：${decision.sourceId}`);
    const entry = cardById.get(mapRecord.appNewId);
    invariant(entry, `最终迁移卡片未写入：${decision.sourceId}`);
    invariant(entry.bankId === decision.kind, `最终迁移题库错误：${decision.sourceId}`);
    invariant(entry.topicId === mapRecord.targetTopicId, `最终迁移目录错误：${decision.sourceId}`);
    invariant(entry.card.audio === mapRecord.appAudioPath, `最终迁移音频路径错误：${decision.sourceId}`);
    invariant(entry.card.taskTitle === mapRecord.finalTaskTitle, `最终迁移任务标题错误：${decision.sourceId}`);
    const resource = resourceByPublicPath.get(entry.card.audio);
    invariant(resource?.objectKey === mapRecord.audioObjectKey, `最终迁移资源映射错误：${decision.sourceId}`);
    const preparedRecord = preparedBySource.get(decision.sourceId);
    invariant(resource?.checksum === preparedRecord.resource.checksum, `最终迁移资源 checksum 错误：${decision.sourceId}`);
    invariant(String(entry.card.audioText ?? '').trim(), `最终迁移英文为空：${decision.sourceId}`);
    invariant(String(entry.card.audioTextZh ?? '').trim(), `最终迁移中文为空：${decision.sourceId}`);
    if (decision.kind === 'listening') {
      invariant(Array.isArray(entry.card.choices) && entry.card.choices.length === 4, `听力选项数量错误：${decision.sourceId}`);
      invariant(entry.card.choices.every((choice) => String(choice).trim()), `听力存在空选项：${decision.sourceId}`);
      invariant(Number.isInteger(entry.card.correctChoiceIndex) && entry.card.correctChoiceIndex >= 0 && entry.card.correctChoiceIndex <= 3, `听力正确索引错误：${decision.sourceId}`);
      const expectedReference = `正确答案：${String.fromCharCode(65 + entry.card.correctChoiceIndex)}. ${entry.card.choices[entry.card.correctChoiceIndex]}`;
      invariant(entry.card.referenceText === expectedReference, `听力参考答案链路错误：${decision.sourceId}`);
      invariant(/\nQuestion:\s*\S/.test(entry.card.audioText), `听力英文问题行错误：${decision.sourceId}`);
      invariant(/\n问题：\s*\S/.test(entry.card.audioTextZh), `听力中文问题行错误：${decision.sourceId}`);
    } else if (decision.kind === 'radiotelephony') {
      invariant(String(entry.card.referenceText ?? '').trim(), `陆空通话参考答案为空：${decision.sourceId}`);
      invariant(String(entry.card.referenceTextZh ?? '').trim(), `陆空通话答案翻译为空：${decision.sourceId}`);
    } else {
      invariant(entry.topicId === 'story-flight-basic', `故事未进入飞行ICAO基础题库：${decision.sourceId}`);
      invariant(!/[\r\n\t]/.test(entry.card.audioText), `故事英文不是单段：${decision.sourceId}`);
      invariant(!/[\r\n\t]/.test(entry.card.audioTextZh), `故事中文不是单段：${decision.sourceId}`);
    }
    verifiedNewCards += 1;
  }
  invariant(verifiedNewCards === manifest.totalNewCards, '正式迁移卡片验证数量错误。');

  const baseline = await readJson(path.join(WORKSTREAM, 'snapshots/app-baseline.json'));
  for (const [bankId, expectedAdded] of Object.entries(manifest.byKind)) {
    const base = baseline.banks.find((bank) => bank.bankId === bankId);
    invariant(manifest.finalCounts[bankId].cards === base.cards + expectedAdded, `正式题库增量错误：${bankId}`);
  }
  const baseResources = baseline.resourceManifest.files;
  invariant(resources.files.length === baseResources + manifest.audioFiles.length, '正式资源增量数量错误。');
  const nonTargetIds = new Set(['opi', 'sentences900']);
  const beforeEmbeddedPath = applied
    ? path.join(FORMAL_BACKUP_ROOT, 'repo', path.relative(ROOT, APP_EMBEDDED))
    : APP_EMBEDDED;
  const beforeEmbedded = await readJson(beforeEmbeddedPath);
  invariant(
    JSON.stringify(embedded.filter((bank) => nonTargetIds.has(bank.id))) ===
      JSON.stringify(beforeEmbedded.filter((bank) => nonTargetIds.has(bank.id))),
    '非目标题库内嵌内容发生变化。',
  );

  const report = {
    schemaVersion: 1,
    status: applied ? 'formal-applied-verified' : 'formal-candidate-verified',
    verifiedAt: new Date().toISOString(),
    releaseVersion: manifest.releaseVersion,
    totalNewCards: manifest.totalNewCards,
    byKind: manifest.byKind,
    finalCounts: manifest.finalCounts,
    resources: resources.files.length,
    newResources: manifest.audioFiles.length,
    candidateChecksum: manifest.candidateChecksum,
  };
  await writeJsonAtomic(
    path.join(WORKSTREAM, 'reports', applied ? 'formal-write-verification.json' : 'formal-candidate-verification.json'),
    report,
  );
  console.log(JSON.stringify(report, null, 2));
  return report;
}

const FULL_RELEASE_ROOT = path.join(ROOT, 'dist/question-bank-release');
const INCREMENTAL_RELEASE_ROOT = path.join(GENERATED, `release-v${TARGET_RELEASE_VERSION}`);

async function buildIncrementalRelease() {
  await verifyFormalCandidates({ applied: true });
  const formalManifest = await readJson(path.join(FORMAL_CANDIDATE_ROOT, 'manifest.json'));
  const fullManifest = await readJson(path.join(FULL_RELEASE_ROOT, 'manifest.json'));
  invariant(fullManifest.releaseVersion === TARGET_RELEASE_VERSION, '全量构建产物版本不是目标版本。');
  const targetBankIds = ['listening', 'radiotelephony', 'storytelling'];
  const bankEntries = fullManifest.banks.filter((bank) => targetBankIds.includes(bank.id));
  invariant(bankEntries.length === targetBankIds.length, '三类题库构建产物不完整。');
  invariant(bankEntries.every((bank) => bank.version === TARGET_RELEASE_VERSION), '三类题库版本不一致。');

  const sourceResources = await readJson(APP_RESOURCE_MANIFEST);
  const mapping = await readJson(path.join(WORKSTREAM, 'decisions/source-app-mapping.json'));
  const newObjectKeys = new Set(
    mapping.records
      .filter((record) => record.finalDecision && !record.finalDecision.startsWith('exclude-'))
      .map((record) => record.audioObjectKey),
  );
  const newResourcesWithSource = sourceResources.files.filter((resource) => newObjectKeys.has(resource.objectKey));
  invariant(newResourcesWithSource.length === formalManifest.audioFiles.length, '增量资源集合不完整。');
  invariant(newResourcesWithSource.every((resource) => targetBankIds.includes(resource.bankId)), '增量包混入非目标题库资源。');

  await fsp.rm(INCREMENTAL_RELEASE_ROOT, { recursive: true, force: true });
  const releaseRoot = path.join(INCREMENTAL_RELEASE_ROOT, 'release');
  const resourceRoot = path.join(INCREMENTAL_RELEASE_ROOT, 'resources');
  await ensureDir(path.join(releaseRoot, 'banks'));
  for (const bank of bankEntries) {
    const sourcePath = path.join(FULL_RELEASE_ROOT, bank.file);
    const destinationPath = path.join(releaseRoot, bank.file);
    await ensureDir(path.dirname(destinationPath));
    await fsp.copyFile(sourcePath, destinationPath);
    invariant((await sha256File(destinationPath)) === bank.checksum, `增量题库 checksum 错误：${bank.id}`);
  }

  const runtimeResources = {
    schemaVersion: sourceResources.schemaVersion,
    version: sourceResources.version,
    files: newResourcesWithSource.map(({ sourceRelativePath: _sourceRelativePath, ...resource }) => resource),
  };
  const runtimeResourcePath = path.join(releaseRoot, 'resources/manifest.json');
  await writeJsonAtomic(runtimeResourcePath, runtimeResources);
  for (const resource of newResourcesWithSource) {
    const sourcePath = path.join(ROOT, 'content/question-banks/resources/files', resource.sourceRelativePath);
    const destinationPath = path.join(resourceRoot, resource.sourceRelativePath);
    await ensureDir(path.dirname(destinationPath));
    await fsp.copyFile(sourcePath, destinationPath);
    invariant((await sha256File(destinationPath)) === resource.checksum, `增量资源复制错误：${resource.objectKey}`);
  }
  const resourceChecksum = await sha256File(runtimeResourcePath);
  const incrementalManifest = {
    schemaVersion: 1,
    releaseVersion: TARGET_RELEASE_VERSION,
    releasedAt: fullManifest.releasedAt,
    banks: bankEntries,
    resources: {
      version: runtimeResources.version,
      file: 'resources/manifest.json',
      checksum: resourceChecksum,
      files: runtimeResources.files.length,
      sizeBytes: runtimeResources.files.reduce((sum, resource) => sum + resource.sizeBytes, 0),
    },
  };
  await writeJsonAtomic(path.join(releaseRoot, 'manifest.json'), incrementalManifest);

  const archivePath = path.join(GENERATED, `web-question-bank-release-v${TARGET_RELEASE_VERSION}.tar.gz`);
  await fsp.rm(archivePath, { force: true });
  await runProcess('tar', [
    '--no-mac-metadata',
    '--no-xattrs',
    '-czf',
    archivePath,
    '-C',
    INCREMENTAL_RELEASE_ROOT,
    'release',
    'resources',
  ], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const report = {
    schemaVersion: 1,
    status: 'incremental-release-built',
    releaseVersion: TARGET_RELEASE_VERSION,
    releaseRoot: path.relative(ROOT, INCREMENTAL_RELEASE_ROOT).split(path.sep).join('/'),
    archivePath: path.relative(ROOT, archivePath).split(path.sep).join('/'),
    archiveChecksum: await sha256File(archivePath),
    archiveSizeBytes: (await fsp.stat(archivePath)).size,
    banks: bankEntries.map((bank) => ({ id: bank.id, checksum: bank.checksum, cards: bank.cards, topics: bank.topics })),
    resources: runtimeResources.files.length,
    resourceBytes: incrementalManifest.resources.sizeBytes,
    resourceManifestChecksum: resourceChecksum,
  };
  await writeJsonAtomic(path.join(WORKSTREAM, 'reports/release-build.json'), report);
  console.log(JSON.stringify(report, null, 2));
}

async function verifyIncrementalRelease() {
  const releaseRoot = path.join(INCREMENTAL_RELEASE_ROOT, 'release');
  const resourceRoot = path.join(INCREMENTAL_RELEASE_ROOT, 'resources');
  const manifest = await readJson(path.join(releaseRoot, 'manifest.json'));
  invariant(manifest.releaseVersion === TARGET_RELEASE_VERSION, '增量发布版本错误。');
  invariant(
    JSON.stringify(manifest.banks.map((bank) => bank.id).sort()) ===
      JSON.stringify(['listening', 'radiotelephony', 'storytelling'].sort()),
    '增量发布题库范围错误。',
  );
  for (const bank of manifest.banks) {
    const bankPath = path.join(releaseRoot, bank.file);
    invariant((await sha256File(bankPath)) === bank.checksum, `增量发布题库 checksum 错误：${bank.id}`);
    const dataset = await readJson(bankPath);
    const cards = dataset.categories.reduce(
      (sum, category) => sum + category.topics.reduce((topicSum, topic) => topicSum + topic.cards.length, 0),
      0,
    );
    const topics = dataset.categories.reduce((sum, category) => sum + category.topics.length, 0);
    invariant(cards === bank.cards && topics === bank.topics, `增量发布题库统计错误：${bank.id}`);
  }
  const resourcesPath = path.join(releaseRoot, manifest.resources.file);
  invariant((await sha256File(resourcesPath)) === manifest.resources.checksum, '增量资源清单 checksum 错误。');
  const resources = await readJson(resourcesPath);
  invariant(resources.files.length === manifest.resources.files, '增量资源数量错误。');
  invariant(new Set(resources.files.map((resource) => resource.objectKey)).size === resources.files.length, '增量资源 objectKey 重复。');
  for (const resource of resources.files) {
    const sourceRelativePath = resource.publicPath.replace(/^\/question-bank-assets\//, '');
    invariant(sourceRelativePath !== resource.publicPath, `增量资源 publicPath 错误：${resource.objectKey}`);
    const filePath = path.join(resourceRoot, sourceRelativePath);
    invariant(await exists(filePath), `增量资源文件缺失：${resource.objectKey}`);
    invariant((await fsp.stat(filePath)).size === resource.sizeBytes, `增量资源大小错误：${resource.objectKey}`);
    invariant((await sha256File(filePath)) === resource.checksum, `增量资源 checksum 错误：${resource.objectKey}`);
  }
  const report = {
    schemaVersion: 1,
    status: 'incremental-release-verified',
    verifiedAt: new Date().toISOString(),
    releaseVersion: manifest.releaseVersion,
    banks: manifest.banks.map((bank) => ({ id: bank.id, cards: bank.cards, checksum: bank.checksum })),
    resources: resources.files.length,
    resourceBytes: resources.files.reduce((sum, resource) => sum + resource.sizeBytes, 0),
    manifestChecksum: await sha256File(path.join(releaseRoot, 'manifest.json')),
  };
  await writeJsonAtomic(path.join(WORKSTREAM, 'reports/release-verification.json'), report);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === 'freeze') await freeze();
  else if (command === 'verify-freeze') await verifyFreeze();
  else if (command === 'audit') await audit();
  else if (command === 'verify-audit') await verifyAudit();
  else if (command === 'prepare') await prepare();
  else if (command === 'verify-prepare') await verifyPrepare();
  else if (command === 'translation-status') await translationStatus();
  else if (command === 'verify-translations') await translationStatus({ requireAll: true });
  else if (command === 'merge-translations') await mergeTranslations();
  else if (command === 'final-dedupe') await finalGlobalDedupe();
  else if (command === 'build-review') await buildMigrateReview();
  else if (command === 'stage-formal') await stageFormalCandidates();
  else if (command === 'verify-staged') await verifyFormalCandidates({ applied: false });
  else if (command === 'apply-formal') await applyFormalCandidates();
  else if (command === 'verify-formal') await verifyFormalCandidates({ applied: true });
  else if (command === 'build-release') await buildIncrementalRelease();
  else if (command === 'verify-release') await verifyIncrementalRelease();
  else if (command === 'rollback-formal') {
    const manifest = await readJson(path.join(FORMAL_BACKUP_ROOT, 'manifest.json'));
    await restoreFormalBackup(manifest);
    console.log(JSON.stringify({ status: 'formal-backup-restored' }, null, 2));
  }
  else {
    console.error(
      'Usage: node tools/web-question-bank-content-migration.mjs <freeze|verify-freeze|audit|verify-audit|prepare|verify-prepare|translation-status|verify-translations|merge-translations|final-dedupe|build-review|stage-formal|verify-staged|apply-formal|verify-formal|rollback-formal|build-release|verify-release>',
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
