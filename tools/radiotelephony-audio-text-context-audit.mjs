import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const radiotelephonyRoot = join(root, 'content/question-banks/banks/radiotelephony');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const reportPath = join(
  root,
  'docs/records/workstreams/web-question-bank-content-migration/reports/radiotelephony-audio-text-context-audit.md',
);

const airlineCodes = ['QFA', 'SIA', 'AFR', 'BAW', 'UAL', 'KLM', 'JAL', 'ACA', 'CCA', 'CSN', 'CES'];
const airlinePattern = airlineCodes.join('|');
const callsignPattern = new RegExp(`\\b(${airlinePattern})[\\s-]?(\\d{1,4})\\b`, 'gi');

const sceneRules = [
  { id: '鸟击', topic: /鸟击|异物击中/i, text: /bird strike|bird ingestion|birds? ingested/i },
  { id: '外来物体吸入', topic: /吸入外来物体|外来物体/i, text: /foreign object ingestion|volcanic ash/i },
  { id: '通讯问题', topic: /通讯失效|接收机失效|转述/i, text: /receiver failure|transmitting blind|communication|radio failure|relay the message/i },
  { id: '发动机问题', topic: /发动机失效|发动机起火|发超温|熄火/i, text: /engine (?:failure|fire|overheating|failed)|flameout|lost power/i },
  { id: '积冰防冰', topic: /积冰|防冰/i, text: /icing|anti[- ]ice|de[- ]ice/i },
  { id: '乘客医疗', topic: /乘客医疗|中风|受伤|担架|烫伤/i, text: /medical|heart attack|stroke|stretcher|injured|sick passenger/i },
  { id: '雷暴绕飞', topic: /雷暴|强下沉气流/i, text: /thunderstorm|cumulonimbus|weather radar|\bCB\b|wind shear/i },
  { id: 'TCAS机动', topic: /TCAS/i, text: /\bTCAS\b|resolution advisory|\bRA\b/i },
  { id: '燃油问题', topic: /燃油紧急|加油/i, text: /fuel emergency|minimum fuel|dump fuel|fuel leak|refuel/i },
  { id: '起落架问题', topic: /起落架|前轮/i, text: /landing gear|nose wheel|main gear/i },
  { id: '刹车问题', topic: /刹车/i, text: /brake(?:s| temperature)?/i },
  { id: '襟翼问题', topic: /襟翼/i, text: /flap(?:s)?/i },
  { id: '液压问题', topic: /液压/i, text: /hydraulic/i },
  { id: '风挡问题', topic: /风挡|玻璃/i, text: /windshield|windscreen|window crack/i },
  { id: '舱门问题', topic: /舱门/i, text: /emergency door|cabin door/i },
  { id: '备降返航', topic: /备降|返航/i, text: /divert|return to land|returning to/i },
  { id: '复飞', topic: /复飞/i, text: /missed approach|go around/i },
];

const priorityOrder = ['P0', 'P1', 'P2', 'P3'];
const priorityLabels = {
  P0: '高优先级：主呼号跨航司错配',
  P1: '高优先级：主呼号同航司号码错位',
  P2: '中优先级：场景主题与原文事件漂移',
  P3: '低优先级：原文包含其他呼号，需结合转述/交通上下文判断',
};

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeCallsign(code, number) {
  return `${code.toUpperCase()} ${number}`;
}

function callsignFromText(text) {
  const match = text.match(new RegExp(`\\b(${airlinePattern})\\s+(\\d{1,4})\\b`, 'i'));
  return match ? normalizeCallsign(match[1], match[2]) : null;
}

function callsignMentions(audioText) {
  return [...new Set([...audioText.matchAll(callsignPattern)].map((match) => normalizeCallsign(match[1], match[2])))];
}

function carrier(callsign) {
  return callsign.split(' ')[0];
}

function labelsFromTopic(topicName) {
  return sceneRules.filter((rule) => rule.topic.test(topicName)).map((rule) => rule.id);
}

function labelsFromAudioText(audioText) {
  return sceneRules.filter((rule) => rule.text.test(audioText)).map((rule) => rule.id);
}

