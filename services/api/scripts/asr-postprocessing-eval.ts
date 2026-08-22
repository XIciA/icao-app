import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeAviationTranscriptDetailed } from '../src/ai/aviation-transcript-normalization';
import type { TranscriptTransformation } from '../src/ai/aviation-transcript-normalization';

type ModuleId = 'sentences900' | 'listening' | 'radiotelephony';

type Card = {
  id: string;
  audio?: string;
  audioText: string;
};

type Bank = {
  id: string;
  categories: Array<{ topics: Array<{ cards: Card[] }> }>;
};

type AudioEntry = {
  file: string;
  source: string;
};

type EvalSample = {
  audio: string;
  expectedText: string;
  id: string;
  module: ModuleId;
  sourcePath: string;
  targeted: boolean;
};

type Manifest = {
  blind: EvalSample[];
  createdAt: string;
  rounds: Array<{ round: number; samples: EvalSample[] }>;
  schemaVersion: 1;
  seed: string;
};

type Cache = {
  model: string;
  schemaVersion: 1;
  transcripts: Record<string, { audio: string; rawTranscript: string; transcribedAt: string }>;
};

type SampleMetric = {
  contentExact: boolean;
  strictExact: boolean;
  wordErrors: number;
  wordCount: number;
  wer: number;
};

type EvaluatedSample = EvalSample & {
  normalizationVersion: string;
  post: SampleMetric;
  raw: SampleMetric;
  rawTranscript: string;
  review?: ReferenceReview;
  transcript: string;
  transformations: TranscriptTransformation[];
};

type ReferenceReview = {
  note: string;
  status: 'audio-text-mismatch' | 'suspect' | 'text-error';
};

