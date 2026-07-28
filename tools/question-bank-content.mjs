import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'content/question-banks');
const banksRoot = join(contentRoot, 'banks');
const resourcesRoot = join(contentRoot, 'resources');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const embeddedAudioIndexPath = join(root, 'src/features/question-bank/data/audio-index.json');
const outputRoot = join(root, 'dist/question-bank-release');
const audioRoot = resolve(process.env.QUESTION_BANK_AUDIO_ROOT ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio');
const localAudioOverlayRoot = join(resourcesRoot, 'audio');
const localResourceOverlayRoot = join(resourcesRoot, 'files');
const allowedResourceMimeTypes = new Set(['audio/mpeg', 'image/jpeg', 'image/png']);
const legacyRadioDurationIndexPath = resolve(process.env.QUESTION_BANK_DURATION_INDEX ?? '/Users/zhouyide/Desktop/icao设计稿/lib/question-banks/assets/radio-duration-index.json');

const bankCapabilities = {
  listening: { audioMode: 'file', reviewMode: 'none', radioEligible: true, mockExamEligible: true },
  sentences900: { audioMode: 'file', reviewMode: 'exact-match', radioEligible: true, mockExamEligible: true },
  radiotelephony: { audioMode: 'file', reviewMode: 'grammar', radioEligible: false, mockExamEligible: true },
  opi: { audioMode: 'generated', reviewMode: 'expression-analysis', radioEligible: false, mockExamEligible: true },
  storytelling: { audioMode: 'file', reviewMode: 'grammar', radioEligible: true, mockExamEligible: true },
};

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonBytes(value));
}

function checksum(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileChecksum(path) {
  return checksum(readFileSync(path));
}

function resourceFilePath(sourceRelativePath) {
  const localResourcePath = join(localResourceOverlayRoot, sourceRelativePath);
  if (existsSync(localResourcePath)) return localResourcePath;
  const relativePath = sourceRelativePath.replace(/^audio\//, '');
  const localOverlayPath = join(localAudioOverlayRoot, relativePath);
  return existsSync(localOverlayPath) ? localOverlayPath : join(audioRoot, relativePath);
}

function assertString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`invalid_string:${field}`);
}

function assertUnique(set, id, path) {
  if (set.has(id)) fail(`duplicate_id:${id}:${path}`);
  set.add(id);
}

function sourceFilesFor(bankId, durationsByPath = new Map()) {
  const bankDir = join(banksRoot, bankId);
  const bank = readJson(join(bankDir, 'bank.json'));
  const categories = bank.categoryIds.map((categoryId) => {
    const category = readJson(join(bankDir, 'categories', `${categoryId}.json`));
    const topics = category.topicIds.map((topicId) => {
      const topic = readJson(join(bankDir, 'topics', `${topicId}.json`));
      if (topic.categoryId !== categoryId) fail(`topic_category_mismatch:${bankId}:${topicId}`);
      const { categoryId: _categoryId, ...runtimeTopic } = topic;
      return {
        ...runtimeTopic,
        cards: runtimeTopic.cards.map((card) => {
          if (!card.audio) return card;
          const duration = durationsByPath.get(card.audio);
          return duration ? { ...card, audioDurationSeconds: duration } : card;
        }),
      };
    });
    const { topicIds: _topicIds, ...runtimeCategory } = category;
    return { ...runtimeCategory, topics };
  });
  const { categoryIds: _categoryIds, ...runtimeBank } = bank;
  return { ...runtimeBank, categories };
}

function loadSources() {
  const registry = readJson(join(contentRoot, 'registry.json'));
  if (registry.schemaVersion !== 1) fail('unsupported_schema_version');
  if (!Number.isInteger(registry.releaseVersion) || registry.releaseVersion < 1) fail('invalid_release_version');
  const resources = readJson(join(resourcesRoot, 'manifest.source.json'));
  const durationsByPath = new Map(resources.files.filter((file) => file.durationSeconds > 0).map((file) => [file.publicPath, file.durationSeconds]));
  return { registry, banks: registry.bankIds.map((bankId) => sourceFilesFor(bankId, durationsByPath)), resources };
}

