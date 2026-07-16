import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSTREAM = path.join(ROOT, 'docs/workstreams/web-question-bank-content-migration');
const GENERATED = path.join(ROOT, '.generated/web-question-bank-content-migration');
const SNAPSHOT = path.join(GENERATED, 'source-snapshot');
const BASELINE_RT_ROOT = path.join(GENERATED, 'formal-backup/repo/content/question-banks/banks/radiotelephony');
const APP_RT_ROOT = path.join(ROOT, 'content/question-banks/banks/radiotelephony');
const RESOURCES_ROOT = path.join(ROOT, 'content/question-banks/resources/files');
const RESOURCE_MANIFEST = path.join(ROOT, 'content/question-banks/resources/manifest.source.json');
const EMBEDDED_PATH = path.join(ROOT, 'src/features/question-bank/data/question-bank.json');
const REGISTRY_PATH = path.join(ROOT, 'content/question-banks/registry.json');
const MAPPING_PATH = path.join(WORKSTREAM, 'decisions/source-app-mapping.json');
const REPORT_JSON = path.join(WORKSTREAM, 'reports/radiotelephony-scene-unit-correction.json');
const REPORT_MD = path.join(WORKSTREAM, 'reports/radiotelephony-scene-unit-correction.md');

const RELEASE_VERSION = 6;
const AUDIO_ROOT = 'audio/radiotelephony/web-v6';

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

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fsp.rename(temp, filePath);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(await fsp.readFile(filePath));
  return hash.digest('hex');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
}

function scenarioNumber(topicId) {
  return Number(topicId.match(/atc-scenario-(\d{4})/)?.[1] ?? 0);
}

function sourceQuestionNumber(sourceId) {
  return Number(sourceId.match(/-q(\d+)$/)?.[1] ?? 0);
}