type Summary = {
  excluded: number;
  improved: number;
  postContentExact: number;
  postStrictExact: number;
  postWer: number;
  rawContentExact: number;
  rawStrictExact: number;
  rawWer: number;
  sampleCount: number;
  totalSampleCount: number;
  unchanged: number;
  worsened: number;
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const evidenceRoot = join(repoRoot, 'docs/records/workstreams/asr-postprocessing-optimization/evidence');
const manifestPath = join(evidenceRoot, 'manifest.json');
const cachePath = join(evidenceRoot, 'raw-transcripts.json');
const referenceReviewPath = join(evidenceRoot, 'reference-review.json');
const blindReferenceReviewPath = join(evidenceRoot, 'blind-reference-review.json');
const campaign2ManifestPath = join(evidenceRoot, 'campaign-02-manifest.json');
const campaign2ReferenceReviewPath = join(evidenceRoot, 'campaign-02-reference-review.json');
const bankPath = join(repoRoot, 'src/features/question-bank/data/question-bank.json');
const audioIndexPath = join(repoRoot, 'src/features/question-bank/data/audio-index.json');
const modules: ModuleId[] = ['sentences900', 'listening', 'radiotelephony'];
const targetedPattern = /\b(?:ads[- ]?b|atc|departure|flight\s+level|frequency|heading|mayday|ndb|pan[ -]pan|qfe|qnh|rnav|runway|squawk|vor)\b|\d/i;

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function stableRank(seed: string, value: string) {
  return createHash('sha256').update(`${seed}:${value}`).digest('hex');
}

function flattenCards(bank: Bank) {
  return bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function audioMap(index: { modules: Record<string, Record<string, AudioEntry[]> | { mode: string; groups: object }> }) {
  const result = new Map<string, string>();
  for (const value of Object.values(index.modules)) {
    for (const entries of Object.values(value)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as AudioEntry[]) result.set(entry.file, entry.source);
    }
  }
  return result;
}

function takeRanked(samples: EvalSample[], count: number, seed: string) {
  return [...samples]
    .sort((left, right) => stableRank(seed, left.id).localeCompare(stableRank(seed, right.id)))
    .slice(0, count);
}

function sourceAudioFor(module: ModuleId, cardId: string, sources: Map<string, string>) {
  let audio: string | undefined;
  if (module === 'sentences900') {
    const match = cardId.match(/^sentence900-main-(\d+)$/);
    if (match) audio = `/question-bank-assets/audio/sentence900/main/${match[1]}.mp3`;
  } else if (module === 'listening') {
    const match = cardId.match(/^listening-main-(\d+)$/);
    if (match) audio = `/question-bank-assets/audio/listening/main/${match[1]}.mp3`;
  } else {
    const match = cardId.match(/-card-(main|supplement)-(\d+)$/);
    if (match) audio = `/question-bank-assets/audio/radiotelephony/${match[1]}/${match[2]}.mp3`;
  }
  const sourcePath = audio ? sources.get(audio) : undefined;
  return audio && sourcePath ? { audio, sourcePath } : undefined;
}

async function prepare(roundCount: number) {
  const banks = await readJson<Bank[]>(bankPath);
  const index = await readJson<{ modules: Record<string, Record<string, AudioEntry[]> | { mode: string; groups: object }> }>(audioIndexPath);
  const sources = audioMap(index);
  const seed = 'asr-postprocessing-v1';
  const selected = new Set<string>();
  const pools = new Map<ModuleId, EvalSample[]>();

  for (const module of modules) {
    const bank = banks.find((item) => item.id === module);
    if (!bank) throw new Error(`missing_bank:${module}`);
    const samples = flattenCards(bank).flatMap((card): EvalSample[] => {
      const sourceAudio = sourceAudioFor(module, card.id, sources);
      if (!sourceAudio || !card.audioText.trim()) return [];
      return [{
        audio: sourceAudio.audio,
        expectedText: card.audioText,
        id: card.id,
        module,
        sourcePath: sourceAudio.sourcePath,
        targeted: targetedPattern.test(card.audioText),
      }];
    });
    pools.set(module, samples);
  }

  const blind = modules.flatMap((module) => {
    const chosen = takeRanked(pools.get(module) ?? [], 30, `${seed}:blind:${module}`)
      .map((sample) => ({ ...sample, targeted: false }));
    chosen.forEach((sample) => selected.add(sample.id));
    return chosen;
  });

  const rounds = Array.from({ length: roundCount }, (_, roundIndex) => {
    const round = roundIndex + 1;
    const samples = modules.flatMap((module) => {
      const available = (pools.get(module) ?? []).filter((sample) => !selected.has(sample.id));
      const targeted = takeRanked(available.filter((sample) => sample.targeted), 3, `${seed}:round:${round}:${module}:targeted`)
        .map((sample) => ({ ...sample, targeted: true }));
      targeted.forEach((sample) => selected.add(sample.id));
      const random = takeRanked(available.filter((sample) => !selected.has(sample.id)), 7, `${seed}:round:${round}:${module}:random`)
        .map((sample) => ({ ...sample, targeted: false }));
      random.forEach((sample) => selected.add(sample.id));
      return [...targeted, ...random];
    });
    if (samples.length !== modules.length * 10) throw new Error(`insufficient_round_samples:${round}`);
    return { round, samples };
  });

  const manifest: Manifest = { blind, createdAt: new Date().toISOString(), rounds, schemaVersion: 1, seed };
  await writeJson(manifestPath, manifest);
  process.stdout.write(`Prepared ${rounds.length} rounds (${rounds.length * 30} samples) and ${blind.length} blind samples.\n`);
}

async function prepareCampaign2() {
  const banks = await readJson<Bank[]>(bankPath);
  const index = await readJson<{ modules: Record<string, Record<string, AudioEntry[]> | { mode: string; groups: object }> }>(audioIndexPath);
  const previous = await readJson<Manifest>(manifestPath);
  const sources = audioMap(index);
  const seed = 'asr-postprocessing-campaign-02';
  const selected = new Set([
    ...previous.blind.map((sample) => sample.id),
    ...previous.rounds.flatMap((entry) => entry.samples.map((sample) => sample.id)),
  ]);
  const pools = new Map<ModuleId, EvalSample[]>();

  for (const module of modules) {
    const bank = banks.find((item) => item.id === module);
    if (!bank) throw new Error(`missing_bank:${module}`);
    pools.set(module, flattenCards(bank).flatMap((card): EvalSample[] => {
      const sourceAudio = sourceAudioFor(module, card.id, sources);
      if (!sourceAudio || !card.audioText.trim() || selected.has(card.id)) return [];
      return [{
        audio: sourceAudio.audio,
        expectedText: card.audioText,
        id: card.id,
        module,
        sourcePath: sourceAudio.sourcePath,
        targeted: targetedPattern.test(card.audioText),
      }];
    }));
  }

  const blind = modules.flatMap((module) => {
    const chosen = takeRanked(pools.get(module) ?? [], 60, `${seed}:blind:${module}`)
      .map((sample) => ({ ...sample, targeted: false }));
    chosen.forEach((sample) => selected.add(sample.id));
    return chosen;
  });
  const rounds = Array.from({ length: 10 }, (_, roundIndex) => {
    const round = roundIndex + 1;
    const samples = modules.flatMap((module) => {
      const available = (pools.get(module) ?? []).filter((sample) => !selected.has(sample.id));
      const targeted = takeRanked(available.filter((sample) => sample.targeted), 5, `${seed}:round:${round}:${module}:targeted`)
        .map((sample) => ({ ...sample, targeted: true }));
      targeted.forEach((sample) => selected.add(sample.id));
      const random = takeRanked(available.filter((sample) => !selected.has(sample.id)), 15, `${seed}:round:${round}:${module}:random`)
        .map((sample) => ({ ...sample, targeted: false }));
      random.forEach((sample) => selected.add(sample.id));
      return [...targeted, ...random];
    });
    if (samples.length !== 60) throw new Error(`insufficient_campaign2_round_samples:${round}`);
    return { round, samples };
  });
  const manifest: Manifest = { blind, createdAt: new Date().toISOString(), rounds, schemaVersion: 1, seed };
  await writeJson(campaign2ManifestPath, manifest);
  await writeJson(campaign2ReferenceReviewPath, {});
  process.stdout.write('Prepared campaign 02: 10 rounds (600 samples) and 180 blind samples.\n');
}

async function loadCache(model: string): Promise<Cache> {
  try {
    const cache = await readJson<Cache>(cachePath);
    if (cache.model !== model) throw new Error(`cache_model_mismatch:${cache.model}:${model}`);
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { model, schemaVersion: 1, transcripts: {} };
  }
}

function extractTranscript(payload: unknown) {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((item) => typeof item === 'string' ? item : (item as { text?: unknown })?.text)
      .filter((item): item is string => typeof item === 'string')
      .join(' ')
      .trim();
    if (text) return text;
  }
  throw new Error('invalid_asr_response');
}

