import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import { useLocalBack } from '../useLocalBack';

let mockSystemBack: () => void;
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (_enabled: boolean, callback: () => void) => { mockSystemBack = callback; } }));

it('coalesces a button plus a swipe into one local return, then permits the next level', async () => {
  let now = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const { result } = await renderHook(() => {
    const [level, setLevel] = useState(3);
    const back = useLocalBack(level > 0, () => setLevel(value => value - 1));
    return { level, back };
  });
  await act(async () => { result.current.back(); mockSystemBack(); });
  expect(result.current.level).toBe(2);
  now += 451;
  await act(async () => mockSystemBack());
  expect(result.current.level).toBe(1);
  now += 451;
  await act(async () => result.current.back());
  expect(result.current.level).toBe(0);
  jest.restoreAllMocks();
});
