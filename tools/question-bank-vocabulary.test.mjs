import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileRule, matchOccurrences } from './question-bank-vocabulary.mjs';
const source=JSON.parse(await readFile(new URL('../content/vocabulary/question-bank-core/source.json',import.meta.url),'utf8'));
const matches=(word,text)=>matchOccurrences(text,compileRule(source.entries.find(e=>e.originalTerm===word).frequencyRules)).hits.length;

test('counts distinct inflections but not word fragments, negated prefixes or unrelated derivations',()=>{
  assert.equal(matches('divert','We divert, diverted and are diverting. Diversion is a noun.'),3);
  assert.equal(matches('aerodynamic','Aerodynamic drag is studied in aerodynamics.'),1);
  assert.equal(matches('precision approach','A non-precision approach is different from a precision approach.'),1);
  assert.equal(matches('dispatch','The dispatcher consulted dispatch.'),1);
});
test('parking stands and directional course are not mistaken for function-word idioms',()=>{
  assert.equal(matches('stand','I will allocate a new stand for you.'),1);
  assert.equal(matches('stand','What does the acronym PFD stand for? Stand by.'),0);
  assert.equal(matches('course','Offset to the right of course to avoid weather.'),1);
  assert.equal(matches('course','Of course, after a training course.'),0);
});
test('audited technical senses reject lexical homographs',()=>{
  assert.equal(matches('bank','A power bank caught fire; the aircraft entered a left bank.'),1);
  assert.equal(matches('bus','The shuttle bus passed the aircraft. The AC BUS failed.'),1);
  assert.equal(matches('port','Start the port outboard engine. A USB port is different.'),1);
  assert.equal(matches('fix','Fix it, then proceed to the holding fix.'),1);
  assert.equal(matches('attitude','What is the proper attitude towards advice?'),0);
  assert.equal(matches('attitude','The attitude indicator failed.'),1);
});
test('phrases use full constructions and spelling variants, never constituent sums',()=>{
  assert.equal(matches('flight plan','The flight planned route differs from the flight plan.'),1);
  assert.equal(matches('sock','The wind sock and windsock showed a crosswind.'),2);
  assert.equal(matches('windshear','Wind shear, windshear and wind-shear were reported.'),3);
  assert.equal(matches('pan','PAN PAN, PANPAN, PAN-PAN. A frying pan is not a call.'),3);
  assert.equal(matches('hold short of','Hold short of runway 18. Hold is one constituent.'),1);
});
