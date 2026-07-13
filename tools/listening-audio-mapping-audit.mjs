import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const topicRoot = join(root, 'content/question-banks/banks/listening/topics');
const currentAudioRoot = resolve(process.env.CURRENT_LISTENING_AUDIO_ROOT
  ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio/listening/main');
const referenceAudioRoot = resolve(process.env.REFERENCE_LISTENING_AUDIO_ROOT
  ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank/listening');
const referenceDesignRepo = resolve(process.env.REFERENCE_DESIGN_REPO
  ?? '/Users/zhouyide/Desktop/icao设计稿');
const referenceDataRevision = process.env.REFERENCE_DATA_REVISION ?? '2275d8c^';
const referenceDataPath = 'lib/question-banks/data/question-bank.json';
const outputRoot = join(root, 'docs/workstreams/listening-audio-mapping-audit');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const publicAudioPath = (filename) => `/question-bank-assets/audio/listening/main/${filename}`;
const cardNumber = (id) => id.match(/^listening-main-(\d{3})$/)?.[1];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function indexAudio(rootPath) {
  const entries = readdirSync(rootPath)
    .filter((name) => name.toLocaleLowerCase('en-US').endsWith('.mp3'))
    .sort((left, right) => left.localeCompare(right, 'en-US', { numeric: true }))
    .map((name) => {
      const path = join(rootPath, name);
      return { bytes: statSync(path).size, hash: sha256(path), name, path };
    });
  const byHash = new Map();
  for (const entry of entries) {
    const group = byHash.get(entry.hash) ?? [];
    group.push(entry);
    byHash.set(entry.hash, group);
  }
  return { byHash, entries, byName: new Map(entries.map((entry) => [entry.name, entry])) };
}

function loadCards() {
  const cards = readdirSync(topicRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const topic = readJson(join(topicRoot, name));
      return topic.cards.map((card) => ({ ...card, topicFile: name, topicId: topic.id }));
    });
  if (cards.length !== 631) throw new Error(`unexpected_listening_card_count:${cards.length}`);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error('duplicate_listening_card_id');
  return cards;
}

function loadHistoricalCards() {
  const raw = execFileSync('git', ['-C', referenceDesignRepo, 'show', `${referenceDataRevision}:${referenceDataPath}`], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const banks = JSON.parse(raw);
  const bank = banks.find((candidate) => candidate.id === 'listening');
  if (!bank) throw new Error('missing_historical_listening_bank');
  const cards = bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards));
  if (cards.length !== 632) throw new Error(`unexpected_historical_listening_card_count:${cards.length}`);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error('duplicate_historical_listening_card_id');
  return new Map(cards.map((card) => [card.id, card]));
}