function safeSourceId(sourceId) {
  return sourceId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function sceneLabels(text) {
  const rules = [
    [/balloon|气球/i, '撞气球'],
    [/bomb|bomb squad|unknown bag|unclaimed bag|first[- ]class cabin|炸弹|无人认领/i, '可疑炸弹/无人认领行李'],
    [/control surfaces?|difficult to control|large hole|wing|控制面|机翼/i, '机翼/控制面损坏'],
    [/bird strike|bird ingestion|bird|鸟击/i, '鸟击'],
    [/windshield|windscreen|window crack|crack.*window|风挡|裂纹/i, '风挡裂纹'],
    [/engine fire|fire.*engine|engine.*fire/i, '发动机起火'],
    [/engine failure|engine fail|failed engine|flameout|lost power|shut down|熄火|发动机失效/i, '发动机失效'],
    [/hydraulic|液压/i, '液压问题'],
    [/landing gear|nose wheel|main gear|gear|起落架|前轮|主轮/i, '起落架问题'],
    [/flap|襟翼/i, '襟翼问题'],
    [/slat|缝翼/i, '缝翼问题'],
    [/fuel leak|leak.*fuel|fuel.*leak|漏油/i, '燃油泄漏'],
    [/fuel emergency|minimum fuel|燃油紧急/i, '燃油紧急'],
    [/brake|刹车/i, '刹车问题'],
    [/turbulence|颠簸/i, '颠簸'],
    [/thunderstorm|cumulonimbus|weather radar|CB|C B|雷暴|天气雷达/i, '雷暴绕飞'],
    [/icing|anti[- ]ice|de-ice|ice|积冰|防冰/i, '积冰/防冰'],
    [/smoke|fume|烟雾/i, '烟雾'],
    [/heart attack|stroke|medical|sick passenger|stretcher|心脏|中风|担架/i, '乘客医疗'],
    [/depressur|pressuri|释压|增压/i, '增压问题'],
    [/TCAS|RA|TA/i, 'TCAS机动'],
    [/runway excursion|excursion|skid off|滑出跑道/i, '滑出跑道'],
    [/missed approach|go around|复飞/i, '复飞'],
    [/divert|return to land|return.*airport|备降|返航/i, '备降/返航'],
    [/radio|communication|transmitter|receiver|通讯|接收机|发射机/i, '通讯问题'],
    [/navigation|GPS|autopilot|导航|自动驾驶/i, '导航/自动驾驶问题'],
    [/emergency door|door|舱门|应急门/i, '舱门问题'],
    [/cargo|dangerous goods|危险品/i, '危险品'],
    [/delay|refuel|延误|加油/i, '延误/加油'],
  ];
  const labels = [];
  for (const [pattern, label] of rules) {
    if (pattern.test(text) && !labels.includes(label)) labels.push(label);
    if (labels.length >= 3) break;
  }
  return labels;
}

async function loadGraph(root) {
  const bank = await readJson(path.join(root, 'bank.json'));
  const categories = new Map();
  const topics = new Map();
  for (const categoryId of bank.categoryIds) {
    const category = await readJson(path.join(root, 'categories', `${categoryId}.json`));
    categories.set(categoryId, category);
    for (const topicId of category.topicIds) {
      topics.set(topicId, await readJson(path.join(root, 'topics', `${topicId}.json`)));
    }
  }
  return { bank, categories, topics };
}

function refreshCounts(graph) {
  let topics = 0;
  let cards = 0;
  for (const categoryId of graph.bank.categoryIds) {
    const category = graph.categories.get(categoryId);
    category.declaredTopicCount = category.topicIds.length;
    category.declaredCardCount = 0;
    for (const topicId of category.topicIds) {
      const topic = graph.topics.get(topicId);
      topic.declaredCardCount = topic.cards.length;
      category.declaredCardCount += topic.cards.length;
    }
    topics += category.declaredTopicCount;
    cards += category.declaredCardCount;
  }
  graph.bank.declaredTopicCount = topics;
  graph.bank.declaredCardCount = cards;
  graph.bank.summary = `${topics} 场景 / ${cards} 卡`;
}

function embeddedFromGraph(graph) {
  const { categoryIds, capabilities: _capabilities, ...bank } = graph.bank;
  return {
    ...bank,
    categories: graph.bank.categoryIds.map((categoryId) => {
      const { topicIds, ...category } = graph.categories.get(categoryId);
      return {
        ...category,
        topics: topicIds.map((topicId) => {
          const { categoryId: _categoryId, ...topic } = graph.topics.get(topicId);
          return topic;
        }),
      };
    }),
  };
}

async function writeGraph(graph) {
  await writeJson(path.join(APP_RT_ROOT, 'bank.json'), graph.bank);
  await fsp.rm(path.join(APP_RT_ROOT, 'categories'), { recursive: true, force: true });
  await fsp.rm(path.join(APP_RT_ROOT, 'topics'), { recursive: true, force: true });
  await fsp.mkdir(path.join(APP_RT_ROOT, 'categories'), { recursive: true });
  await fsp.mkdir(path.join(APP_RT_ROOT, 'topics'), { recursive: true });
  for (const category of graph.categories.values()) {
    await writeJson(path.join(APP_RT_ROOT, 'categories', `${category.id}.json`), category);
  }
  for (const topic of [...graph.topics.values()].sort((a, b) => scenarioNumber(a.id) - scenarioNumber(b.id))) {
    await writeJson(path.join(APP_RT_ROOT, 'topics', `${topic.id}.json`), topic);
  }
}

async function prepareAudio(decision, publicPath) {
  const sourcePath = path.join(SNAPSHOT, decision.sourceAudioPath);
  const sourceRelativePath = publicPath.replace('/question-bank-assets/', '');
  const targetPath = path.join(RESOURCES_ROOT, sourceRelativePath);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await exists(targetPath))) {
    const temp = `${targetPath}.tmp-${process.pid}.mp3`;
    if (decision.sourceAudioFormat === 'mp3') {
      await fsp.copyFile(sourcePath, temp);
    } else {
      await run('ffmpeg', [
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
        temp,
      ]);
    }
    await fsp.rename(temp, targetPath);
  }
  const stat = await fsp.stat(targetPath);
  return {
    objectKey: `v6/${sourceRelativePath}`,
    bankId: 'radiotelephony',
    sourceRelativePath,
    publicPath,
    mimeType: 'audio/mpeg',
    status: 'ready',
    sizeBytes: stat.size,
    checksum: await sha256File(targetPath),
  };
}

