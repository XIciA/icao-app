import { eligibleForAutomaticGuide, emptyGuideProgress, parseGuideProgress, remainingGuideSteps } from '../guide-progress';
it('fails closed on missing or malformed business-account creation dates', () => {
  for (const value of [undefined, '', 'bad', '2026-09-01T00:00:00Z']) expect(eligibleForAutomaticGuide(value)).toBe(false);
  expect(eligibleForAutomaticGuide('2026-10-23T00:00:00Z')).toBe(true);
});
it('does not promote a legacy sample completion to mastery of current capabilities', () => {
  expect(parseGuideProgress(JSON.stringify({version:1,step:11,completed:['highlight']}))).toEqual(emptyGuideProgress());
  expect(parseGuideProgress('{')).toEqual(emptyGuideProgress());
});
it('keeps completed capabilities and skipped modules distinct', () => {
  const progress={version:3 as const,completed:['study-highlight'],skipped:['radio']};
  expect(remainingGuideSteps(['study-highlight','study-lookup'],progress,'study')).toEqual(['study-lookup']);
  expect(remainingGuideSteps(['radio-play'],progress,'radio')).toEqual([]);
});

it('restores stable task identities but discards an obsolete or unrelated task graph', () => {
  const radio = {module:'radio',done:['radio-bank'],remaining:['radio-speed']};
  const saved = {version:3,definition:1,completed:['radio-bank'],skipped:[],resumes:{radio}};
  expect(parseGuideProgress(JSON.stringify(saved)).resumes?.radio.remaining).toEqual(['radio-speed']);
  expect(parseGuideProgress(JSON.stringify({...saved,resumes:{radio:{...radio,remaining:['old-card']}}})).resumes).toBeUndefined();
  expect(parseGuideProgress(JSON.stringify({...saved,definition:0})).resumes).toBeUndefined();
});
it('sanitizes restored vocabulary metadata before a screen consumes it', () => {
  const parsed=parseGuideProgress(JSON.stringify({version:3,definition:1,completed:[],skipped:[],resumes:{vocab:{module:'vocab',done:[],remaining:['vocab-start'],checkpoint:{vocabBooks:'bad',vocabWord:42,recapEmpty:true}}}}));
  expect(parsed.resumes?.vocab.checkpoint).toEqual({});
});

it('migrates the old records branch into its independent module without losing annotation progress', () => {
  const parsed=parseGuideProgress(JSON.stringify({version:3,definition:1,completed:['recap-filter'],skipped:[],resumes:{
    records:{module:'recap',records:true,done:[],remaining:['recap-record']},
    recap:{module:'recap',done:['recap-filter'],remaining:['recap-question']},
  }}));
  expect(parsed.resumes?.records.module).toBe('records');
  expect(parsed.resumes?.recap.remaining).toEqual(['recap-question']);
  expect(parsed.completed).toEqual(['recap-filter']);
});

it('persists a boolean test new-user marker without treating malformed values as enabled',()=>{
 for(const value of [true,false,'true',1]) {
  const parsed=parseGuideProgress(JSON.stringify({...emptyGuideProgress(),testNewUser:value}));
  expect(parsed.testNewUser).toBe(value===true?true:undefined);
 }
});


it('preserves existing export progress when the catalog entrance is added', () => {
  const old = {version:3,completed:['export-levels','export-scope'],skipped:[]};
  const migrated = parseGuideProgress(JSON.stringify(old));
  expect(migrated.completed).toEqual(['export-levels','export-scope','export-open']);
  expect(parseGuideProgress(JSON.stringify(migrated)).completed).toEqual(migrated.completed);
  expect(parseGuideProgress(JSON.stringify({version:3,completed:[],skipped:[]})).completed).toEqual([]);
});