function main() {
  const cards = loadCards();
  const historicalCards = loadHistoricalCards();
  const current = indexAudio(currentAudioRoot);
  const reference = indexAudio(referenceAudioRoot);
  const expectedReferenceHashes = new Set();
  const audits = cards.map((card) => {
    const number = cardNumber(card.id);
    if (!number) throw new Error(`unexpected_listening_card_id:${card.id}`);
    const currentName = basename(card.audio ?? '');
    const currentEntry = current.byName.get(currentName);
    const historicalCard = historicalCards.get(card.id);
    if (!historicalCard) throw new Error(`missing_historical_card:${card.id}`);
    const referenceName = `${historicalCard.taskTitle}.mp3`;
    const referenceEntry = reference.byName.get(referenceName);
    if (referenceEntry) expectedReferenceHashes.add(referenceEntry.hash);
    const candidateEntries = referenceEntry ? (current.byHash.get(referenceEntry.hash) ?? []) : [];
    const actualReferenceEntries = currentEntry ? (reference.byHash.get(currentEntry.hash) ?? []) : [];
    const canonicalName = `${number}.mp3`;
    const canonicalEntry = current.byName.get(canonicalName);
    const canonicalMatches = Boolean(referenceEntry && canonicalEntry?.hash === referenceEntry.hash);
    let status = 'correct';
    if (!currentEntry) status = 'missing-current-audio';
    else if (!referenceEntry) status = 'missing-reference-audio';
    else if (currentEntry.hash !== referenceEntry.hash) status = candidateEntries.length ? 'mismatch' : 'missing-expected-asset';
    const recommendedEntry = candidateEntries.length === 1
      ? candidateEntries[0]
      : candidateEntries.find((entry) => entry.name === canonicalName);
    return {
      actualReferenceTitles: actualReferenceEntries.map((entry) => basename(entry.name, '.mp3')),
      cardId: card.id,
      canonicalAudio: publicAudioPath(canonicalName),
      canonicalMatches,
      currentAudio: card.audio,
      currentBytes: currentEntry?.bytes ?? null,
      currentHash: currentEntry?.hash ?? null,
      expectedReferenceFile: referenceName,
      expectedReferenceHash: referenceEntry?.hash ?? null,
      historicalTaskTitle: historicalCard.taskTitle,
      recommendedAudio: recommendedEntry ? publicAudioPath(recommendedEntry.name) : null,
      restoreFromReference: status === 'missing-expected-asset' ? referenceEntry?.path ?? null : null,
      status,
      taskTitle: card.taskTitle,
      topicFile: card.topicFile,
      topicId: card.topicId,
      matchingCurrentAssets: candidateEntries.map((entry) => publicAudioPath(entry.name)),
    };
  });

  const referencedCurrentNames = new Set(audits.map((audit) => basename(audit.currentAudio)));
  const expectedByHash = new Map();
  for (const audit of audits) {
    if (!audit.expectedReferenceHash) continue;
    const group = expectedByHash.get(audit.expectedReferenceHash) ?? [];
    group.push(audit.cardId);
    expectedByHash.set(audit.expectedReferenceHash, group);
  }
  const currentAssets = current.entries.map((entry) => ({
    bytes: entry.bytes,
    expectedCardIds: expectedByHash.get(entry.hash) ?? [],
    hash: entry.hash,
    name: entry.name,
    referencedByCurrentCard: referencedCurrentNames.has(entry.name),
  }));
  const statusCounts = Object.fromEntries([...new Set(audits.map((audit) => audit.status))]
    .sort().map((status) => [status, audits.filter((audit) => audit.status === status).length]));
  const byTopic = Object.fromEntries([...new Set(audits.map((audit) => audit.topicId))].map((topicId) => {
    const items = audits.filter((audit) => audit.topicId === topicId);
    return [topicId, {
      cards: items.length,
      correct: items.filter((item) => item.status === 'correct').length,
      mismatch: items.filter((item) => item.status === 'mismatch').length,
      missingExpectedAsset: items.filter((item) => item.status === 'missing-expected-asset').length,
    }];
  }));
  const duplicateCurrentPaths = [...referencedCurrentNames].filter((name) => audits.filter((audit) => basename(audit.currentAudio) === name).length > 1);
  const summary = {
    byTopic,
    canonicalIdentityConfirmed: audits.filter((audit) => audit.canonicalMatches).length,
    cardCount: audits.length,
    currentAssetCount: current.entries.length,
    currentAssetsWithNoExpectedCard: currentAssets.filter((asset) => asset.expectedCardIds.length === 0).length,
    duplicateCurrentPaths: duplicateCurrentPaths.length,
    referenceAssetCount: reference.entries.length,
    historicalCardCount: historicalCards.size,
    historicalTitleDifferences: audits.filter((audit) => audit.historicalTaskTitle !== audit.taskTitle).length,
    removedHistoricalCardIds: [...historicalCards.keys()].filter((id) => !audits.some((audit) => audit.cardId === id)),
    referenceHashesMissingFromCurrentAssets: [...expectedReferenceHashes].filter((hash) => !current.byHash.has(hash)).length,
    statusCounts,
    uniqueCurrentPaths: referencedCurrentNames.size,
  };

  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, 'full-audit.json'), `${JSON.stringify({
    audits,
    currentAssets,
    generatedAt: new Date().toISOString(),
    roots: { currentAudioRoot, referenceAudioRoot, referenceDataPath, referenceDataRevision, referenceDesignRepo, topicRoot },
    schemaVersion: 1,
    summary,
  }, null, 2)}\n`);

  const csvColumns = [
    'cardId', 'taskTitle', 'topicId', 'status', 'currentAudio', 'actualReferenceTitles',
    'recommendedAudio', 'canonicalAudio', 'canonicalMatches', 'matchingCurrentAssets',
    'historicalTaskTitle', 'expectedReferenceFile', 'restoreFromReference', 'currentHash', 'expectedReferenceHash',
  ];
  const problemAudits = audits.filter((audit) => audit.status !== 'correct');
  writeFileSync(join(outputRoot, 'problems.csv'), `${csvColumns.join(',')}\n${problemAudits
    .map((audit) => csvColumns.map((column) => csvCell(audit[column])).join(','))
    .join('\n')}\n`);

  const topicRows = Object.entries(byTopic).map(([topicId, value]) => `| ${topicId} | ${value.cards} | ${value.correct} | ${value.mismatch} | ${value.missingExpectedAsset} |`).join('\n');
  const sampleRows = problemAudits.slice(0, 40).map((audit) => `| ${audit.cardId} | ${audit.taskTitle} | ${audit.status} | ${audit.currentAudio} | ${audit.actualReferenceTitles.join(' / ') || '-'} | ${audit.recommendedAudio ?? `从旧资源恢复为 ${audit.canonicalAudio}`} |`).join('\n');
  const missingRows = problemAudits.filter((audit) => audit.status === 'missing-expected-asset').map((audit) => `| ${audit.cardId} | ${audit.taskTitle} | ${audit.canonicalAudio} | ${audit.restoreFromReference} |`).join('\n') || '| - | - | - | - |';
  writeFileSync(join(outputRoot, 'report.md'), `# 听力题库音频映射全量审计\n\n## 范围与方法\n\n- 审计题目：${summary.cardCount} 条。\n- 当前规范音频：${summary.currentAssetCount} 个。\n- 旧命名参考音频：${summary.referenceAssetCount} 个。\n- 删除前历史基线：设计仓库 ${referenceDataRevision}，共 ${summary.historicalCardCount} 条。\n- 依据：稳定卡片 ID、删除前 taskTitle、当前 audio 路径以及两套音频的 SHA-256。\n- 未重新听音频，未运行 ASR，未调用外部 API，未修改题库或音频。\n\n## 结论\n\n- 映射正确：${statusCounts.correct ?? 0} 条。\n- 明确错配：${statusCounts.mismatch ?? 0} 条。\n- 正确音频在规范目录中缺失：${statusCounts['missing-expected-asset'] ?? 0} 条。\n- 当前路径缺失：${statusCounts['missing-current-audio'] ?? 0} 条。\n- 参考音频缺失：${statusCounts['missing-reference-audio'] ?? 0} 条。\n- 当前音频路径唯一：${summary.uniqueCurrentPaths}/${summary.cardCount}。\n- 原始卡片编号与规范音频文件名经哈希确认：${summary.canonicalIdentityConfirmed}/${summary.cardCount}。\n- 规范目录中不属于任何现存卡片的音频内容：${summary.currentAssetsWithNoExpectedCard} 个。\n- 删除后标题被重排：${summary.historicalTitleDifferences} 条；删除的历史卡片：${summary.removedHistoricalCardIds.join(', ')}。\n\n系统性原因：规范音频文件名仍对应稳定卡片 ID，但题库按四类重新分组后，audio 路径按新的分组顺序重新顺次挂载，造成内容与题目错位。删除 listening-main-595 时删除的是它当时错误挂载的顺序文件 main/454.mp3，导致现存卡片 listening-main-454 的正确规范音频缺失；被删除题目的音频 main/595.mp3 仍然保留。删除后 listening-main-623 的展示标题从 20s航空英语-96 重排成 -95，但其正确音频仍是 main/623.mp3，审计已按稳定 ID 和删除前标题处理该边界。\n\n## 分题组统计\n\n| 题组 | 卡片 | 正确 | 错配 | 缺少正确规范音频 |\n| --- | ---: | ---: | ---: | ---: |\n${topicRows}\n\n## 需要从旧资源恢复\n\n| 卡片 | 标题 | 建议规范路径 | 只读参考源 |\n| --- | --- | --- | --- |\n${missingRows}\n\n## 前 40 条问题样本\n\n| 卡片 | 标题 | 状态 | 当前路径 | 当前实际内容对应标题 | 建议路径 |\n| --- | --- | --- | --- | --- | --- |\n${sampleRows}\n\n完整逐条结果见 full-audit.json；全部问题映射见 problems.csv。\n`);

  process.stdout.write(`listening_audio_mapping_audit ${JSON.stringify(summary)}\n`);
}

main();
