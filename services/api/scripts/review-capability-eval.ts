import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AiReviewRequest, AiReviewResult, GrammarCorrectionIssue } from '@icao/contracts';

import { DeepSeekReviewProviderService } from '../src/ai/deepseek-review-provider.service';
import { reviewSystemPrompt } from '../src/ai/deepseek-review-prompts';
import { parseAndValidateReview, withReviewPromptVersion } from '../src/ai/review-harness';
import { loadConfig } from '../src/config';

type EvalCase = {
  capability: 'grammar' | 'polish';
  name: string;
  transcript: string;
  expectedCorrectedText?: string;
  expectedIssues?: Array<Pick<GrammarCorrectionIssue, 'before' | 'after'>>;
  expectedPolishedText?: string;
};

function sections(markdown: string) {
  return markdown.split(/^### /gmu).slice(1);
}

function inputFrom(section: string) {
  const match = section.match(/\*\*用户输入（ASR 转写）\*\*\s*\n\s*>\s*([^\n]+)/u);
  if (!match?.[1]) throw new Error('eval_case_input_missing');
  return match[1].trim();
}

function visibleLines(section: string) {
  const marker = '**用户完整看到的结果**';
  const start = section.indexOf(marker);
  if (start < 0) throw new Error('eval_case_output_missing');
  return section.slice(start + marker.length).split('\n')
    .filter((line) => line.startsWith('>'))
    .map((line) => line.replace(/^> ?/u, '').trimEnd());
}

function nextContent(lines: string[], start: number) {
  return lines.slice(start + 1).find((line) => line.trim())?.trim();
}

function grammarCases(markdown: string): EvalCase[] {
  return sections(markdown).map((section) => {
    const lines = visibleLines(section);
    const correctedTitle = lines.indexOf('**正确句子**');
    const correctedText = nextContent(lines, correctedTitle);
    if (!correctedText) throw new Error('eval_corrected_text_missing');
    const expectedIssues: Array<Pick<GrammarCorrectionIssue, 'before' | 'after'>> = [];
    for (const line of lines) {
      const match = line.match(/^\d+\. \*\*(.+?) → (.+?)\*\*\s*$/u);
      if (match?.[1] && match[2]) expectedIssues.push({ before: match[1], after: match[2] });
    }
    return {
      capability: 'grammar',
      name: section.split('\n')[0]!.trim(),
      transcript: inputFrom(section),
      expectedCorrectedText: correctedText,
      expectedIssues,
    };
  });
}

function polishCases(markdown: string): EvalCase[] {
  return sections(markdown).map((section) => {
    const lines = visibleLines(section);
    const title = lines.indexOf('**润色后的表达**');
    const polishedText = nextContent(lines, title);
    if (!polishedText) throw new Error('eval_polished_text_missing');
    return {
      capability: 'polish',
      name: section.split('\n')[0]!.trim(),
      transcript: inputFrom(section),
      expectedPolishedText: polishedText,
    };
  });
}

function exactCaseMatch(test: EvalCase, actual: AiReviewResult) {
  if (test.capability === 'polish') return actual.polishedText === test.expectedPolishedText;
  return actual.grammar.correctedText === test.expectedCorrectedText
    && JSON.stringify(actual.grammar.issues.map(({ before, after }) => ({ before, after }))) === JSON.stringify(test.expectedIssues);
}

async function cases() {
  const docs = resolve(process.cwd(), '../../docs/resources/ai/capabilities');
  const [grammar, polish] = await Promise.all([
    readFile(resolve(docs, 'grammar-correction.md'), 'utf8'),
    readFile(resolve(docs, 'expression-polish.md'), 'utf8'),
  ]);
  return [...grammarCases(grammar), ...polishCases(polish)];
}

async function main() {
  const allCases = await cases();
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
  const mode = only ? 'targeted' : process.argv.includes('--smoke') ? 'smoke' : process.argv.includes('--dry-run') ? 'dry-run' : 'all';
  const caseNumbers = new Map<EvalCase['capability'], number>();
  const indexedCases = allCases.map((item) => {
    const number = (caseNumbers.get(item.capability) ?? 0) + 1;
    caseNumbers.set(item.capability, number);
    return { item, key: `${item.capability}:${number}` };
  });
  const requested = new Set(only?.split(',').map((item) => item.trim()).filter(Boolean));
  const selected = mode === 'targeted'
    ? indexedCases.filter(({ key }) => requested.has(key)).map(({ item }) => item)
    : mode === 'smoke'
      ? [allCases[0], allCases[6], allCases[11], allCases[15]].filter((item): item is EvalCase => Boolean(item))
      : allCases;
  if (mode === 'targeted' && selected.length !== requested.size) throw new Error('eval_target_case_missing');
  if (mode === 'dry-run') {
    console.log(JSON.stringify({ grammarCases: allCases.filter((item) => item.capability === 'grammar').length, polishCases: allCases.filter((item) => item.capability === 'polish').length }));
    return;
  }

  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:eval@127.0.0.1:5432/postgres',
    SUPABASE_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLIC_URL: 'http://127.0.0.1:8000',
    SUPABASE_PUBLISHABLE_KEY: 'eval-publishable-key-that-is-long-enough',
    SUPABASE_SECRET_KEY: 'eval-secret-key-that-is-long-enough',
    INVITE_AUTH_SECRET: 'eval-invite-auth-secret-that-is-long-enough',
  });
  const provider = new DeepSeekReviewProviderService(config);
  const results = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const test of selected) {
    const input: AiReviewRequest = {
      mode: test.capability === 'grammar' ? 'grammar' : 'opi',
      module: test.capability === 'grammar' ? 'atc' : 'opi',
      questionId: `eval-${results.length + 1}`,
      transcript: test.transcript,
    };
    try {
      const generated = await provider.generateValidated({
        mode: input.mode,
        system: reviewSystemPrompt(input.mode),
        prompt: JSON.stringify({ transcript: input.transcript }),
        userId: 'capability-evaluation',
        validate: (data) => parseAndValidateReview(data, input),
      });
      const actual = withReviewPromptVersion(generated.data);
      totalInputTokens += generated.meta.inputTokens ?? 0;
      totalOutputTokens += generated.meta.outputTokens ?? 0;
      results.push({ name: test.name, capability: test.capability, harnessPassed: true, exactCaseMatch: exactCaseMatch(test, actual), expected: test, actual });
    } catch (error) {
      results.push({ name: test.name, capability: test.capability, harnessPassed: false, exactCaseMatch: false, error: error instanceof Error ? error.message : 'unknown_error', expected: test });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    model: config.aiGrammarModel,
    total: results.length,
    harnessPassed: results.filter((item) => item.harnessPassed).length,
    exactCaseMatches: results.filter((item) => item.exactCaseMatch).length,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedMaximumUsd: Number(((totalInputTokens * 0.14 + totalOutputTokens * 0.28) / 1_000_000).toFixed(6)),
    },
    results,
  };
  const outputDirectory = resolve(process.cwd(), '../../.generated/ai-review-eval');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, `${mode}-latest.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, total: report.total, harnessPassed: report.harnessPassed, exactCaseMatches: report.exactCaseMatches, usage: report.usage }));
  if (report.harnessPassed !== report.total) process.exitCode = 1;
}

void main();
