import { clampRadioInterval, RADIO_INTERVAL_MAX_SECONDS, RADIO_INTERVAL_PRESETS } from '../radio-interval';

describe('shared radio interval configuration', () => {
  it('keeps the interval limits and presets in one platform-neutral source', () => {
    expect(RADIO_INTERVAL_MAX_SECONDS).toBe(30);
    expect(RADIO_INTERVAL_PRESETS).toEqual([0, 3, 5, 10, 15, 30]);
  });

  it.each([
    [-1, 0],
    [0, 0],
    [1, 1],
    [5, 5],
    [30, 30],
    [31, 30],
    [4.6, 5],
  ])('normalizes %s seconds to %s', (input, expected) => {
    expect(clampRadioInterval(input)).toBe(expected);
  });
});
