import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../../..');
const sourceProjectRoot = '/Users/zhouyide/Desktop/icao项目/feizhuicu';
const sourceDataPath = join(sourceProjectRoot, 'public/data/question-bank/mini-v1/opi/topics.json');
const sourceAssetRoot = join(sourceProjectRoot, 'public/question-bank');
const workstreamRoot = resolve(scriptDir, '..');
const sourceManifestPath = join(workstreamRoot, 'source-manifest.json');
const opiRoot = join(repoRoot, 'content/question-banks/banks/opi');
const resourceOverlayRoot = join(repoRoot, 'content/question-banks/resources/files');
const resourceManifestPath = join(repoRoot, 'content/question-banks/resources/manifest.source.json');
const registryPath = join(repoRoot, 'content/question-banks/registry.json');
const embeddedPath = join(repoRoot, 'src/features/question-bank/data/question-bank.json');

const categoryId = 'opi-category-08';
const expected = { topics: 23, imageCards: 23, questionCards: 64, cards: 87, resources: 87 };
const missingQuestionTranslations = {
  'opi-image-003-q03': '你还知道哪些其他跑道灯光设施？',
  'opi-image-018-q03': '如何避免这种情况？',
};

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function checksum(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function splitBilingual(value, id, field) {
  const [english = '', chinese = '', ...extra] = String(value ?? '').split('\n');
  assert(extra.every((line) => !line.trim()), `unexpected_multiline:${id}:${field}`);
  assert(english.trim(), `missing_english:${id}:${field}`);
  return { english: english.trim(), chinese: chinese.trim() };
}

function loadSourceTopics() {
  assert(existsSync(sourceDataPath), `source_data_missing:${sourceDataPath}`);
  const source = readJson(sourceDataPath);
  const topics = source.topics.filter((topic) => topic.catalog?.category === '图片题');
  assert(topics.length === expected.topics, `source_topic_count:${topics.length}`);
  return topics.sort((left, right) => left.catalog.displayOrder - right.catalog.displayOrder);
}

function targetResource(kind, sourceMediaPath) {
  const targetMediaPath = kind === 'audio'
    ? sourceMediaPath.replace(/^opi\/image-questions\/audio\//, 'opi/image-questions/')
    : sourceMediaPath;
  const sourceRelativePath = `${kind}/${targetMediaPath}`;
  const sourcePath = join(sourceAssetRoot, sourceMediaPath);
  assert(existsSync(sourcePath), `source_resource_missing:${sourceMediaPath}`);
  const publicPath = `/question-bank-assets/${sourceRelativePath}`;
  return {
    objectKey: `v2/${sourceRelativePath}`,
    bankId: 'opi',
    sourceRelativePath,
    publicPath,
    sizeBytes: statSync(sourcePath).size,
    mimeType: kind === 'images' ? 'image/jpeg' : 'audio/mpeg',
    checksum: checksum(sourcePath),
    status: 'ready',
    sourcePath,
  };
}

function transform() {
  const resourceKeys = new Set();
  const cardIds = new Set();
  const resources = [];
  const manifestTopics = [];
  let imageCards = 0;
  let questionCards = 0;

  const topics = loadSourceTopics().map((sourceTopic, topicIndex) => {
    const imageQuestion = sourceTopic.questions[0];
    assert(imageQuestion?.media?.image, `topic_image_missing:${sourceTopic.id}`);
    assert(sourceTopic.questions.length === sourceTopic.catalog.expectedCardCount, `source_topic_card_count:${sourceTopic.id}`);
    const imageResource = targetResource('images', imageQuestion.media.image);
    resources.push(imageResource);
    resourceKeys.add(imageResource.objectKey);
    imageCards += 1;

    const cards = [{
      id: imageQuestion.id,
      kind: 'image',
      taskTitle: '图片观察',
      image: imageResource.publicPath,
      imageAlt: `${sourceTopic.front.title}航空场景图片`,
    }];
    cardIds.add(imageQuestion.id);

    const manifestQuestions = [];
    for (const [questionIndex, sourceQuestion] of sourceTopic.questions.slice(1).entries()) {
      assert(sourceQuestion.media?.audio, `question_audio_missing:${sourceQuestion.id}`);
      assert(!cardIds.has(sourceQuestion.id), `duplicate_card_id:${sourceQuestion.id}`);
      cardIds.add(sourceQuestion.id);
      const prompt = splitBilingual(sourceQuestion.back?.audioText, sourceQuestion.id, 'audioText');
      const answer = splitBilingual(sourceQuestion.back?.referenceAnswer, sourceQuestion.id, 'referenceAnswer');
      const questionTranslation = prompt.chinese || missingQuestionTranslations[sourceQuestion.id];
      assert(questionTranslation, `missing_question_translation:${sourceQuestion.id}`);
      const audioResource = targetResource('audio', sourceQuestion.media.audio);
      assert(!resourceKeys.has(audioResource.objectKey), `duplicate_resource:${audioResource.objectKey}`);
      resourceKeys.add(audioResource.objectKey);
      resources.push(audioResource);
      questionCards += 1;
      cards.push({
        id: sourceQuestion.id,
        taskTitle: `图片题-${String(topicIndex + 1).padStart(3, '0')}-${String(questionIndex + 1).padStart(2, '0')}`,
        audioText: prompt.english,
        audioTextZh: questionTranslation,
        referenceText: answer.english,
        referenceTextZh: answer.chinese,
        audio: audioResource.publicPath,
      });
      manifestQuestions.push({
        sourceId: sourceQuestion.id,
        targetCardId: sourceQuestion.id,
        audio: {
          sourceRelativePath: sourceQuestion.media.audio,
          targetPublicPath: audioResource.publicPath,
          objectKey: audioResource.objectKey,
          sizeBytes: audioResource.sizeBytes,
          checksum: audioResource.checksum,
        },
        filledQuestionTranslation: !prompt.chinese,
      });
    }

    manifestTopics.push({
      sourceTopicId: sourceTopic.id,
      targetTopicId: sourceTopic.id,
      title: sourceTopic.front.title,
      displayOrder: topicIndex + 1,
      image: {
        sourceRelativePath: imageQuestion.media.image,
        targetPublicPath: imageResource.publicPath,
        objectKey: imageResource.objectKey,
        sizeBytes: imageResource.sizeBytes,
        checksum: imageResource.checksum,
      },
      questions: manifestQuestions,
    });

    return {
      categoryId,
      id: sourceTopic.id,
      name: sourceTopic.front.title,
      declaredCardCount: cards.length,
      cards,
    };
  });

  assert(imageCards === expected.imageCards, `image_card_count:${imageCards}`);
  assert(questionCards === expected.questionCards, `question_card_count:${questionCards}`);
  assert(resources.length === expected.resources, `resource_count:${resources.length}`);
  assert(cardIds.size === expected.cards, `card_id_count:${cardIds.size}`);

  return {
    category: {
      id: categoryId,
      name: '图片题',
      declaredTopicCount: topics.length,
      declaredCardCount: topics.reduce((count, topic) => count + topic.cards.length, 0),
      topicIds: topics.map((topic) => topic.id),
    },
    topics,
    resources,
    sourceManifest: {
      schemaVersion: 1,
      source: {
        project: 'feizhuicu',
        dataFile: 'public/data/question-bank/mini-v1/opi/topics.json',
        category: '图片题',
      },
      target: { bankId: 'opi', categoryId, releaseVersion: 2 },
      counts: expected,
      filledQuestionTranslations: Object.entries(missingQuestionTranslations).map(([cardId, translation]) => ({ cardId, translation })),
      topics: manifestTopics,
    },
  };
}

function audit() {
  const transformed = transform();
  writeJson(sourceManifestPath, transformed.sourceManifest);
  console.log(`image_question_audit_ok topics=${expected.topics} cards=${expected.cards} resources=${expected.resources}`);
  return transformed;
}

function updateEmbedded(category, topics) {
  const datasets = readJson(embeddedPath);
  const opi = datasets.find((dataset) => dataset.id === 'opi');
  assert(opi, 'embedded_opi_missing');
  const runtimeCategory = { ...category, topics };
  delete runtimeCategory.topicIds;
  const previous = opi.categories.find((item) => item.id === categoryId);
  opi.categories = [...opi.categories.filter((item) => item.id !== categoryId), runtimeCategory];
  opi.declaredTopicCount += topics.length - (previous?.declaredTopicCount ?? 0);
  opi.declaredCardCount += category.declaredCardCount - (previous?.declaredCardCount ?? 0);
  opi.summary = `${opi.declaredTopicCount} 话题 / ${opi.declaredCardCount} 卡`;
  writeJson(embeddedPath, datasets);
}

function apply() {
  const transformed = audit();
  const bankPath = join(opiRoot, 'bank.json');
  const bank = readJson(bankPath);
  const previousCategoryPath = join(opiRoot, 'categories', `${categoryId}.json`);
  const previousCategory = existsSync(previousCategoryPath) ? readJson(previousCategoryPath) : undefined;
  bank.categoryIds = [...bank.categoryIds.filter((id) => id !== categoryId), categoryId];
  bank.declaredTopicCount += transformed.topics.length - (previousCategory?.declaredTopicCount ?? 0);
  bank.declaredCardCount += transformed.category.declaredCardCount - (previousCategory?.declaredCardCount ?? 0);
  bank.summary = `${bank.declaredTopicCount} 话题 / ${bank.declaredCardCount} 卡`;
  writeJson(bankPath, bank);
  writeJson(previousCategoryPath, transformed.category);
  for (const topic of transformed.topics) writeJson(join(opiRoot, 'topics', `${topic.id}.json`), topic);

  for (const resource of transformed.resources) {
    const targetPath = join(resourceOverlayRoot, resource.sourceRelativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(resource.sourcePath, targetPath);
  }

  const resourceManifest = readJson(resourceManifestPath);
  const newResources = transformed.resources.map(({ sourcePath: _sourcePath, ...resource }) => resource);
  resourceManifest.version = 2;
  resourceManifest.files = [
    ...resourceManifest.files.filter((resource) => !resource.objectKey.startsWith('v2/images/opi/image-questions/') && !resource.objectKey.startsWith('v2/audio/opi/image-questions/')),
    ...newResources,
  ].sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  writeJson(resourceManifestPath, resourceManifest);
  rmSync(join(resourceOverlayRoot, 'audio/opi/image-questions/audio'), { recursive: true, force: true });

  const registry = readJson(registryPath);
  if (registry.releaseVersion !== 2) {
    assert(registry.releaseVersion === 1, `unexpected_release_version:${registry.releaseVersion}`);
    assert(process.env.IMAGE_QUESTION_RELEASED_AT, 'missing_IMAGE_QUESTION_RELEASED_AT');
    registry.releaseVersion = 2;
    registry.releasedAt = process.env.IMAGE_QUESTION_RELEASED_AT;
    writeJson(registryPath, registry);
  }

  updateEmbedded(transformed.category, transformed.topics);
  console.log(`image_question_apply_ok opi_topics=${bank.declaredTopicCount} opi_cards=${bank.declaredCardCount}`);
}

function verify() {
  const transformed = transform();
  const category = readJson(join(opiRoot, 'categories', `${categoryId}.json`));
  assert(category.declaredTopicCount === expected.topics, `target_topic_count:${category.declaredTopicCount}`);
  assert(category.declaredCardCount === expected.cards, `target_card_count:${category.declaredCardCount}`);
  for (const expectedTopic of transformed.topics) {
    const actualTopic = readJson(join(opiRoot, 'topics', `${expectedTopic.id}.json`));
    assert(JSON.stringify(actualTopic) === JSON.stringify(expectedTopic), `target_topic_mismatch:${expectedTopic.id}`);
  }
  for (const resource of transformed.resources) {
    const localPath = join(resourceOverlayRoot, resource.sourceRelativePath);
    assert(existsSync(localPath), `target_resource_missing:${resource.sourceRelativePath}`);
    assert(checksum(localPath) === resource.checksum, `target_resource_checksum:${resource.sourceRelativePath}`);
  }
  const bank = readJson(join(opiRoot, 'bank.json'));
  assert(bank.declaredTopicCount === 144, `target_opi_topics:${bank.declaredTopicCount}`);
  assert(bank.declaredCardCount === 1356, `target_opi_cards:${bank.declaredCardCount}`);
  const embeddedOpi = readJson(embeddedPath).find((dataset) => dataset.id === 'opi');
  assert(embeddedOpi?.declaredTopicCount === 144, `embedded_opi_topics:${embeddedOpi?.declaredTopicCount}`);
  assert(embeddedOpi?.declaredCardCount === 1356, `embedded_opi_cards:${embeddedOpi?.declaredCardCount}`);
  console.log(`image_question_verify_ok topics=${expected.topics} cards=${expected.cards} resources=${expected.resources}`);
}

const command = process.argv[2];
if (command === 'audit') audit();
else if (command === 'apply') apply();
else if (command === 'verify') verify();
else fail('usage: migrate-image-questions.mjs <audit|apply|verify>');
