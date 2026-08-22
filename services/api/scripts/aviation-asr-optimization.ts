import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AVIATION_TRANSCRIPT_NORMALIZATION_VERSION,
  normalizeAviationTranscriptDetailed,
} from '../src/ai/aviation-transcript-normalization';

type ModuleId = 'sentences900' | 'listening' | 'storytelling';
type SamplingPhase = 'development' | 'blind';
type Phase = SamplingPhase | 'targeted' | 'cumulative';

type Resource = {
  bankId: string;
  checksum: string;
  durationSeconds: number;
  mimeType: string;
  objectKey: string;
  publicPath: string;
  status: string;
};

type Sample = {
  audio: Pick<Resource, 'checksum' | 'durationSeconds' | 'mimeType' | 'objectKey' | 'publicPath'>;
  bankId: ModuleId;
  cardId: string;
  categoryId: string;
  expectedField: 'audioText';
  expectedText: string;
  expectedTextSha256: string;
  id: string;
  sourceWarning?: 'duration_text_ratio_suspect';
  topicId: string;
};

type SampleManifest = {
  campaignId: string;
  content: { registryReleaseVersion: number; registryReleasedAt: string };
  phase: Phase;
  round: number;
  samples: Sample[];
  schemaVersion: 1;
  seed: string;
  summary: { audioDurationSeconds: number; counts: Record<ModuleId, number>; sourceWarnings: number };
};

type RawOutput = {
  adapterVersion: string;
  hotwords: { mode: string; assetVersion?: string; assetSha256?: string; providerVocabularySha256?: string };
  model: string;
  results: Record<string, {
    cacheKey: string;
    error?: string;
    providerDurationSeconds?: number | null;
    rawTranscript?: string;
    status: 'failed' | 'success';
    transcribedAt: string;
  }>;
  runId: string;
  schemaVersion: 1;
};

