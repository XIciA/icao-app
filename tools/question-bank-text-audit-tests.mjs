import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDeterministicText } from './question-bank-text-audit.mjs';

const normalize = (text, field = 'audioText') => normalizeDeterministicText({ text, field, bankId: 'opi', cardId: 'review-regression' });

test('normalization preserves decimal Mach numbers while fixing sentence punctuation', () => {
  assert.equal(normalize('Maintain Mach .79 , greater than .77 .'), 'Maintain Mach .79, greater than .77.');
});
test('Chinese approach terminology is not replaced across word boundaries', () => {
  for (const text of ['联系武汉进近进行报告。', '跑道附近进行施工作业。']) {
    assert.equal(normalize(text, 'audioTextZh'), text);
  }
});
test('ambiguous aircraft plural or possessive requires contextual review', () => {
  assert.equal(normalize('We can see the aircrafts around us.'), 'We can see the aircrafts around us.');
});
