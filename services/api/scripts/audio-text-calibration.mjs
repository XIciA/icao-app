import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sourcePath = join(repoRoot, 'src/features/question-bank/data/question-bank.json');
const workstreamRoot = join(repoRoot, 'docs/workstreams/audio-text-calibration-15');
const manifestPath = join(workstreamRoot, 'manifest.json');
const transcriptPath = join(workstreamRoot, 'whisper-transcripts.json');
const designAssetRoot = '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets';
const bankIds = ['listening', 'radiotelephony', 'storytelling'];

function cleanText(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function contentTokens(value) {
  return cleanText(value)
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(expected, actual) {
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

function metric(expected, actual) {
  const expectedTokens = contentTokens(expected);
  const actualTokens = contentTokens(actual);
  const errors = editDistance(expectedTokens, actualTokens);
  return {
    contentExact: errors === 0,
    errors,
    referenceWords: expectedTokens.length,
    wer: expectedTokens.length ? errors / expectedTokens.length : Number(actualTokens.length > 0),
  };
}

function durationSeconds(audioPath) {
  const output = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath,
  ], { encoding: 'utf8' });
  return Number(Number(output.trim()).toFixed(3));
}

async function prepare() {
  const banks = JSON.parse(await readFile(sourcePath, 'utf8'));
  const samples = bankIds.flatMap((bankId) => {
    const bank = banks.find((candidate) => candidate.id === bankId);
    if (!bank) throw new Error(`missing_bank:${bankId}`);
    return bank.categories
      .flatMap((category) => category.topics.flatMap((topic) => topic.cards.map((card) => ({ categoryId: category.id, topicId: topic.id, ...card }))))
      .slice(0, 5)
      .map((card, index) => {
        if (!card.audio) throw new Error(`missing_audio:${card.id}`);
        const localAudioPath = join(designAssetRoot, card.audio.replace(/^\/question-bank-assets\//, ''));
        return {
          audio: card.audio,
          audioText: card.audioText,
          bankId,
          categoryId: card.categoryId,
          durationSeconds: durationSeconds(localAudioPath),
          id: card.id,
          index: index + 1,
          localAudioPath,
          taskTitle: card.taskTitle,
          topicId: card.topicId,
        };
      });
  });
  await mkdir(workstreamRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({ createdAt: new Date().toISOString(), sampleCount: samples.length, samples, schemaVersion: 1 }, null, 2)}\n`);
  process.stdout.write(`Prepared ${samples.length} samples at ${manifestPath}\n`);
}

async function collect(rawRoot) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const transcripts = {};
  for (const sample of manifest.samples) {
    const rawPath = join(rawRoot, sample.bankId, `${basename(sample.localAudioPath, '.mp3')}.json`);
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    transcripts[sample.id] = {
      audio: sample.audio,
      language: raw.language,
      segments: (raw.segments ?? []).map((segment) => ({
        avgLogprob: segment.avg_logprob,
        end: segment.end,
        noSpeechProb: segment.no_speech_prob,
        start: segment.start,
        text: cleanText(segment.text ?? ''),
      })),
      text: cleanText(raw.text ?? ''),
    };
  }
  await writeFile(transcriptPath, `${JSON.stringify({ collectedAt: new Date().toISOString(), model: 'turbo', schemaVersion: 1, transcripts }, null, 2)}\n`);
  process.stdout.write(`Collected ${Object.keys(transcripts).length} transcripts at ${transcriptPath}\n`);
}

async function report() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const cache = JSON.parse(await readFile(transcriptPath, 'utf8'));
  const samples = manifest.samples.map((sample) => {
    const whisper = cache.transcripts[sample.id];
    if (!whisper) throw new Error(`missing_transcript:${sample.id}`);
    const comparison = metric(sample.audioText, whisper.text);
    const averageLogprob = whisper.segments.length
      ? whisper.segments.reduce((sum, segment) => sum + segment.avgLogprob, 0) / whisper.segments.length
      : null;
    const status = comparison.contentExact ? 'same-content' : comparison.wer <= 0.08 ? 'minor-difference' : 'review';
    return { ...sample, averageLogprob, comparison, status, whisperText: whisper.text };
  });
  const summary = Object.fromEntries(bankIds.map((bankId) => {
    const items = samples.filter((sample) => sample.bankId === bankId);
    return [bankId, {
      averageWer: items.reduce((sum, sample) => sum + sample.comparison.wer, 0) / items.length,
      minorDifference: items.filter((sample) => sample.status === 'minor-difference').length,
      review: items.filter((sample) => sample.status === 'review').length,
      sameContent: items.filter((sample) => sample.status === 'same-content').length,
    }];
  }));
  await writeFile(join(workstreamRoot, 'comparison.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), samples, summary }, null, 2)}\n`);
  const rows = samples.map((sample) => `| ${sample.bankId} | ${sample.index} | ${sample.id} | ${(sample.comparison.wer * 100).toFixed(1)}% | ${sample.status} |`).join('\n');
  const markdown = `# 15 条音频原文校准批次\n\n## 范围\n\n- 听力、陆空通话、故事复诵按当前题库顺序各取前 5 条。\n- 本批次只使用本机 Whisper，不调用外部 ASR API。\n- 当前题库原文不被覆盖。\n\n## 自动差异概览\n\n| 模块 | 内容一致 | 轻微差异 | 需要复核 | 平均 WER |\n| --- | ---: | ---: | ---: | ---: |\n${bankIds.map((bankId) => { const item = summary[bankId]; return `| ${bankId} | ${item.sameContent} | ${item.minorDifference} | ${item.review} | ${(item.averageWer * 100).toFixed(2)}% |`; }).join('\n')}\n\n## 全部样本\n\n| 模块 | 序号 | 卡片 | WER | 自动分类 |\n| --- | ---: | --- | ---: | --- |\n${rows}\n`;
  await writeFile(join(workstreamRoot, 'automatic-report.md'), markdown);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const [command, argument] = process.argv.slice(2);
if (command === 'prepare') await prepare();
else if (command === 'collect') await collect(argument ?? '/tmp/icao-audio-text-calibration-15');
else if (command === 'report') await report();
else throw new Error('usage: node audio-text-calibration.mjs <prepare|collect RAW_ROOT|report>');
