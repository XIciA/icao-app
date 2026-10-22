import { createNavigationGate } from '../useAppRouter';

it('dispatches a burst of forward or back taps only once and unlocks for the next interaction', () => {
  let now = 1000;
  const gate = createNavigationGate(() => now);
  const push = jest.fn();
  gate(push); gate(push); gate(push);
  expect(push).toHaveBeenCalledTimes(1);
  now += 451;
  const back = jest.fn();
  gate(back); gate(back);
  expect(back).toHaveBeenCalledTimes(1);
  now += 451;
  gate(push);
  expect(push).toHaveBeenCalledTimes(2);
});

it('allows immediate retry if dispatch itself fails', () => {
  const gate = createNavigationGate(() => 1000);
  expect(() => gate(() => { throw new Error('not ready'); })).toThrow('not ready');
  const retry = jest.fn(); gate(retry);
  expect(retry).toHaveBeenCalledTimes(1);
});
