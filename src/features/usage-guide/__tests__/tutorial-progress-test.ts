import Storage from '@/platform/storage';
import { advanceTutorial, emptyTutorialProgress, parseTutorialProgress, TUTORIAL_STEPS } from '../tutorial-model';
import { readTutorialProgress, writeTutorialProgress } from '../tutorial-progress';

it('advances only after the current real action and records skips separately', () => {
  const p = emptyTutorialProgress();
  expect(advanceTutorial(p, 'highlight')).toBe(p);
  const played = advanceTutorial(p, 'play');
  expect(played.completed).toEqual(['play']);
  const skipped = advanceTutorial(played, 'reveal', true);
  expect(skipped.completed).toEqual(['play']);
  expect(skipped.skipped).toEqual(['reveal']);
  expect(skipped.step).toBe(2);
});
it('handles malformed metadata and retains valid resume state', () => {
  for (const value of ['no-json', '{}', '{"version":1,"step":-1}', '{"version":1,"step":99}']) expect(parseTutorialProgress(value)).toEqual(emptyTutorialProgress());
  const p = { ...emptyTutorialProgress(), step: TUTORIAL_STEPS.length, recordId: 'saved-record' };
  expect(parseTutorialProgress(JSON.stringify(p))).toEqual(p);
});
it('isolates account metadata and serializes writes without changing learning storage', async () => {
  jest.mocked(Storage.setItem).mockClear();
  await Promise.all([writeTutorialProgress('guide-account-a', { ...emptyTutorialProgress(), step: 1 }), writeTutorialProgress('guide-account-a', { ...emptyTutorialProgress(), step: 2 })]);
  expect((await readTutorialProgress('guide-account-a')).step).toBe(2);
  expect((await readTutorialProgress('guide-account-b')).step).toBe(0);
  expect(jest.mocked(Storage.setItem).mock.calls.every(([key]) => key.startsWith('icao.usage-guide.v1.'))).toBe(true);
});