function transcriptTokens(audioText) {
  const normalized = audioText
    .toLowerCase()
    .replace(callsignPattern, ' callsign ')
    .replace(/\b[bc]\s*:/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return new Set(normalized.split(/\s+/).filter((token) => token.length > 1));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function markdownCode(value) {
  return `\`${String(value).replaceAll('`', '\\`')}\``;
}

function blockQuote(value) {
  return value.split('\n').map((line) => `> ${line}`).join('\n');
}

function auditProjection(graph) {
  return {
    id: graph.id,
    name: graph.name,
    declaredTopicCount: graph.declaredTopicCount,
    declaredCardCount: graph.declaredCardCount,
    categories: graph.categories.map((category) => ({
      id: category.id,
      name: category.name,
      declaredTopicCount: category.declaredTopicCount,
      declaredCardCount: category.declaredCardCount,
      topics: category.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        declaredCardCount: topic.declaredCardCount,
        cards: topic.cards.map((card) => ({
          id: card.id,
          taskTitle: card.taskTitle,
          audioText: card.audioText,
        })),
      })),
    })),
  };
}

function validateGraph(graph, sourceLabel) {
  if (graph.id !== 'radiotelephony') fail(`unexpected_bank:${sourceLabel}:${graph.id}`);
  const topicIds = new Set();
  const cardIds = new Set();
  let topicCount = 0;
  let cardCount = 0;

  for (const category of graph.categories) {
    if (category.topics.length !== category.declaredTopicCount) fail(`category_topic_count:${sourceLabel}:${category.id}`);
    let categoryCards = 0;
    for (const topic of category.topics) {
      if (topicIds.has(topic.id)) fail(`duplicate_topic:${sourceLabel}:${topic.id}`);
      topicIds.add(topic.id);
      topicCount += 1;
      if (topic.cards.length !== topic.declaredCardCount) fail(`topic_card_count:${sourceLabel}:${topic.id}`);
      for (const card of topic.cards) {
        if (cardIds.has(card.id)) fail(`duplicate_card:${sourceLabel}:${card.id}`);
        cardIds.add(card.id);
        if (!card.taskTitle?.trim() || !card.audioText?.trim()) fail(`missing_audit_input:${sourceLabel}:${card.id}`);
        categoryCards += 1;
        cardCount += 1;
      }
    }
    if (categoryCards !== category.declaredCardCount) fail(`category_card_count:${sourceLabel}:${category.id}`);
  }
  if (topicCount !== graph.declaredTopicCount) fail(`bank_topic_count:${sourceLabel}`);
  if (cardCount !== graph.declaredCardCount) fail(`bank_card_count:${sourceLabel}`);
  return { topics: topicCount, cards: cardCount, categories: graph.categories.length };
}

function loadSourceGraph() {
  const bank = readJson(join(radiotelephonyRoot, 'bank.json'));
  const categories = bank.categoryIds.map((categoryId) => {
    const category = readJson(join(radiotelephonyRoot, 'categories', `${categoryId}.json`));
    const topics = category.topicIds.map((topicId) => {
      const topic = readJson(join(radiotelephonyRoot, 'topics', `${topicId}.json`));
      if (topic.categoryId !== categoryId) fail(`topic_category_mismatch:${topicId}`);
      return topic;
    });
    return { ...category, topics };
  });
  return { ...bank, categories };
}

function loadEmbeddedGraph() {
  const embedded = readJson(embeddedPath).find((bank) => bank.id === 'radiotelephony');
  if (!embedded) fail('embedded_radiotelephony_missing');
  return embedded;
}

function collectCards(graph) {
  const cards = [];
  for (const category of graph.categories) {
    for (const topic of category.topics) {
      const scenarioCallsign = callsignFromText(topic.name);
      if (!scenarioCallsign) fail(`scenario_callsign_missing:${topic.id}`);
      const topicLabels = labelsFromTopic(topic.name);
      for (const card of topic.cards) {
        const titleCallsign = callsignFromText(card.taskTitle);
        if (titleCallsign !== scenarioCallsign) fail(`task_title_callsign_mismatch:${card.id}:${scenarioCallsign}:${titleCallsign}`);
        cards.push({
          cardId: card.id,
          taskTitle: card.taskTitle,
          categoryId: category.id,
          categoryName: category.name,
          scenarioId: topic.id,
          scenarioName: topic.name,
          expectedCallsign: scenarioCallsign,
          expectedLabels: topicLabels,
          audioText: card.audioText,
          mentions: callsignMentions(card.audioText),
          actualLabels: labelsFromAudioText(card.audioText),
          tokens: transcriptTokens(card.audioText),
        });
      }
    }
  }
  return cards;
}

function closestSupportingScene(card, cards) {
  if (!card.actualLabels.length || card.tokens.size < 8) return null;
  let best = null;
  for (const candidate of cards) {
    if (candidate.scenarioId === card.scenarioId || candidate.tokens.size < 8) continue;
    if (!candidate.expectedLabels.some((label) => card.actualLabels.includes(label))) continue;
    const score = jaccard(card.tokens, candidate.tokens);
    if (score < 0.78) continue;
    if (!best || score > best.score || (score === best.score && candidate.cardId < best.cardId)) {
      best = {
        cardId: candidate.cardId,
        scenarioId: candidate.scenarioId,
        scenarioName: candidate.scenarioName,
        score,
      };
    }
  }
  return best;
}