function validate({ registry, banks, resources }, { full = false } = {}) {
  const bankIds = new Set();
  const categoryIds = new Set();
  const topicIds = new Set();
  const cardIds = new Set();
  const referencedAudio = new Set();
  const referencedImages = new Set();
  let categoryCount = 0;
  let topicCount = 0;
  let cardCount = 0;

  for (const bank of banks) {
    assertString(bank.id, 'bank.id');
    assertUnique(bankIds, bank.id, bank.id);
    if (!bankCapabilities[bank.id]) fail(`unsupported_bank:${bank.id}`);
    if (!bank.capabilities || typeof bank.capabilities !== 'object') fail(`missing_capabilities:${bank.id}`);
    let bankTopics = 0;
    let bankCards = 0;
    for (const category of bank.categories) {
      assertString(category.id, `${bank.id}.category.id`);
      assertUnique(categoryIds, category.id, `${bank.id}/${category.id}`);
      categoryCount += 1;
      let categoryCards = 0;
      if (category.topics.length !== category.declaredTopicCount) fail(`category_topic_count:${bank.id}:${category.id}`);
      for (const topic of category.topics) {
        assertString(topic.id, `${bank.id}/${category.id}.topic.id`);
        assertUnique(topicIds, topic.id, `${bank.id}/${category.id}/${topic.id}`);
        topicCount += 1;
        bankTopics += 1;
        if (topic.cards.length !== topic.declaredCardCount) fail(`topic_card_count:${bank.id}:${topic.id}`);
        for (const card of topic.cards) {
          assertString(card.id, `${bank.id}/${topic.id}.card.id`);
          assertString(card.taskTitle, `${bank.id}/${topic.id}/${card.id}.taskTitle`);
          assertUnique(cardIds, card.id, `${bank.id}/${category.id}/${topic.id}/${card.id}`);
          if (card.kind === 'image') {
            assertString(card.image, `${bank.id}/${topic.id}/${card.id}.image`);
            assertString(card.imageAlt, `${bank.id}/${topic.id}/${card.id}.imageAlt`);
            if (card.audioText !== undefined || card.audio !== undefined || card.referenceText !== undefined || card.referenceTextZh !== undefined || card.choices !== undefined || card.choicesZh !== undefined) fail(`invalid_image_card_fields:${card.id}`);
            referencedImages.add(card.image);
          } else {
            if (card.kind !== undefined && card.kind !== 'text') fail(`unsupported_card_kind:${card.id}`);
            assertString(card.audioText, `${bank.id}/${topic.id}/${card.id}.audioText`);
            if (card.image !== undefined || card.imageAlt !== undefined) fail(`invalid_text_card_fields:${card.id}`);
          }
          if (card.choices) {
            if (!Array.isArray(card.choices) || card.choices.length < 2) fail(`invalid_choices:${card.id}`);
            if (!Number.isInteger(card.correctChoiceIndex) || card.correctChoiceIndex < 0 || card.correctChoiceIndex >= card.choices.length) fail(`invalid_correct_choice:${card.id}`);
            if (card.choicesZh !== undefined) {
              if (!Array.isArray(card.choicesZh) || card.choicesZh.length !== card.choices.length) fail(`invalid_choices_zh_count:${card.id}`);
              if (card.choicesZh.some((choice) => typeof choice !== 'string' || !choice.trim())) fail(`invalid_choices_zh_text:${card.id}`);
            }
            if (bank.id === 'listening' && card.choicesZh === undefined) fail(`missing_choices_zh:${card.id}`);
          } else if (card.choicesZh !== undefined) {
            fail(`orphan_choices_zh:${card.id}`);
          }
          if (card.audio) {
            referencedAudio.add(card.audio);
            if (bank.capabilities.radioEligible && !(card.audioDurationSeconds > 0)) fail(`radio_duration_missing:${bank.id}:${card.id}`);
          }
          categoryCards += 1;
          bankCards += 1;
          cardCount += 1;
        }
      }
      if (categoryCards !== category.declaredCardCount) fail(`category_card_count:${bank.id}:${category.id}`);
    }
    if (bankTopics !== bank.declaredTopicCount) fail(`bank_topic_count:${bank.id}`);
    if (bankCards !== bank.declaredCardCount) fail(`bank_card_count:${bank.id}`);
  }

  if (registry.bankIds.length !== bankIds.size) fail('registry_bank_count');
  if (resources.schemaVersion !== 1 || !Array.isArray(resources.files)) fail('invalid_resource_manifest');
  const objectKeys = new Set();
  const publicPaths = new Set();
  let resourceBytes = 0;
  for (const file of resources.files) {
    assertUnique(objectKeys, file.objectKey, file.objectKey);
    assertUnique(publicPaths, file.publicPath, file.publicPath);
    if (!bankIds.has(file.bankId)) fail(`resource_bank_missing:${file.objectKey}`);
    if (!allowedResourceMimeTypes.has(file.mimeType)) fail(`resource_mime_type:${file.objectKey}`);
    if (file.publicPath !== `/question-bank-assets/${file.sourceRelativePath}`) fail(`resource_public_path:${file.objectKey}`);
    if (file.mimeType === 'audio/mpeg' && !file.sourceRelativePath.startsWith('audio/')) fail(`resource_audio_path:${file.objectKey}`);
    if (file.mimeType.startsWith('image/') && !file.sourceRelativePath.startsWith('images/')) fail(`resource_image_path:${file.objectKey}`);
    if (file.durationSeconds !== undefined && (!(file.durationSeconds > 0) || !Number.isFinite(file.durationSeconds))) fail(`resource_duration:${file.objectKey}`);
    if (!/^[a-f0-9]{64}$/.test(file.checksum)) fail(`resource_checksum:${file.objectKey}`);
    const localPath = resourceFilePath(file.sourceRelativePath);
    if (!existsSync(localPath)) fail(`resource_file_missing:${file.sourceRelativePath}`);
    const size = statSync(localPath).size;
    if (size !== file.sizeBytes) fail(`resource_size_mismatch:${file.objectKey}`);
    if (full && fileChecksum(localPath) !== file.checksum) fail(`resource_hash_mismatch:${file.objectKey}`);
    resourceBytes += size;
  }
  for (const path of referencedAudio) if (!publicPaths.has(path)) fail(`card_resource_missing:${path}`);
  for (const path of referencedImages) if (!publicPaths.has(path)) fail(`card_resource_missing:${path}`);

  return {
    banks: bankIds.size,
    categories: categoryCount,
    topics: topicCount,
    cards: cardCount,
    referencedAudio: referencedAudio.size,
    referencedImages: referencedImages.size,
    resources: resources.files.length,
    resourceBytes,
  };
}