async function transcribeOne(sample: EvalSample, input: { apiKey: string; baseUrl: string; model: string }) {
  const audio = await readFile(sample.sourcePath);
  const extension = sample.sourcePath.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'wav' ? 'audio/wav' : extension === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asr_options: { enable_itn: false, language: 'en' },
          messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mimeType};base64,${audio.toString('base64')}` } }] }],
          model: input.model,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`asr_http_${response.status}`);
      return extractTranscript(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1_000));
    }
  }
  throw lastError;
}

async function transcribeSamples(samples: EvalSample[], label: string) {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) throw new Error('missing_DASHSCOPE_API_KEY');
  const model = process.env.AI_ASR_MODEL?.trim() || 'qwen3-asr-flash';
  const baseUrl = process.env.DASHSCOPE_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const cache = await loadCache(model);
  const pending = samples.filter((sample) => cache.transcripts[sample.id]?.audio !== sample.audio);

  for (let index = 0; index < pending.length; index += 3) {
    const batch = pending.slice(index, index + 3);
    const results = await Promise.allSettled(batch.map(async (sample) => ({ sample, rawTranscript: await transcribeOne(sample, { apiKey, baseUrl, model }) })));
    for (const result of results) {
      if (result.status === 'rejected') continue;
      cache.transcripts[result.value.sample.id] = { audio: result.value.sample.audio, rawTranscript: result.value.rawTranscript, transcribedAt: new Date().toISOString() };
    }
    await writeJson(cachePath, cache);
    process.stdout.write(`${label}: cached ${Math.min(index + batch.length, pending.length)}/${pending.length} new transcripts.\n`);
  }
  const failed = samples.filter((sample) => cache.transcripts[sample.id]?.audio !== sample.audio);
  if (failed.length) throw new Error(`${label}: ${failed.length} transcripts remain; rerun to resume`);
}

async function transcribeRound(round: number) {
  const manifest = await readJson<Manifest>(manifestPath);
  const roundEntry = manifest.rounds.find((item) => item.round === round);
  if (!roundEntry) throw new Error(`missing_round:${round}`);
  return transcribeSamples(roundEntry.samples, `Round ${round}`);
}

async function transcribeBlind() {
  const manifest = await readJson<Manifest>(manifestPath);
  return transcribeSamples(manifest.blind, 'Blind');
}

async function transcribeCampaign2Round(round: number) {
  const manifest = await readJson<Manifest>(campaign2ManifestPath);
  const roundEntry = manifest.rounds.find((item) => item.round === round);
  if (!roundEntry) throw new Error(`missing_campaign2_round:${round}`);
  return transcribeSamples(roundEntry.samples, `Campaign 02 round ${round}`);
}

async function transcribeCampaign2Blind() {
  const manifest = await readJson<Manifest>(campaign2ManifestPath);
  return transcribeSamples(manifest.blind, 'Campaign 02 blind');
}

function strictText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function contentTokens(value: string) {
  return strictText(value)
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function evaluationAliasText(value: string) {
  const withoutLabels = value.replace(/(^|\n)\s*(?:P|C|B|PIL|CTL|M1|M2|CAPTAIN|PURSER)\s*[:：]\s*/gi, '$1');
  const withCallsignAliases = withoutLabels
    .replace(/\bBAW\s*(\d+)\b/gi, 'Speedbird $1')
    .replace(/\bCCA\s*(\d+)\b/gi, 'Air China $1')
    .replace(/\bCES\s*(\d+)\b/gi, 'China Eastern $1')
    .replace(/\bCSN\s*(\d+)\b/gi, 'China Southern $1')
    .replace(/\bSIA\s*(\d+)\b/gi, 'Singapore $1')
    .replace(/\bACA\s*(\d+)\b/gi, 'Air Canada $1')
    .replace(/\bAFR\s*(\d+)\b/gi, 'Air France $1')
    .replace(/\bUAL\s*(\d+)\b/gi, 'United $1')
    .replace(/\bJAL\s*(\d+)\b/gi, 'Japan Air $1')
    .replace(/\bGWL\s*(\d+)\b/gi, 'Great Wall $1')
    .replace(/\bNW\s*(\d+)\b/gi, 'Northwest $1')
    .replace(/\bNWA\s*(\d+)\b/gi, 'Northwest $1')
    .replace(/\bR\s+V\s+S\s+M\b/gi, 'RVSM')
    .replace(/\bwind[-\s]+shear\b/gi, 'windshear');
  return withCallsignAliases;
}

function equivalentMetric(expected: string, actual: string) {
  const normalizedExpected = normalizeAviationTranscriptDetailed(evaluationAliasText(expected)).transcript;
  return metric(normalizedExpected, evaluationAliasText(actual));
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

function metric(expected: string, actual: string): SampleMetric {
  const expectedTokens = contentTokens(expected);
  const actualTokens = contentTokens(actual);
  const wordErrors = editDistance(expectedTokens, actualTokens);
  return {
    contentExact: wordErrors === 0,
    strictExact: strictText(expected) === strictText(actual),
    wordErrors,
    wordCount: expectedTokens.length,
    wer: expectedTokens.length ? wordErrors / expectedTokens.length : Number(actualTokens.length > 0),
  };
}

function summarize(samples: EvaluatedSample[]): Summary {
  const included = samples.filter((sample) => !sample.review || sample.review.status === 'suspect');
  const rawErrors = included.reduce((total, sample) => total + sample.raw.wordErrors, 0);
  const postErrors = included.reduce((total, sample) => total + sample.post.wordErrors, 0);
  const words = included.reduce((total, sample) => total + sample.raw.wordCount, 0);
  return {
    excluded: samples.length - included.length,
    improved: included.filter((sample) => sample.post.wordErrors < sample.raw.wordErrors).length,
    postContentExact: included.filter((sample) => sample.post.contentExact).length,
    postStrictExact: included.filter((sample) => sample.post.strictExact).length,
    postWer: words ? postErrors / words : 0,
    rawContentExact: included.filter((sample) => sample.raw.contentExact).length,
    rawStrictExact: included.filter((sample) => sample.raw.strictExact).length,
    rawWer: words ? rawErrors / words : 0,
    sampleCount: included.length,
    totalSampleCount: samples.length,
    unchanged: included.filter((sample) => sample.post.wordErrors === sample.raw.wordErrors).length,
    worsened: included.filter((sample) => sample.post.wordErrors > sample.raw.wordErrors).length,
  };
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

async function report(round: number, label: string) {
  const manifest = await readJson<Manifest>(manifestPath);
  const cache = await readJson<Cache>(cachePath);
  let referenceReviews: Record<string, ReferenceReview> = {};
  try {
    referenceReviews = await readJson<Record<string, ReferenceReview>>(referenceReviewPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const samples = manifest.rounds
    .filter((entry) => entry.round <= round)
    .flatMap((entry) => entry.samples)
    .map((sample): EvaluatedSample => {
      const rawTranscript = cache.transcripts[sample.id]?.rawTranscript;
      if (!rawTranscript) throw new Error(`missing_transcript:${sample.id}`);
      const normalized = normalizeAviationTranscriptDetailed(rawTranscript);
      return {
        ...sample,
        normalizationVersion: normalized.version,
        post: metric(sample.expectedText, normalized.transcript),
        raw: metric(sample.expectedText, rawTranscript),
        rawTranscript,
        review: referenceReviews[sample.id],
        transcript: normalized.transcript,
        transformations: normalized.transformations,
      };
    });
  const summary = summarize(samples);
  const prefix = `round-${String(round).padStart(2, '0')}-${label}`;
  const jsonPath = join(evidenceRoot, `${prefix}.json`);
  const markdownPath = join(evidenceRoot, `${prefix}.md`);
  let beforeSummary: Summary | undefined;
  if (label === 'after') {
    try {
      beforeSummary = (await readJson<{ summary: Summary }>(join(evidenceRoot, `round-${String(round).padStart(2, '0')}-before.json`))).summary;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await writeJson(jsonPath, { generatedAt: new Date().toISOString(), label, round, samples, summary });
  const delta = beforeSummary
    ? `\n## 本轮优化变化\n\n- WER：${percent(beforeSummary.postWer)} -> ${percent(summary.postWer)}（${((summary.postWer - beforeSummary.postWer) * 100).toFixed(2)} 个百分点）\n- 内容完全匹配：${beforeSummary.postContentExact} -> ${summary.postContentExact}\n- 变差样本：${beforeSummary.worsened} -> ${summary.worsened}\n`
    : '';
  const rows = samples.map((sample) => `| ${sample.module} | ${sample.id} | ${sample.raw.wordErrors} | ${sample.post.wordErrors} | ${sample.post.wordErrors < sample.raw.wordErrors ? '改善' : sample.post.wordErrors > sample.raw.wordErrors ? '变差' : '不变'} |`).join('\n');
  const markdown = `# ASR 后置优化第 ${round} 轮（${label}）\n\n## 累计结果\n\n- 有效样本：${summary.sampleCount} / ${summary.totalSampleCount}\n- 排除源文本错误：${summary.excluded}\n- 原始 WER：${percent(summary.rawWer)}\n- 后置 WER：${percent(summary.postWer)}\n- 原始内容完全匹配：${summary.rawContentExact}\n- 后置内容完全匹配：${summary.postContentExact}\n- 改善 / 不变 / 变差：${summary.improved} / ${summary.unchanged} / ${summary.worsened}\n${delta}\n## 样本摘要\n\n| 模块 | 样本 | 原始错误词 | 后置错误词 | 结果 |\n| --- | --- | ---: | ---: | --- |\n${rows}\n`;
  await writeFile(markdownPath, markdown);
  process.stdout.write(`${prefix}: raw WER ${percent(summary.rawWer)}, post WER ${percent(summary.postWer)}, improved ${summary.improved}, worsened ${summary.worsened}.\n`);
}