function oldCardsById(graph) {
  const cards = new Map();
  for (const topic of graph.topics.values()) {
    for (const card of topic.cards) cards.set(card.id, card);
  }
  return cards;
}

function makeCard({ decision, prepared, oldCard, fallbackCard, topicId, cardNumber, taskTitle, publicPath }) {
  if (prepared?.card) {
    return {
      ...prepared.card,
      id: `${topicId}-card-main-${String(cardNumber).padStart(4, '0')}`,
      taskTitle,
      audio: publicPath,
    };
  }
  const referenceCard = oldCard ?? fallbackCard;
  invariant(referenceCard, `缺少重复卡片中文参考：${decision.sourceId}`);
  return {
    id: `${topicId}-card-main-${String(cardNumber).padStart(4, '0')}`,
    taskTitle,
    audioText: referenceCard.audioText,
    audioTextZh: referenceCard.audioTextZh,
    referenceText: referenceCard.referenceText,
    referenceTextZh: referenceCard.referenceTextZh,
    audio: publicPath,
  };
}

async function main() {
  const graph = await loadGraph(BASELINE_RT_ROOT);
  invariant(graph.bank.declaredTopicCount === 107, '旧陆空通话基线场景数不是 107。');
  invariant(graph.bank.declaredCardCount === 1851, '旧陆空通话基线卡片数不是 1851。');
  const oldCardMap = oldCardsById(graph);

  const preparedPayload = await readJson(path.join(GENERATED, 'prepared-candidates.json'));
  const preparedBySource = new Map(preparedPayload.records.map((record) => [record.sourceId, record]));
  const finalPayload = await readJson(path.join(WORKSTREAM, 'decisions/final-global-dedupe.json'));
  const finalBySource = new Map(finalPayload.records.map((record) => [record.sourceId, record]));
  const decisionPayload = await readJson(path.join(WORKSTREAM, 'decisions/candidate-decisions.json'));
  const oldMapping = await readJson(MAPPING_PATH);

  const sceneContainers = new Set(
    preparedPayload.records
      .filter((record) => record.kind === 'radiotelephony')
      .filter((record) => finalBySource.get(record.sourceId) && !finalBySource.get(record.sourceId).finalDecision.startsWith('exclude-'))
      .map((record) => record.sourceContainerId),
  );
  invariant(sceneContainers.size === 79, `应修正 79 个 Web 场景，实际 ${sceneContainers.size}。`);
  const scopedDecisions = decisionPayload.records
    .filter((record) => record.kind === 'radiotelephony' && sceneContainers.has(record.sourceContainerId))
    .sort((left, right) =>
      left.sourceJsonPath.localeCompare(right.sourceJsonPath, 'en') ||
      sourceQuestionNumber(left.sourceId) - sourceQuestionNumber(right.sourceId)
    );
  invariant(scopedDecisions.length === 1367, `完整 Web 场景卡片应为 1367，实际 ${scopedDecisions.length}。`);
  const decisionsBySource = new Map(scopedDecisions.map((record) => [record.sourceId, record]));

  const groups = new Map();
  for (const decision of scopedDecisions) {
    if (!groups.has(decision.sourceContainerId)) groups.set(decision.sourceContainerId, []);
    groups.get(decision.sourceContainerId).push(decision);
  }

  const newResources = [];
  const newMappings = new Map();
  const sceneReports = [];
  const generatedCardBySource = new Map();
  let nextScenario = 108;
  let nextCardNumber = 1852;

  for (const [containerId, decisions] of [...groups.entries()].sort(([, left], [, right]) =>
    left[0].sourceJsonPath.localeCompare(right[0].sourceJsonPath, 'en')
  )) {
    const sourceScene = await readJson(path.join(SNAPSHOT, decisions[0].sourceJsonPath));
    const sourceIds = sourceScene.items.map((item) => item.id);
    invariant(
      sourceIds.length === decisions.length && sourceIds.every((sourceId) => decisionsBySource.has(sourceId)),
      `Web 场景未完整纳入：${containerId}`,
    );
    const first = decisions[0];
    const topicId = `atc-scenario-${String(nextScenario).padStart(4, '0')}`;
    nextScenario += 1;
    const fullSceneText = [
      sourceScene.background,
      ...sourceScene.items.map((item) => `${item.audioText} ${item.referenceText}`),
    ].join('\n');
    const labels = sceneLabels(fullSceneText);
    const topicName = labels.length ? `${first.classification.display} ${labels.join(' ')}` : first.classification.display;
    const cards = [];
    const sceneMappings = [];
    for (const sourceId of sourceIds) {
      const decision = decisionsBySource.get(sourceId);
      const prepared = preparedBySource.get(sourceId);
      const oldCard = decision.closestMatch?.origin === 'app' ? oldCardMap.get(decision.closestMatch.id) : undefined;
      const fallbackCard = decision.closestMatch?.origin === 'web' ? generatedCardBySource.get(decision.closestMatch.id) : undefined;
      const publicPath = `/question-bank-assets/${AUDIO_ROOT}/${safeSourceId(sourceId)}.mp3`;
      const card = makeCard({
        decision,
        prepared,
        oldCard,
        fallbackCard,
        topicId,
        cardNumber: nextCardNumber,
        taskTitle: `${first.classification.display}-${cards.length + 1}`,
        publicPath,
      });
      cards.push(card);
      generatedCardBySource.set(sourceId, card);
      const resource = await prepareAudio(decision, publicPath);
      newResources.push(resource);
      sceneMappings.push({
        webSourceId: sourceId,
        appNewId: card.id,
        appAudioPath: publicPath,
        targetDirectory: `content/question-banks/banks/radiotelephony/topics/${topicId}.json`,
        targetTopicId: topicId,
        finalTaskTitle: card.taskTitle,
        audioObjectKey: resource.objectKey,
      });
      nextCardNumber += 1;
    }
    const topic = {
      categoryId: first.classification.targetCategoryId,
      id: topicId,
      name: topicName,
      declaredCardCount: cards.length,
      cards,
    };
    graph.topics.set(topicId, topic);
    const category = graph.categories.get(topic.categoryId);
    invariant(category, `缺少分类：${topic.categoryId}`);
    category.topicIds.push(topicId);
    const previousTargetDirectories = [
      ...new Set(
        oldMapping.records
          .filter((record) => record.kind === 'radiotelephony' && record.webContainerId === containerId && record.targetDirectory)
          .map((record) => record.targetDirectory),
      ),
    ].sort();
    sceneReports.push({
      webContainerId: containerId,
      sourceJsonPath: first.sourceJsonPath,
      newTopicId: topicId,
      newTopicName: topicName,
      categoryId: topic.categoryId,
      cardCount: cards.length,
      previousTargetDirectories,
      cards: sceneMappings,
    });
    for (const item of sceneMappings) newMappings.set(item.webSourceId, item);
  }

  for (const category of graph.categories.values()) {
    category.topicIds = [...new Set(category.topicIds)].sort((left, right) => scenarioNumber(left) - scenarioNumber(right));
  }
  refreshCounts(graph);
  invariant(graph.bank.declaredTopicCount === 186, `最终陆空通话场景应为 186，实际 ${graph.bank.declaredTopicCount}。`);
  invariant(graph.bank.declaredCardCount === 3218, `最终陆空通话卡片应为 3218，实际 ${graph.bank.declaredCardCount}。`);

  const resourceManifest = await readJson(RESOURCE_MANIFEST);
  resourceManifest.version += 1;
  resourceManifest.files = resourceManifest.files.filter(
    (resource) => !(resource.bankId === 'radiotelephony' && resource.objectKey.startsWith('v5/audio/radiotelephony/web-v5/')),
  );
  const existingObjectKeys = new Set(resourceManifest.files.map((resource) => resource.objectKey));
  const existingPublicPaths = new Set(resourceManifest.files.map((resource) => resource.publicPath));
  for (const resource of newResources) {
    invariant(!existingObjectKeys.has(resource.objectKey), `资源 objectKey 冲突：${resource.objectKey}`);
    invariant(!existingPublicPaths.has(resource.publicPath), `资源 publicPath 冲突：${resource.publicPath}`);
    existingObjectKeys.add(resource.objectKey);
    existingPublicPaths.add(resource.publicPath);
    resourceManifest.files.push(resource);
  }
  resourceManifest.files.sort((left, right) => left.objectKey.localeCompare(right.objectKey, 'en'));

  await writeGraph(graph);
  await writeJson(RESOURCE_MANIFEST, resourceManifest);

  const registry = await readJson(REGISTRY_PATH);
  registry.releaseVersion = RELEASE_VERSION;
  registry.releasedAt = new Date().toISOString();
  await writeJson(REGISTRY_PATH, registry);

  const embedded = await readJson(EMBEDDED_PATH);
  const bankIndex = embedded.findIndex((bank) => bank.id === 'radiotelephony');
  invariant(bankIndex >= 0, '内嵌题库缺少陆空通话。');
  embedded[bankIndex] = embeddedFromGraph(graph);
  await writeJson(EMBEDDED_PATH, embedded);

  const updatedMapping = structuredClone(oldMapping);
  updatedMapping.releaseVersion = RELEASE_VERSION;
  updatedMapping.records = updatedMapping.records.map((record) => {
    if (!(record.kind === 'radiotelephony' && sceneContainers.has(record.webContainerId))) return record;
    const mapped = newMappings.get(record.webSourceId);
    invariant(mapped, `完整场景映射缺失：${record.webSourceId}`);
    return {
      ...record,
      decision: 'migrate-scene-unit',
      appNewId: mapped.appNewId,
      targetDirectory: mapped.targetDirectory,
      targetTopicId: mapped.targetTopicId,
      appAudioPath: mapped.appAudioPath,
      audioObjectKey: mapped.audioObjectKey,
      finalDecision: 'migrate-scene-unit',
      finalTaskTitle: mapped.finalTaskTitle,
    };
  });
  updatedMapping.sceneUnitCorrection = {
    rule: 'web-radiotelephony-container-all-or-none',
    releaseVersion: RELEASE_VERSION,
    webScenarios: sceneReports.length,
    cards: scopedDecisions.length,
    previousAddedCardsRemoved: 677,
    previousWronglyExtendedExistingScenes: 69,
  };
  await writeJson(MAPPING_PATH, updatedMapping);

  const report = {
    schemaVersion: 1,
    generatedAt: registry.releasedAt,
    releaseVersion: RELEASE_VERSION,
    rule: 'web-radiotelephony-container-all-or-none',
    baseline: { topics: 107, cards: 1851 },
    added: { webScenarios: sceneReports.length, cards: scopedDecisions.length },
    final: { topics: graph.bank.declaredTopicCount, cards: graph.bank.declaredCardCount },
    resources: { removedWebV5: 677, addedWebV6: newResources.length, manifestFiles: resourceManifest.files.length },
    records: sceneReports,
  };
  await writeJson(REPORT_JSON, report);
  const rows = sceneReports.map((record) =>
    `| ${record.newTopicId} | ${record.newTopicName} | ${record.cardCount} | ${record.previousTargetDirectories.map((item) => item.replace('content/question-banks/banks/radiotelephony/topics/', '')).join('<br>') || '-'} | ${record.sourceJsonPath} |`
  );
  await fsp.writeFile(REPORT_MD, [
    '# 陆空通话完整场景迁移修正报告',
    '',
    '- 规则：Web 陆空通话原始场景为最小迁移单元，一个场景只能全加或全不加。',
    '- 处理：恢复迁移前 107 个旧场景，撤销之前向旧场景追加的 677 张卡，再按 79 个 Web 场景完整新增。',
    `- 修正后：${graph.bank.declaredTopicCount} 场景 / ${graph.bank.declaredCardCount} 卡。`,
    '',
    '| 新场景 | 场景名 | 卡片 | 此前误写入的旧场景 | Web 来源 |',
    '| --- | --- | ---: | --- | --- |',
    ...rows,
    '',
  ].join('\n'));

  console.log(`radiotelephony_scene_unit_correction_ok topics=${graph.bank.declaredTopicCount} cards=${graph.bank.declaredCardCount} web_scenes=${sceneReports.length} web_cards=${scopedDecisions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
