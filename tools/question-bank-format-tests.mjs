import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { countStoryWords, formatText, lexicalSignature, reorder, simplifyPrompt } from './question-bank-format.mjs';

test('removes redundant expansion only in prompts with an explicit acronym', () => {
  assert.equal(simplifyPrompt('What is a cockpit voice recorder (CVR)?'), 'What is CVR?');
  assert.equal(simplifyPrompt('什么是驾驶舱话音记录器（CVR）？', true), '什么是CVR？');
  assert.equal(simplifyPrompt('What is a cockpit voice recorder?'), 'What is a cockpit voice recorder?');
  assert.equal(formatText('CVR stands for Cockpit Voice Recorder.', { bankId: 'opi', field: 'referenceText' }), 'CVR stands for Cockpit Voice Recorder.');
});
test('protects operational numbers, punctuation, meaningful brackets and abbreviations', () => {
  const text = "Contact ATC on 132.1, runway 02L, -5 degrees, pilot's co-pilot, U.S. (standby).";
  assert.equal(formatText(text, { bankId: 'radiotelephony', field: 'audioText' }), text);
  assert.equal(formatText('[unintelligible due to radio interference]', { bankId: 'listening', field: 'audioText' }), '[unintelligible due to radio interference]');
});
test('stories contain one body paragraph and a separate consistent word-count line', () => {
  const context = { bankId: 'storytelling', field: 'audioText' };
  const result = formatText('12. A co-pilot called ATC.\nThe aircraft landed.\n(113 words)', context);
  assert.equal(result, 'A co-pilot called ATC. The aircraft landed.\n\n7 words');
  assert.equal(formatText(result, context), result);
  assert.equal(countStoryWords("The pilot's B737-800 landed at 12:30."), 6);
  assert.equal(formatText('飞机降落了。\n没有人受伤。', { bankId: 'storytelling', field: 'audioTextZh' }), '飞机降落了。没有人受伤。');
});
test('attributions are removed only when they are complete unrelated lines', () => {
  const context = { bankId: 'opi', field: 'audioText' };
  assert.equal(formatText('来源：树袋熊\nWhat is CVR?', context), 'What is CVR?');
  assert.equal(formatText('How do copyright rules affect manuals?', context), 'How do copyright rules affect manuals?');
});
test('reorders complete objects deterministically with no loss, duplicates or fixed positions', () => {
  for (let count = 2; count < 500; count++) {
    const input = Array.from({ length: count }, (_, i) => ({ id: String(i), audio: `audio-${i}`, text: `text-${i}` }));
    const result = reorder(input, `test-${count}`);
    assert.equal(new Set(result).size, count);
    assert(result.every((item, i) => item !== input[i]));
    assert.deepEqual(result, reorder(input, `test-${count}`));
    assert.deepEqual([...result].sort((a, b) => Number(a.id) - Number(b.id)), input);
  }
});
test('every recorded change preserves lexical content after the explicit redundancy removals', () => {
  const report = JSON.parse(readFileSync(new URL('../docs/records/workstreams/question-bank-standardization-20261022/text-changes.json', import.meta.url)));
  for (const change of report.changes) {
    assert.equal(lexicalSignature(change.before, change), lexicalSignature(change.after, change), `${change.cardId}:${change.field}`);
    // Answer echo is generated from the unchanged correct option, so its mixed
    // Chinese/English punctuation intentionally follows that English option.
    if (!(change.bankId === 'listening' && change.field === 'referenceText')) assert.equal(formatText(change.after, change), change.after);
  }
});