function addFinding(candidates, card, finding) {
  const candidate = candidates.get(card.cardId) ?? { ...card, findings: [] };
  candidate.findings.push(finding);
  candidates.set(card.cardId, candidate);
}

function analyzeCards(cards) {
  const candidates = new Map();
  for (const card of cards) {
    const foreign = card.mentions.filter((mention) => mention !== card.expectedCallsign);
    const includesExpected = card.mentions.includes(card.expectedCallsign);

    if (foreign.length && !includesExpected) {
      const hasDifferentCarrier = foreign.some((mention) => carrier(mention) !== carrier(card.expectedCallsign));
      addFinding(candidates, card, {
        priority: hasDifferentCarrier ? 'P0' : 'P1',
        rule: hasDifferentCarrier ? 'PRIMARY_CALLSIGN_CROSS_AIRLINE' : 'PRIMARY_CALLSIGN_NUMBER_MISMATCH',
        evidence: `场景主呼号 ${card.expectedCallsign} 未出现在原文；原文出现 ${foreign.join('、')}。`,
      });
    } else if (foreign.length) {
      addFinding(candidates, card, {
        priority: 'P3',
        rule: 'CONTEXTUAL_FOREIGN_CALLSIGN',
        evidence: `原文同时出现本场景呼号 ${card.expectedCallsign} 与其他呼号 ${foreign.join('、')}；可能是转述或交通信息，保留人工判断。`,
      });
    }

    const unexpectedLabels = card.actualLabels.filter((label) => !card.expectedLabels.includes(label));
    if (unexpectedLabels.length && !card.actualLabels.some((label) => card.expectedLabels.includes(label))) {
      const supportingScene = closestSupportingScene(card, cards);
      const support = supportingScene
        ? `；与 ${supportingScene.scenarioId}（${supportingScene.scenarioName}）/${supportingScene.cardId} 的原文词集相似度 ${(supportingScene.score * 100).toFixed(0)}%`
        : '';
      addFinding(candidates, card, {
        priority: 'P2',
        rule: 'SCENE_SEMANTIC_DRIFT',
        evidence: `场景主题为 ${card.expectedLabels.join('、') || '未识别'}，但原文仅明确出现 ${unexpectedLabels.join('、')}。${support}`,
        supportingScene,
      });
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      findings: candidate.findings.sort((left, right) => priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority) || left.rule.localeCompare(right.rule)),
      priority: candidate.findings.map((finding) => finding.priority).sort((left, right) => priorityOrder.indexOf(left) - priorityOrder.indexOf(right))[0],
    }))
    .sort((left, right) => priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority)
      || left.scenarioId.localeCompare(right.scenarioId)
      || left.cardId.localeCompare(right.cardId));
}

function renderCandidate(candidate) {
  const lines = [
    `#### ${candidate.taskTitle} · ${candidate.cardId}`,
    '',
    `- 场景：${markdownCode(candidate.scenarioId)} · ${candidate.scenarioName}`,
    `- 场景呼号：${markdownCode(candidate.expectedCallsign)}`,
    `- 原文识别到的呼号：${candidate.mentions.length ? candidate.mentions.map(markdownCode).join('、') : '未识别到'}`,
  ];
  for (const finding of candidate.findings) {
    lines.push(`- ${markdownCode(finding.rule)}：${finding.evidence}`);
  }
  lines.push('- 人工结论：待判', '', '**音频原文**', '', blockQuote(candidate.audioText), '');
  return lines.join('\n');
}

