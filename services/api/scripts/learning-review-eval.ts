/** Synthetic learning cases; never read or export learner recordings/answers. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AiReviewRequest } from '@icao/contracts';
import type { LearningReviewMaterials } from '@icao/contracts/learning-ai';
import { learningReviewPrompt, validateLearningReview } from '../src/ai/learning-review';
const atcQuestion = 'Speedbird 123, turn right heading 330, descend to 3000 feet, cleared ILS approach runway 36R.';
const story = 'After takeoff, the crew noticed smoke in the cabin. They informed ATC and returned to the departure airport. The aircraft landed safely and everyone evacuated without injuries.';
const baggageQuestion = 'Your call sign is QFA953. You are close to departure time. However, one passenger is missing while his checked luggage is still onboard. For security reasons, contact company operations to offload the baggage.';
const cases = [
  ...['My life.', 'FL310.', 'Flight level 310.', 'x', '???', '不知道'].map((answer, index) => ({ id: `atc-short-${index}`, module: 'atc' as const, question: baggageQuestion, answer, required: ['missingInformation'] as const })),
  { id: 'atc-brief-valid', module: 'atc', question: 'QFA953, report ready.', answer: 'Ready, QFA953.', clean: true },
  { id: 'story-unrelated-short', module: 'story', question: story, answer: 'My life.', required: ['missingInformation'] },
  { id: 'story-unintelligible', module: 'story', question: story, answer: '???', required: ['missingInformation'] },
  { id: 'opi-unrelated-fragment', module: 'opi', question: 'Describe how you would handle an engine failure after takeoff.', answer: 'My life.', offTopic: true, unchanged: true },
  { id: 'opi-unintelligible', module: 'opi', question: 'Why is communication important for pilots?', answer: '???', offTopic: true, unchanged: true },
  { id: 'opi-brief-relevant', module: 'opi', question: 'What is your top priority as a pilot?', answer: 'Safety.', clean: true, unchanged: true },
  { id: 'atc-clean', module: 'atc', question: atcQuestion, answer: 'Right heading 330, descending to 3000 feet, cleared ILS approach runway 36R, Speedbird 123.', clean: true },
  { id: 'atc-missing', module: 'atc', question: atcQuestion, answer: 'Descending to 3000 feet, Speedbird 123.', required: ['missingInformation'] },
  { id: 'atc-wrong-extra', module: 'atc', question: atcQuestion, answer: 'Right heading 330, descending to 5000 feet, cleared ILS approach runway 36R, cleared for takeoff, Speedbird 123.', required: ['incorrectInformation', 'extraInformation'] },
  { id: 'atc-legitimate-report', module: 'atc', question: 'Speedbird 123, report fuel endurance and persons on board.', answer: 'We have two hours of fuel and 120 persons on board, Speedbird 123.', clean: true },
  { id: 'story-paraphrase', module: 'story', question: story, answer: 'The crew saw cabin smoke after departure, advised ATC and returned. They landed safely and all occupants evacuated uninjured.', clean: true },
  { id: 'story-missing', module: 'story', question: story, answer: 'The crew noticed smoke after takeoff and returned to the departure airport.', required: ['missingInformation'] },
  { id: 'story-wrong-extra', module: 'story', question: story, answer: 'Before takeoff the crew noticed cabin smoke. They told ATC and returned to the departure airport because a passenger was smoking. The plane landed safely and everyone evacuated without injuries.', required: ['incorrectInformation', 'extraInformation'] },
  { id: 'opi-grammar', module: 'opi', question: 'Why is communication important for pilots?', answer: 'Good communication help pilots avoid misunderstanding. It make the flight safer.', required: ['grammarErrors'] },
  { id: 'opi-clean', module: 'opi', question: 'Why is communication important for pilots?', answer: 'Clear communication helps pilots and controllers understand each other and prevents mistakes.', clean: true },
  { id: 'opi-off-topic', module: 'opi', question: 'Describe how you would handle an engine failure after takeoff.', answer: 'My favorite hobby is cooking. I like making pasta at home.', offTopic: true },
  { id: 'opi-unseen-picture', module: 'opi', question: 'Describe the picture.', answer: 'There are two aircraft on the apron.', hasUnseenImage: true, clean: true },
] as const;
const directory = resolve(process.cwd(), '../../.generated/learning-review-eval');
mkdirSync(directory, { recursive: true });
const inputs = cases.map((item) => {
  const input: AiReviewRequest = { analysisVersion: 2, mode: item.module === 'opi' ? 'opi' : 'grammar', module: item.module, questionId: item.id, transcript: item.answer };
  const materials: LearningReviewMaterials = { questionText: item.question, referenceText: '', contextText: '', hasUnseenImage: 'hasUnseenImage' in item && item.hasUnseenImage };
  return { id: item.id, input, materials, body: { thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 6000, stream: false,
    messages: [{ role: 'system', content: learningReviewPrompt(item.module) }, { role: 'user', content: JSON.stringify({ ...materials, answerText: item.answer }) }] } };
});
if (process.argv.includes('--prepare')) {
  writeFileSync(resolve(directory, 'inputs.json'), JSON.stringify(inputs));
  console.log(JSON.stringify({ cases: inputs.length, output: '.generated/learning-review-eval/inputs.json' }));
} else {
  const outputs = JSON.parse(readFileSync(resolve(directory, 'outputs.json'), 'utf8')) as { id: string; payload?: { choices?: { message?: { content?: string } }[] }; error?: string; elapsedMs: number }[];
  const report = inputs.map(({ id, input, materials }, index) => {
    const output = outputs.find((value) => value.id === id);
    try {
      if (!output?.payload) throw new Error(output?.error ?? 'no_output');
      const result = validateLearningReview(JSON.parse(output.payload.choices![0].message!.content!), input, materials);
      const analysis = result.analysis!; const expected = cases[index];
      const issues = analysis.grammarErrors.length + ('missingInformation' in analysis ? analysis.missingInformation.length + analysis.incorrectInformation.length + analysis.extraInformation.length : Number(Boolean(analysis.offTopic)));
      const passed = (!('clean' in expected) || !expected.clean || issues === 0)
        && (!('required' in expected) || expected.required.every((key) => key in analysis && Array.isArray(analysis[key as keyof typeof analysis]) && (analysis[key as keyof typeof analysis] as unknown[]).length > 0))
        && (!('offTopic' in expected) || analysis.module === 'opi' && Boolean(analysis.offTopic))
        && (!('unchanged' in expected) || analysis.module === 'opi' && analysis.polishedText === expected.answer);
      return { id, passed, elapsedMs: output.elapsedMs, result };
    } catch (error) { return { id, passed: false, elapsedMs: output?.elapsedMs, error: error instanceof Error ? error.message : 'unknown' }; }
  });
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), cases: report }, null, 2));
  console.log(JSON.stringify(report.map(({ result: _result, ...summary }) => summary), null, 2));
  if (report.some((item) => !item.passed)) process.exitCode = 1;
}