function mediaDuration(path) {
  const value = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], { encoding: 'utf8' }).trim();
  const duration = Number(value);
  if (!(duration > 0) || !Number.isFinite(duration)) fail(`duration_probe_failed:${path}`);
  return Math.round(duration * 1000) / 1000;
}

function syncDurations() {
  const registry = readJson(join(contentRoot, 'registry.json'));
  const resources = readJson(join(resourcesRoot, 'manifest.source.json'));
  const eligibleAudioPaths = new Set(
    registry.bankIds
      .map((bankId) => sourceFilesFor(bankId))
      .filter((bank) => bank.capabilities?.radioEligible)
      .flatMap((bank) => bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.map((card) => card.audio).filter(Boolean)))),
  );
  const legacyDurations = existsSync(legacyRadioDurationIndexPath)
    ? new Map(readJson(legacyRadioDurationIndexPath).tracks.map((track) => [track.audio, track.duration]))
    : new Map();
  let imported = 0;
  let probed = 0;
  let preserved = 0;
  const files = resources.files.map((file) => {
    if (!eligibleAudioPaths.has(file.publicPath)) return file;
    if (file.durationSeconds > 0) {
      preserved += 1;
      return file;
    }
    const legacy = legacyDurations.get(file.publicPath);
    if (legacy > 0) {
      imported += 1;
      return { ...file, durationSeconds: Math.round(legacy * 1000) / 1000 };
    }
    probed += 1;
    return { ...file, durationSeconds: mediaDuration(resourceFilePath(file.sourceRelativePath)) };
  });
  const covered = files.filter((file) => eligibleAudioPaths.has(file.publicPath) && file.durationSeconds > 0).length;
  if (covered !== eligibleAudioPaths.size) fail(`duration_coverage:${covered}/${eligibleAudioPaths.size}`);
  const changed = imported + probed > 0;
  writeJson(join(resourcesRoot, 'manifest.source.json'), {
    ...resources,
    version: changed ? resources.version + 1 : resources.version,
    files,
  });
  console.log(`content_audio_durations_ok tracks=${eligibleAudioPaths.size} imported=${imported} probed=${probed} preserved=${preserved}`);
}