function renderReport({ sourceHash, embeddedHash, coverage, candidates }) {
  const counts = Object.fromEntries(priorityOrder.map((priority) => [priority, candidates.filter((candidate) => candidate.priority === priority).length]));
  const lines = [
    '# 陆空通话音频原文与场景语境审查',
    '',
    '> 本报告是人工复核清单，不会自动修正题库，也不代表候选已被判定为错误。',
    '',
    '## 审查边界',
    '',
    '- 覆盖正式共享源 `content/question-banks/banks/radiotelephony` 的全部场景和卡片。',
    '- 仅使用 `audioText`，并以航司分类、场景名和任务标题确定语境；不读取或展示参考答案、中文原文和音频文件内容。',
    '- 对 `src/features/question-bank/data/question-bank.json` 仅比较上述审查输入的派生快照，确认学习页所用数据未漂移。',
    '',
    '## 输入与覆盖',
    '',
    `- 场景：${coverage.topics}；卡片：${coverage.cards}；航司分类：${coverage.categories}。`,
    `- 正式源审查输入 SHA-256：${markdownCode(sourceHash)}`,
    `- 内嵌题库审查输入 SHA-256：${markdownCode(embeddedHash)}`,
    `- 候选卡：${candidates.length}（P0 ${counts.P0}、P1 ${counts.P1}、P2 ${counts.P2}、P3 ${counts.P3}）。`,
    '',
    '## 分级说明',
    '',
    '- P0：场景呼号未出现，原文主呼号属于另一航司。',
    '- P1：场景呼号未出现，原文为同航司的不同号码。',
    '- P2：原文明确的事件与场景主题无交集；如存在，会附跨场景相似原文证据。',
    '- P3：本场景呼号存在，但原文还提及其他航班；可能合理，保留高召回审查。',
  ];

  for (const priority of priorityOrder) {
    const inPriority = candidates.filter((candidate) => candidate.priority === priority);
    if (!inPriority.length) continue;
    lines.push('', `## ${priority} · ${priorityLabels[priority]}`, '');
    let previousScenarioId = null;
    for (const candidate of inPriority) {
      if (candidate.scenarioId !== previousScenarioId) {
        lines.push(`### ${candidate.scenarioId} · ${candidate.scenarioName}`, '');
        previousScenarioId = candidate.scenarioId;
      }
      lines.push(renderCandidate(candidate));
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function buildAudit() {
  const sourceGraph = loadSourceGraph();
  const embeddedGraph = loadEmbeddedGraph();
  const sourceProjection = auditProjection(sourceGraph);
  const embeddedProjection = auditProjection(embeddedGraph);
  const sourceHash = sha256(JSON.stringify(sourceProjection));
  const embeddedHash = sha256(JSON.stringify(embeddedProjection));
  const coverage = validateGraph(sourceProjection, 'source');
  const embeddedCoverage = validateGraph(embeddedProjection, 'embedded');
  if (JSON.stringify(coverage) !== JSON.stringify(embeddedCoverage) || sourceHash !== embeddedHash) {
    fail(`embedded_audit_input_drift:source=${sourceHash}:embedded=${embeddedHash}`);
  }
  const cards = collectCards(sourceProjection);
  if (cards.length !== coverage.cards) fail(`card_coverage_mismatch:${cards.length}/${coverage.cards}`);
  const candidates = analyzeCards(cards);
  return { sourceHash, embeddedHash, coverage, candidates, report: renderReport({ sourceHash, embeddedHash, coverage, candidates }) };
}

function runSelfTest() {
  const jalMentions = callsignMentions('C: CCA 105, Xiamen Approach, report your current position.');
  if (jalMentions.length !== 1 || jalMentions[0] !== 'CCA 105') fail('self_test_jal_callsign_parse');
  const titleLabels = labelsFromTopic('JAL 220 鸟击 积冰/防冰 乘客医疗');
  const audioLabels = labelsFromAudioText('CCA 105 was transmitting blind due to receiver failure.');
  if (!titleLabels.includes('鸟击') || !audioLabels.includes('通讯问题')) fail('self_test_semantic_labels');
  const sameCarrier = callsignMentions('C: AFR939, cleared to Beijing.');
  if (sameCarrier[0] !== 'AFR 939') fail('self_test_compact_callsign_parse');
  process.stdout.write('radiotelephony_audio_text_context_audit_self_test_ok\n');
}

const args = process.argv.slice(2);
if (args.some((arg) => !['--check', '--self-test'].includes(arg))) fail('usage: radiotelephony-audio-text-context-audit.mjs [--check|--self-test]');
if (args.includes('--self-test')) runSelfTest();
if (!args.includes('--self-test')) {
  const audit = buildAudit();
  if (args.includes('--check')) {
    if (!existsSync(reportPath)) fail(`report_missing:${reportPath}`);
    if (readFileSync(reportPath, 'utf8') !== audit.report) fail(`report_out_of_date:${reportPath}`);
    process.stdout.write(`radiotelephony_audio_text_context_audit_ok ${JSON.stringify({ ...audit.coverage, candidates: audit.candidates.length, sourceHash: audit.sourceHash })}\n`);
  } else {
    writeFileSync(reportPath, audit.report);
    process.stdout.write(`radiotelephony_audio_text_context_audit_written ${JSON.stringify({ ...audit.coverage, candidates: audit.candidates.length, sourceHash: audit.sourceHash, report: reportPath })}\n`);
  }
}
