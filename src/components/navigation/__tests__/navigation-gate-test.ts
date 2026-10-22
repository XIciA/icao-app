import { createNavigationGate, navigationGateFor } from '../useAppRouter.native';

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

it('shares a burst across different controls on one screen but allows the next screen to return', () => {
  let focused = true;
  const owner = { isFocused: () => focused };
  const toolbar = navigationGateFor(owner);
  const row = navigationGateFor(owner);
  const push = jest.fn(); const back = jest.fn();
  row(push); toolbar(back);
  expect(push).toHaveBeenCalledTimes(1);
  expect(back).not.toHaveBeenCalled();
  focused = false;
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
  row(push); // A slow request from the covered screen must not reopen it.
  expect(push).toHaveBeenCalledTimes(1);
  navigationGateFor({ isFocused: () => true })(back);
  expect(back).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});


it('blocks button taps throughout an interactive swipe and unlocks when it completes or cancels', () => {
  let now = 1000;
  const gate = createNavigationGate(() => now);
  const back = jest.fn();
  gate.beginTransition();
  now += 5000; // Holding a swipe longer than the tap interval must remain protected.
  gate(back);
  expect(back).not.toHaveBeenCalled();
  gate.endTransition();
  gate(back);
  expect(back).toHaveBeenCalledTimes(1);
  gate.beginTransition();
  gate.endTransition(); // Canceled gesture.
  gate(back);
  expect(back).toHaveBeenCalledTimes(2);
});