type Classification = {
  mainCategory: 'MATCH' | 'ASR_DOMAIN' | 'ASR_GENERAL' | 'NORMALIZATION_MISSING' | 'NORMALIZATION_REGRESSION'
    | 'REFERENCE_MISMATCH' | 'REFERENCE_VARIANT' | 'NO_SPEECH_OR_INPUT' | 'UNCERTAIN' | null;
  note: string;
  referenceStatus: 'aligned' | 'mismatch' | 'variant' | 'suspect' | null;
  semanticOutcome: 'correct' | 'acceptable' | 'minor' | 'major' | 'unusable' | 'excluded' | null;
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const questionBankRoot = join(root, 'content/question-banks');
const banksRoot = join(questionBankRoot, 'banks');
const resourceManifestPath = join(questionBankRoot, 'resources/manifest.source.json');
const registryPath = join(questionBankRoot, 'registry.json');
const evidenceRoot = join(root, 'docs/records/workstreams/aviation-asr-optimization/evidence/campaign-01');
const normalizationSourcePath = join(root, 'services/api/src/ai/aviation-transcript-normalization.ts');
const campaignId = 'aviation-asr-campaign-01';
const campaignSeed = 'aviation-asr-campaign-01-seed-v1';
const moduleOrder: ModuleId[] = ['sentences900', 'listening', 'storytelling'];
const counts: Record<SamplingPhase, Record<ModuleId, number>> = {
  development: { sentences900: 30, listening: 30, storytelling: 3 },
  blind: { sentences900: 10, listening: 10, storytelling: 1 },
};

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (value === undefined) throw new Error(`missing_argument:${name}`);
  return value;
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function stableRank(seed: string, value: string) {
  return sha256(`${seed}:${value}`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function roundDirectory(round: number) {
  return join(evidenceRoot, `round-${String(round).padStart(2, '0')}`);
}

async function loadPools() {
  const registry = await readJson<{ releaseVersion: number; releasedAt: string }>(registryPath);
  const resources = await readJson<{ files: Resource[] }>(resourceManifestPath);
  const resourceMap = new Map(resources.files.map((resource) => [resource.publicPath, resource]));
  const pools = new Map<ModuleId, Sample[]>();

  for (const bankId of moduleOrder) {
    const topicsRoot = join(banksRoot, bankId, 'topics');
    const samples: Sample[] = [];
    for (const file of (await readdir(topicsRoot)).filter((entry) => entry.endsWith('.json')).sort()) {
      const topic = await readJson<{
        cards?: Array<{ audio?: string; audioText?: string; id: string }>;
        categoryId: string;
        id: string;
      }>(join(topicsRoot, file));
      for (const card of topic.cards ?? []) {
        const expectedText = card.audioText?.normalize('NFKC').replace(/\s+/g, ' ').trim();
        const resource = card.audio ? resourceMap.get(card.audio) : undefined;
        if (!expectedText || !resource || resource.status !== 'ready' || resource.bankId !== bankId) continue;
        const wordCount = expectedText.split(/\s+/).filter(Boolean).length;
        const wordsPerMinute = resource.durationSeconds > 0 ? wordCount * 60 / resource.durationSeconds : Number.POSITIVE_INFINITY;
        samples.push({
          audio: {
            checksum: resource.checksum,
            durationSeconds: resource.durationSeconds,
            mimeType: resource.mimeType,
            objectKey: resource.objectKey,
            publicPath: resource.publicPath,
          },
          bankId,
          cardId: card.id,
          categoryId: topic.categoryId,
          expectedField: 'audioText',
          expectedText,
          expectedTextSha256: sha256(expectedText),
          id: `${bankId}:${card.id}`,
          ...(wordsPerMinute > 300 ? { sourceWarning: 'duration_text_ratio_suspect' as const } : {}),
          topicId: topic.id,
        });
      }
    }
    pools.set(bankId, samples.sort((left, right) => left.cardId.localeCompare(right.cardId)));
  }

  const actual = Object.fromEntries(moduleOrder.map((module) => [module, pools.get(module)?.length ?? 0]));
  const expected = { sentences900: 900, listening: 1223, storytelling: 436 };
  for (const module of moduleOrder) {
    if (actual[module] !== expected[module]) throw new Error(`unexpected_sample_pool:${module}:${actual[module]}:${expected[module]}`);
  }
  return { pools, registry };
}

async function usedSampleIds() {
  const used = new Set<string>();
  for (let round = 1; round <= 5; round += 1) {
    for (const phase of ['development', 'blind'] as Phase[]) {
      const path = join(roundDirectory(round), `${phase}-manifest.json`);
      if (!await exists(path)) continue;
      const manifest = await readJson<SampleManifest>(path);
      for (const sample of manifest.samples) used.add(`${sample.bankId}:${sample.cardId}`);
    }
  }
  return used;
}

async function prepareManifest(phase: SamplingPhase, round: number) {
  if (!Number.isInteger(round) || round < 1 || round > 5) throw new Error(`invalid_round:${round}`);
  const path = join(roundDirectory(round), `${phase}-manifest.json`);
  if (await exists(path)) {
    process.stdout.write(`asr_manifest_exists phase=${phase} round=${round} path=${path}\n`);
    return;
  }
  const { pools, registry } = await loadPools();
  const used = await usedSampleIds();
  const selected: Sample[] = [];
  for (const module of moduleOrder) {
    const available = (pools.get(module) ?? []).filter((sample) => !used.has(`${module}:${sample.cardId}`));
    const chosen = available
      .sort((left, right) => stableRank(`${campaignSeed}:${round}:${phase}:${module}`, left.cardId)
        .localeCompare(stableRank(`${campaignSeed}:${round}:${phase}:${module}`, right.cardId)))
      .slice(0, counts[phase][module]);
    if (chosen.length !== counts[phase][module]) throw new Error(`insufficient_samples:${round}:${phase}:${module}`);
    for (const sample of chosen) used.add(`${module}:${sample.cardId}`);
    selected.push(...chosen);
  }
  const manifest: SampleManifest = {
    campaignId,
    content: { registryReleaseVersion: registry.releaseVersion, registryReleasedAt: registry.releasedAt },
    phase,
    round,
    samples: selected,
    schemaVersion: 1,
    seed: campaignSeed,
    summary: {
      audioDurationSeconds: selected.reduce((total, sample) => total + sample.audio.durationSeconds, 0),
      counts: Object.fromEntries(moduleOrder.map((module) => [module, selected.filter((sample) => sample.bankId === module).length])) as Record<ModuleId, number>,
      sourceWarnings: selected.filter((sample) => sample.sourceWarning).length,
    },
  };
  await writeJson(path, manifest);
  process.stdout.write(`asr_manifest_prepared phase=${phase} round=${round} samples=${selected.length} duration_seconds=${manifest.summary.audioDurationSeconds.toFixed(3)} warnings=${manifest.summary.sourceWarnings}\n`);
}

async function prepareCumulative() {
  const outputPath = resolve(root, arg('output'));
  const classificationPath = resolve(root, arg('classification'));
  const samples: Sample[] = [];
  const classifications: Record<string, Classification> = {};
  let content: SampleManifest['content'] | undefined;
  const seen = new Set<string>();
  for (let round = 1; round <= 5; round += 1) {
    for (const phase of ['development', 'blind'] as SamplingPhase[]) {
      const manifest = await readJson<SampleManifest>(join(roundDirectory(round), `${phase}-manifest.json`));
      const sourceClassification = await readJson<Record<string, Classification>>(join(
        roundDirectory(round),
        phase === 'development' ? 'development-candidate-classification.json' : 'blind-classification.json',
      ));
      if (content && JSON.stringify(content) !== JSON.stringify(manifest.content)) throw new Error('incompatible_cumulative_content');
      content = manifest.content;
      for (const sample of manifest.samples) {
        if (seen.has(sample.id)) throw new Error(`duplicate_cumulative_sample:${sample.id}`);
        const classification = sourceClassification[sample.id];
        if (!classification?.mainCategory || !classification.referenceStatus || !classification.semanticOutcome || !classification.note.trim()) {
          throw new Error(`incomplete_cumulative_classification:${sample.id}`);
        }
        seen.add(sample.id);
        samples.push(sample);
        classifications[sample.id] = classification;
      }
    }
  }
  if (!content || samples.length !== 420) throw new Error(`invalid_cumulative_sample_count:${samples.length}`);
  const manifest: SampleManifest = {
    campaignId,
    content,
    phase: 'cumulative',
    round: 0,
    samples,
    schemaVersion: 1,
    seed: campaignSeed,
    summary: {
      audioDurationSeconds: samples.reduce((total, sample) => total + sample.audio.durationSeconds, 0),
      counts: Object.fromEntries(moduleOrder.map((module) => [module, samples.filter((sample) => sample.bankId === module).length])) as Record<ModuleId, number>,
      sourceWarnings: samples.filter((sample) => sample.sourceWarning).length,
    },
  };
  await writeJson(outputPath, manifest);
  await writeJson(classificationPath, classifications);
  process.stdout.write(`asr_cumulative_manifest_prepared samples=${samples.length} duration_seconds=${manifest.summary.audioDurationSeconds.toFixed(3)} warnings=${manifest.summary.sourceWarnings}\n`);
}

async function prepareTargeted() {
  const round = Number(arg('round'));
  if (!Number.isInteger(round) || round < 1 || round > 5) throw new Error(`invalid_round:${round}`);
  const selectionPath = resolve(root, arg('selection'));
  const outputPath = resolve(root, arg('output'));
  const selection = await readJson<{ ids: string[]; rationale: string }>(selectionPath);
  if (!Array.isArray(selection.ids) || !selection.ids.length || new Set(selection.ids).size !== selection.ids.length
    || typeof selection.rationale !== 'string' || !selection.rationale.trim()) {
    throw new Error('invalid_targeted_selection');
  }
  const { pools, registry } = await loadPools();
  const allSamples = new Map([...pools.values()].flat().map((sample) => [sample.id, sample]));
  const samples = selection.ids.map((id) => {
    const sample = allSamples.get(id);
    if (!sample) throw new Error(`unknown_targeted_sample:${id}`);
    return sample;
  });
  const manifest: SampleManifest & { rationale: string } = {
    campaignId,
    content: { registryReleaseVersion: registry.releaseVersion, registryReleasedAt: registry.releasedAt },
    phase: 'targeted',
    rationale: selection.rationale,
    round,
    samples,
    schemaVersion: 1,
    seed: `targeted:${sha256(await readFile(selectionPath)).slice(0, 16)}`,
    summary: {
      audioDurationSeconds: samples.reduce((total, sample) => total + sample.audio.durationSeconds, 0),
      counts: Object.fromEntries(moduleOrder.map((module) => [module, samples.filter((sample) => sample.bankId === module).length])) as Record<ModuleId, number>,
      sourceWarnings: samples.filter((sample) => sample.sourceWarning).length,
    },
  };
  await writeJson(outputPath, manifest);
  process.stdout.write(`asr_targeted_manifest_prepared round=${round} samples=${samples.length}\n`);
}

async function collectRaw() {
  const manifest = await readJson<SampleManifest>(resolve(root, arg('manifest')));
  const sourcePaths = arg('sources').split(',').map((path) => resolve(root, path.trim())).filter(Boolean);
  if (!sourcePaths.length) throw new Error('missing_raw_sources');
  const sources = await Promise.all(sourcePaths.map((path) => readJson<RawOutput>(path)));
  const first = sources[0];
  for (const source of sources.slice(1)) {
    if (source.adapterVersion !== first.adapterVersion || source.model !== first.model
      || JSON.stringify(source.hotwords) !== JSON.stringify(first.hotwords)) {
      throw new Error('incompatible_raw_sources');
    }
  }
  const results: RawOutput['results'] = {};
  for (const sample of manifest.samples) {
    const matches = sources.map((source) => source.results[sample.id]).filter(Boolean);
    if (matches.length !== 1) throw new Error(`targeted_raw_result_count:${sample.id}:${matches.length}`);
    results[sample.id] = matches[0];
  }
  await writeJson(resolve(root, arg('output')), {
    adapterVersion: first.adapterVersion,
    hotwords: first.hotwords,
    model: first.model,
    results,
    runId: arg('run-id'),
    schemaVersion: 1,
  } satisfies RawOutput);
  process.stdout.write(`asr_raw_collected samples=${manifest.samples.length} sources=${sources.length}\n`);
}

async function prepareRun() {
  const sourcePath = resolve(root, arg('source'));
  const outputPath = resolve(root, arg('output'));
  const mode = arg('hotword-mode');
  const callLimit = Number(arg('call-limit'));
  if (!['none', 'configured', 'candidate'].includes(mode)) throw new Error(`invalid_hotword_mode:${mode}`);
  const source = await readJson<SampleManifest>(sourcePath);
  let hotwords: Record<string, string> = { mode };
  if (mode !== 'none') {
    const assetPath = resolve(root, arg('hotword-asset'));
    const assetRaw = await readFile(assetPath);
    const asset = JSON.parse(assetRaw.toString('utf8')) as { version: string };
    hotwords = {
      mode,
      assetVersion: asset.version,
      assetSha256: sha256(assetRaw),
      providerVocabularySha256: arg('provider-sha'),
    };
  }
  await writeJson(outputPath, {
    ...source,
    run: {
      callLimit,
      hotwords,
      id: arg('run-id'),
      model: 'fun-asr-2025-11-07',
    },
  });
  process.stdout.write(`asr_run_manifest_prepared run=${arg('run-id')} samples=${source.samples.length} mode=${mode}\n`);
}

function strictText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function contentTokens(value: string) {
  return strictText(value).toLocaleLowerCase('en-US').replace(/[\p{P}\p{S}]+/gu, ' ').split(/\s+/).filter(Boolean);
}

function editDistance(expected: string[], actual: string[]) {
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    const current = [expectedIndex];
    for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
      current[actualIndex] = Math.min(
        previous[actualIndex] + 1,
        current[actualIndex - 1] + 1,
        previous[actualIndex - 1] + (expected[expectedIndex - 1] === actual[actualIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[actual.length];
}

function metric(expected: string, actual: string) {
  const expectedTokens = contentTokens(expected);
  const actualTokens = contentTokens(actual);
  const wordErrors = editDistance(expectedTokens, actualTokens);
  return {
    contentExact: wordErrors === 0,
    strictExact: strictText(expected) === strictText(actual),
    wordCount: expectedTokens.length,
    wordErrors,
    wer: expectedTokens.length ? wordErrors / expectedTokens.length : Number(actualTokens.length > 0),
  };
}

function entities(value: string) {
  const patterns: Array<[string, RegExp]> = [
    ['callsign', /\b[A-Z]{2,3}\s?\d{1,4}\b/g],
    ['runway', /\brunway\s+\d{1,2}[LRC]?\b/gi],
    ['heading', /\bheading\s+\d{3}\b/gi],
    ['frequency', /\b\d{3}\.\d{1,3}\b/g],
    ['squawk', /\bsquawk(?:ing|ed)?\s+\d{4}\b/gi],
    ['letter', /\b[A-Z]{2,}(?:-[A-Z])?\b/g],
    ['number', /\b\d+(?:\.\d+)?[LRC]?\b/g],
  ];
  return patterns.flatMap(([type, pattern]) => [...value.matchAll(pattern)].map((match) => ({
    type,
    value: match[0].toLocaleUpperCase().replace(/\s+/g, ' '),
  })));
}

function entityDifference(expected: Array<{ type: string; value: string }>, actual: Array<{ type: string; value: string }>) {
  const countsFor = (items: Array<{ type: string; value: string }>) => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = `${item.type}:${item.value}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const expectedCounts = countsFor(expected);
  const actualCounts = countsFor(actual);
  const missing = [...expectedCounts].flatMap(([key, count]) => Array.from({ length: Math.max(0, count - (actualCounts.get(key) ?? 0)) }, () => key));
  const hallucinated = [...actualCounts].flatMap(([key, count]) => Array.from({ length: Math.max(0, count - (expectedCounts.get(key) ?? 0)) }, () => key));
  return { missing, hallucinated, errorCount: missing.length + hallucinated.length };
}

function defaultClassification(contentExact: boolean): Classification {
  return contentExact
    ? { mainCategory: 'MATCH', note: '自动内容匹配；主线程仍可抽查。', referenceStatus: 'aligned', semanticOutcome: 'correct' }
    : { mainCategory: null, note: '', referenceStatus: null, semanticOutcome: null };
}

function aggregate(samples: Array<{
  bankId: ModuleId;
  critical: { errorCount: number };
  final: ReturnType<typeof metric>;
  raw: ReturnType<typeof metric>;
}>) {
  const summarize = (items: typeof samples) => {
    const words = items.reduce((total, sample) => total + sample.raw.wordCount, 0);
    return {
      sampleCount: items.length,
      rawContentExact: items.filter((sample) => sample.raw.contentExact).length,
      finalContentExact: items.filter((sample) => sample.final.contentExact).length,
      rawWer: words ? items.reduce((total, sample) => total + sample.raw.wordErrors, 0) / words : 0,
      finalWer: words ? items.reduce((total, sample) => total + sample.final.wordErrors, 0) / words : 0,
      criticalEntityErrors: items.reduce((total, sample) => total + sample.critical.errorCount, 0),
    };
  };
  return {
    overall: summarize(samples),
    byModule: Object.fromEntries(moduleOrder.map((module) => [module, summarize(samples.filter((sample) => sample.bankId === module))])),
  };
}

async function report() {
  const manifest = await readJson<SampleManifest>(resolve(root, arg('manifest')));
  const raw = await readJson<RawOutput>(resolve(root, arg('raw')));
  const outputPath = resolve(root, arg('output'));
  const classificationPath = resolve(root, arg('classification', join(dirname(outputPath), 'classification.json')));
  const normalizationSha256 = sha256(await readFile(normalizationSourcePath));
  const classifications = await exists(classificationPath)
    ? await readJson<Record<string, Classification>>(classificationPath)
    : {};
  const evaluated = manifest.samples.map((sample) => {
    const result = raw.results[sample.id];
    if (!result || result.status !== 'success' || !result.rawTranscript) {
      return {
        ...sample,
        status: 'failed' as const,
        error: result?.error ?? 'missing_raw_result',
        classification: classifications[sample.id] ?? {
          mainCategory: 'NO_SPEECH_OR_INPUT', note: '', referenceStatus: 'suspect', semanticOutcome: 'excluded',
        },
      };
    }
    const normalized = normalizeAviationTranscriptDetailed(result.rawTranscript);
    const rawMetric = metric(sample.expectedText, result.rawTranscript);
    const finalMetric = metric(sample.expectedText, normalized.transcript);
    const critical = entityDifference(entities(sample.expectedText), entities(normalized.transcript));
    return {
      ...sample,
      status: 'success' as const,
      rawTranscript: result.rawTranscript,
      transcript: normalized.transcript,
      transformations: normalized.transformations,
      raw: rawMetric,
      final: finalMetric,
      critical,
      classification: manifest.phase === 'cumulative' && finalMetric.contentExact
        ? defaultClassification(true)
        : classifications[sample.id] ?? defaultClassification(finalMetric.contentExact),
    };
  });
  const template = Object.fromEntries(evaluated.map((sample) => [sample.id, sample.classification]));
  if (!await exists(classificationPath)) await writeJson(classificationPath, template);
  const successful = evaluated.filter((sample): sample is Extract<typeof sample, { status: 'success' }> => sample.status === 'success');
  const output = {
    schemaVersion: 1,
    campaignId: manifest.campaignId,
    round: manifest.round,
    phase: manifest.phase,
    versions: {
      model: raw.model,
      hotwords: raw.hotwords,
      normalizationVersion: AVIATION_TRANSCRIPT_NORMALIZATION_VERSION,
      normalizationSha256,
    },
    summary: {
      ...aggregate(successful),
      failed: evaluated.length - successful.length,
      classificationComplete: evaluated.filter((sample) => sample.classification.mainCategory && sample.classification.semanticOutcome && sample.classification.referenceStatus).length,
      total: evaluated.length,
    },
    samples: evaluated,
  };
  await writeJson(outputPath, output);
  const markdown = [
    manifest.phase === 'cumulative'
      ? '# 五轮累计回归报告'
      : `# 第 ${manifest.round} 轮${manifest.phase === 'development' ? '开发集' : manifest.phase === 'blind' ? '盲测' : '定向复听'}报告`,
    '',
    `- 模型：\`${raw.model}\``,
    `- 热词模式：\`${raw.hotwords.mode}\``,
    `- 规范化：\`${AVIATION_TRANSCRIPT_NORMALIZATION_VERSION}\``,
    `- 样本：${evaluated.length}，失败：${output.summary.failed}，分类完成：${output.summary.classificationComplete}/${evaluated.length}`,
    '',
    '| 模块 | 样本 | 原始内容匹配 | 最终内容匹配 | 原始 WER | 最终 WER | 关键实体差异 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...moduleOrder.map((module) => {
      const item = output.summary.byModule[module];
      return `| ${module} | ${item.sampleCount} | ${item.rawContentExact} | ${item.finalContentExact} | ${(item.rawWer * 100).toFixed(2)}% | ${(item.finalWer * 100).toFixed(2)}% | ${item.criticalEntityErrors} |`;
    }),
    '',
    '> WER 和自动关键实体差异只用于定位；最终分类、语义判断与源数据噪点由主线程逐条复核。',
    '',
  ].join('\n');
  await writeFile(outputPath.replace(/\.json$/, '.md'), markdown);
  process.stdout.write(`asr_report_written phase=${manifest.phase} round=${manifest.round} success=${successful.length} classification=${output.summary.classificationComplete}/${evaluated.length}\n`);
}

async function validateClassification() {
  const path = resolve(root, arg('classification'));
  const classifications = await readJson<Record<string, Classification>>(path);
  const incomplete = Object.entries(classifications).filter(([, value]) => !value.mainCategory || !value.referenceStatus || !value.semanticOutcome || !value.note.trim());
  if (incomplete.length) throw new Error(`incomplete_asr_classification:${incomplete.map(([id]) => id).join(',')}`);
  process.stdout.write(`asr_classification_ok samples=${Object.keys(classifications).length}\n`);
}

async function applyClassification() {
  const path = resolve(root, arg('classification'));
  const decisionsPath = resolve(root, arg('decisions'));
  const classifications = await readJson<Record<string, Classification>>(path);
  const decisions = await readJson<Record<string, Classification>>(decisionsPath);
  const unknown = Object.keys(decisions).filter((id) => !(id in classifications));
  if (unknown.length) throw new Error(`unknown_asr_classification_decision:${unknown.join(',')}`);
  const onlyIncomplete = process.argv.includes('--only-incomplete');
  const applicable = Object.fromEntries(Object.entries(decisions).filter(([id]) => (
    !onlyIncomplete || !classifications[id].mainCategory
  )));
  await writeJson(path, { ...classifications, ...applicable });
  process.stdout.write(`asr_classification_applied decisions=${Object.keys(applicable).length} samples=${Object.keys(classifications).length}\n`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'prepare-development') await prepareManifest('development', Number(arg('round')));
  else if (command === 'prepare-blind') await prepareManifest('blind', Number(arg('round')));
  else if (command === 'prepare-cumulative') await prepareCumulative();
  else if (command === 'prepare-targeted') await prepareTargeted();
  else if (command === 'prepare-run') await prepareRun();
  else if (command === 'collect-raw') await collectRaw();
  else if (command === 'report') await report();
  else if (command === 'apply-classification') await applyClassification();
  else if (command === 'validate-classification') await validateClassification();
  else throw new Error(`unsupported_command:${command ?? ''}`);
}

void main();