async function reportBlind() {
  const manifest = await readJson<Manifest>(manifestPath);
  const cache = await readJson<Cache>(cachePath);
  let referenceReviews: Record<string, ReferenceReview> = {};
  try {
    referenceReviews = await readJson<Record<string, ReferenceReview>>(blindReferenceReviewPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const samples = manifest.blind.map((sample): EvaluatedSample => {
    const rawTranscript = cache.transcripts[sample.id]?.rawTranscript;
    if (!rawTranscript) throw new Error(`missing_transcript:${sample.id}`);
    const normalized = normalizeAviationTranscriptDetailed(rawTranscript);
    return {
      ...sample,
      normalizationVersion: normalized.version,
      post: metric(sample.expectedText, normalized.transcript),
      raw: metric(sample.expectedText, rawTranscript),
      rawTranscript,
      review: referenceReviews[sample.id],
      transcript: normalized.transcript,
      transformations: normalized.transformations,
    };
  });
  const summary = summarize(samples);
  const moduleSummaries = Object.fromEntries(modules.map((module) => [
    module,
    summarize(samples.filter((sample) => sample.module === module)),
  ]));
  await writeJson(join(evidenceRoot, 'blind-report.json'), {
    generatedAt: new Date().toISOString(),
    moduleSummaries,
    samples,
    summary,
  });
  const rows = modules.map((module) => {
    const item = moduleSummaries[module];
    return `| ${module} | ${item.sampleCount} | ${percent(item.rawWer)} | ${percent(item.postWer)} | ${item.improved} | ${item.worsened} |`;
  }).join('\n');
  const markdown = `# ASR 后置优化盲测报告\n\n## 总结果\n\n- 有效样本：${summary.sampleCount} / ${summary.totalSampleCount}\n- 排除源文本错误：${summary.excluded}\n- 原始 WER：${percent(summary.rawWer)}\n- 后置 WER：${percent(summary.postWer)}\n- 内容完全匹配：${summary.rawContentExact} -> ${summary.postContentExact}\n- 改善 / 不变 / 变差：${summary.improved} / ${summary.unchanged} / ${summary.worsened}\n\n## 分模块\n\n| 模块 | 有效样本 | 原始 WER | 后置 WER | 改善 | 变差 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows}\n`;
  await writeFile(join(evidenceRoot, 'blind-report.md'), markdown);
  process.stdout.write(`blind: raw WER ${percent(summary.rawWer)}, post WER ${percent(summary.postWer)}, improved ${summary.improved}, worsened ${summary.worsened}.\n`);
}

type CampaignEvaluatedSample = EvaluatedSample & {
  equivalentPost: SampleMetric;
  equivalentRaw: SampleMetric;
};

function summarizeEquivalent(samples: CampaignEvaluatedSample[]) {
  const included = samples.filter((sample) => !sample.review || sample.review.status === 'suspect');
  const rawErrors = included.reduce((total, sample) => total + sample.equivalentRaw.wordErrors, 0);
  const postErrors = included.reduce((total, sample) => total + sample.equivalentPost.wordErrors, 0);
  const words = included.reduce((total, sample) => total + sample.equivalentRaw.wordCount, 0);
  return {
    improved: included.filter((sample) => sample.equivalentPost.wordErrors < sample.equivalentRaw.wordErrors).length,
    postWer: words ? postErrors / words : 0,
    rawWer: words ? rawErrors / words : 0,
    unchanged: included.filter((sample) => sample.equivalentPost.wordErrors === sample.equivalentRaw.wordErrors).length,
    worsened: included.filter((sample) => sample.equivalentPost.wordErrors > sample.equivalentRaw.wordErrors).length,
  };
}

async function campaign2Samples(samples: EvalSample[]) {
  const cache = await readJson<Cache>(cachePath);
  let referenceReviews: Record<string, ReferenceReview> = {};
  try {
    referenceReviews = await readJson<Record<string, ReferenceReview>>(campaign2ReferenceReviewPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return samples.map((sample): CampaignEvaluatedSample => {
    const rawTranscript = cache.transcripts[sample.id]?.rawTranscript;
    if (!rawTranscript) throw new Error(`missing_transcript:${sample.id}`);
    const normalized = normalizeAviationTranscriptDetailed(rawTranscript);
    return {
      ...sample,
      equivalentPost: equivalentMetric(sample.expectedText, normalized.transcript),
      equivalentRaw: equivalentMetric(sample.expectedText, rawTranscript),
      normalizationVersion: normalized.version,
      post: metric(sample.expectedText, normalized.transcript),
      raw: metric(sample.expectedText, rawTranscript),
      rawTranscript,
      review: referenceReviews[sample.id],
      transcript: normalized.transcript,
      transformations: normalized.transformations,
    };
  });
}

async function reportCampaign2(round: number, label: string) {
  const manifest = await readJson<Manifest>(campaign2ManifestPath);
  const samples = await campaign2Samples(manifest.rounds
    .filter((entry) => entry.round <= round)
    .flatMap((entry) => entry.samples));
  const surface = summarize(samples);
  const equivalent = summarizeEquivalent(samples);
  const prefix = `campaign-02-round-${String(round).padStart(2, '0')}-${label}`;
  await writeJson(join(evidenceRoot, `${prefix}.json`), {
    equivalent,
    generatedAt: new Date().toISOString(),
    label,
    round,
    samples,
    surface,
  });
  const markdown = `# 第二阶段第 ${round} 轮（${label}）\n\n- 有效样本：${surface.sampleCount} / ${surface.totalSampleCount}\n- 表面 WER：${percent(surface.rawWer)} -> ${percent(surface.postWer)}\n- 等价 WER：${percent(equivalent.rawWer)} -> ${percent(equivalent.postWer)}\n- 表面改善 / 变差：${surface.improved} / ${surface.worsened}\n- 等价改善 / 变差：${equivalent.improved} / ${equivalent.worsened}\n`;
  await writeFile(join(evidenceRoot, `${prefix}.md`), markdown);
  process.stdout.write(`${prefix}: surface ${percent(surface.postWer)}, equivalent ${percent(equivalent.postWer)}, worsened ${surface.worsened}/${equivalent.worsened}.\n`);
}

async function reportCampaign2Blind() {
  const manifest = await readJson<Manifest>(campaign2ManifestPath);
  const samples = await campaign2Samples(manifest.blind);
  const surface = summarize(samples);
  const equivalent = summarizeEquivalent(samples);
  const moduleSummaries = Object.fromEntries(modules.map((module) => {
    const moduleSamples = samples.filter((sample) => sample.module === module);
    return [module, { equivalent: summarizeEquivalent(moduleSamples), surface: summarize(moduleSamples) }];
  }));
  await writeJson(join(evidenceRoot, 'campaign-02-blind-report.json'), {
    equivalent,
    generatedAt: new Date().toISOString(),
    moduleSummaries,
    samples,
    surface,
  });
  const markdown = `# 第二阶段终局盲测\n\n- 有效样本：${surface.sampleCount} / ${surface.totalSampleCount}\n- 表面 WER：${percent(surface.rawWer)} -> ${percent(surface.postWer)}\n- 等价 WER：${percent(equivalent.rawWer)} -> ${percent(equivalent.postWer)}\n- 表面改善 / 变差：${surface.improved} / ${surface.worsened}\n- 等价改善 / 变差：${equivalent.improved} / ${equivalent.worsened}\n`;
  await writeFile(join(evidenceRoot, 'campaign-02-blind-report.md'), markdown);
  process.stdout.write(`campaign-02-blind: surface ${percent(surface.postWer)}, equivalent ${percent(equivalent.postWer)}, worsened ${surface.worsened}/${equivalent.worsened}.\n`);
}

async function main() {
  const command = process.argv[2];
  const round = Number(arg('round', '1'));
  if (command === 'prepare') return prepare(Number(arg('rounds', '5')));
  if (command === 'prepare-campaign2') return prepareCampaign2();
  if (command === 'transcribe') return transcribeRound(round);
  if (command === 'transcribe-blind') return transcribeBlind();
  if (command === 'transcribe-campaign2') return transcribeCampaign2Round(round);
  if (command === 'transcribe-campaign2-blind') return transcribeCampaign2Blind();
  if (command === 'report') return report(round, arg('label', 'before') ?? 'before');
  if (command === 'report-blind') return reportBlind();
  if (command === 'report-campaign2') return reportCampaign2(round, arg('label', 'before') ?? 'before');
  if (command === 'report-campaign2-blind') return reportCampaign2Blind();
  throw new Error('usage: pnpm asr:eval <prepare|prepare-campaign2|transcribe|transcribe-blind|transcribe-campaign2|transcribe-campaign2-blind|report|report-blind|report-campaign2|report-campaign2-blind>');
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