function extract({ force = false } = {}) {
  if (existsSync(join(contentRoot, 'registry.json')) && !force) fail('content_already_extracted_use_--force');
  const embedded = readJson(embeddedPath);
  const audioIndex = readJson(embeddedAudioIndexPath);
  mkdirSync(banksRoot, { recursive: true });

  writeJson(join(contentRoot, 'registry.json'), {
    schemaVersion: 1,
    releaseVersion: 1,
    releasedAt: '2026-07-12T00:00:00.000Z',
    bankIds: embedded.map((bank) => bank.id),
    resourceModuleAliases: { sentence900: 'sentences900' },
  });

  for (const dataset of embedded) {
    const bankDir = join(banksRoot, dataset.id);
    const { categories, ...metadata } = dataset;
    writeJson(join(bankDir, 'bank.json'), {
      ...metadata,
      capabilities: bankCapabilities[dataset.id],
      categoryIds: categories.map((category) => category.id),
    });
    for (const category of categories) {
      const { topics, ...categoryMetadata } = category;
      writeJson(join(bankDir, 'categories', `${category.id}.json`), {
        ...categoryMetadata,
        topicIds: topics.map((topic) => topic.id),
      });
      for (const topic of topics) writeJson(join(bankDir, 'topics', `${topic.id}.json`), { categoryId: category.id, ...topic });
    }
  }

  const aliases = { sentence900: 'sentences900' };
  const files = [];
  for (const [moduleId, moduleValue] of Object.entries(audioIndex.modules)) {
    const groups = moduleValue.groups ?? moduleValue;
    for (const entries of Object.values(groups)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const publicPath = entry.file;
        const sourceRelativePath = publicPath.replace(/^\/question-bank-assets\//, '');
        const localPath = resourceFilePath(sourceRelativePath);
        if (!existsSync(localPath)) fail(`extract_resource_missing:${sourceRelativePath}`);
        files.push({
          objectKey: `v1/${sourceRelativePath}`,
          bankId: aliases[moduleId] ?? moduleId,
          sourceRelativePath,
          publicPath,
          sizeBytes: statSync(localPath).size,
          mimeType: 'audio/mpeg',
          checksum: fileChecksum(localPath),
          status: 'ready',
        });
      }
    }
  }
  files.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  writeJson(join(resourcesRoot, 'manifest.source.json'), { schemaVersion: 1, version: 1, files });
  console.log(`content_extracted banks=${embedded.length} resources=${files.length}`);
}

function artifactsFromSources(sources) {
  const stats = validate(sources);
  const files = new Map();
  const bankManifest = [];
  for (const bank of sources.banks) {
    const path = `banks/${bank.id}.json`;
    const bytes = jsonBytes(bank);
    files.set(path, bytes);
    bankManifest.push({
      id: bank.id,
      version: sources.registry.releaseVersion,
      file: path,
      checksum: checksum(bytes),
      categories: bank.categories.length,
      topics: bank.categories.reduce((count, category) => count + category.topics.length, 0),
      cards: bank.categories.reduce((count, category) => count + category.topics.reduce((total, topic) => total + topic.cards.length, 0), 0),
    });
  }
  const runtimeResources = {
    schemaVersion: sources.resources.schemaVersion,
    version: sources.resources.version,
    files: sources.resources.files.map(({ sourceRelativePath: _sourceRelativePath, ...file }) => file),
  };
  const resourceBytes = jsonBytes(runtimeResources);
  files.set('resources/manifest.json', resourceBytes);
  const manifest = {
    schemaVersion: sources.registry.schemaVersion,
    releaseVersion: sources.registry.releaseVersion,
    releasedAt: sources.registry.releasedAt,
    banks: bankManifest,
    resources: { version: runtimeResources.version, file: 'resources/manifest.json', checksum: checksum(resourceBytes), files: stats.resources, sizeBytes: stats.resourceBytes },
  };
  files.set('manifest.json', jsonBytes(manifest));

  const changes = sources.banks.map((bank) => ({ bankId: bank.id, added: 0, removed: 0, modified: 0 }));
  files.set('change-report.json', jsonBytes({ base: 'maintenance-source', releaseVersion: sources.registry.releaseVersion, changes }));
  return { files, stats };
}

function build() {
  const sources = loadSources();
  const generated = artifactsFromSources(sources);
  const temporary = `${outputRoot}.tmp`;
  rmSync(temporary, { recursive: true, force: true });
  for (const [path, bytes] of generated.files) {
    const target = join(temporary, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  rmSync(outputRoot, { recursive: true, force: true });
  renameSync(temporary, outputRoot);
  writeJson(embeddedPath, sources.banks);
  console.log(`content_built ${JSON.stringify(generated.stats)}`);
}

function check({ full = false } = {}) {
  const generated = artifactsFromSources(loadSources());
  if (!existsSync(outputRoot)) fail('release_output_missing_run_content_build');
  const actualFiles = [];
  function walk(path) {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else actualFiles.push(relative(outputRoot, child));
    }
  }
  walk(outputRoot);
  const expectedFiles = [...generated.files.keys()].sort();
  if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(expectedFiles)) fail('release_file_set_mismatch');
  for (const [path, bytes] of generated.files) if (!readFileSync(join(outputRoot, path)).equals(bytes)) fail(`generated_file_modified:${path}`);
  const stats = validate(loadSources(), { full });
  console.log(`content_check_ok full=${full} ${JSON.stringify(stats)}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'extract') extract({ force: args.includes('--force') });
else if (command === 'build') build();
else if (command === 'check') check({ full: args.includes('--full') });
else if (command === 'sync-durations') syncDurations();
else fail('usage: question-bank-content.mjs <extract|build|check|sync-durations> [--force|--full]');
