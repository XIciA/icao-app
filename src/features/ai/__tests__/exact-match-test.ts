import { exactMatch } from '../exact-match';

describe('exactMatch', () => {
  it('reports an exact token match while ignoring punctuation and case', () => {
    expect(exactMatch('Cleared for takeoff, runway two seven.', 'cleared for takeoff runway two seven')).toEqual({
      exact: true,
      differences: [],
      summary: { missing: 0, extra: 0, replace: 0, order: 0 },
    });
  });

  it('distinguishes missing, extra, replacement and order differences', () => {
    expect(exactMatch('cleared direct panda', 'cleared panda').summary.missing).toBe(1);
    expect(exactMatch('cleared panda', 'cleared now panda').summary.extra).toBe(1);
    expect(exactMatch('runway two seven', 'runway two six').summary.replace).toBe(1);
    expect(exactMatch('contact tower now', 'tower contact now').summary.order).toBeGreaterThan(0);
  });
});
