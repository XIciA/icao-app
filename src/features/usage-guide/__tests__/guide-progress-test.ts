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
