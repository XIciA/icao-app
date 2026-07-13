import { boundedHorizontalSwipe, horizontalSwipeDirection } from '../lib/study-gestures';

describe('study horizontal gestures', () => {
  it('maps left to the next item and right to the previous item', () => {
    expect(boundedHorizontalSwipe(1, 4, -80, -300)).toMatchObject({ direction: 1, index: 2, boundary: false });
    expect(boundedHorizontalSwipe(1, 4, 80, 300)).toMatchObject({ direction: -1, index: 0, boundary: false });
  });

  it('ignores short drags and only accepts a fast swipe with enough same-direction travel', () => {
    expect(horizontalSwipeDirection(-18, -900)).toBe(0);
    expect(horizontalSwipeDirection(-30, -700)).toBe(1);
    expect(horizontalSwipeDirection(30, 700)).toBe(-1);
  });

  it('does not use an opposite release velocity to reverse the swipe direction', () => {
    expect(horizontalSwipeDirection(-30, 900)).toBe(0);
    expect(horizontalSwipeDirection(30, -900)).toBe(0);
    expect(horizontalSwipeDirection(-80, 900)).toBe(1);
  });

  it('stops at both boundaries instead of wrapping or completing the session', () => {
    expect(boundedHorizontalSwipe(0, 4, 80, 300)).toMatchObject({ direction: -1, index: 0, boundary: true });
    expect(boundedHorizontalSwipe(3, 4, -80, -300)).toMatchObject({ direction: 1, index: 3, boundary: true });
  });
});
