export type HorizontalSwipeDirection = -1 | 0 | 1;

export type HorizontalSwipeResult = {
  boundary: boolean;
  direction: HorizontalSwipeDirection;
  index: number;
};

export function horizontalSwipeDirection(
  translationX: number,
  velocityX: number,
  distanceThreshold = 56,
  velocityThreshold = 650,
): HorizontalSwipeDirection {
  const distanceReached = Math.abs(translationX) >= distanceThreshold;
  const fastIntent = Math.abs(translationX) >= 24
    && Math.abs(velocityX) >= velocityThreshold
    && Math.sign(translationX) === Math.sign(velocityX);
  const signal = distanceReached || fastIntent ? translationX : 0;

  if (signal < 0) return 1;
  if (signal > 0) return -1;
  return 0;
}

export function boundedHorizontalSwipe(
  currentIndex: number,
  total: number,
  translationX: number,
  velocityX: number,
  distanceThreshold?: number,
  velocityThreshold?: number,
): HorizontalSwipeResult {
  const direction = horizontalSwipeDirection(
    translationX,
    velocityX,
    distanceThreshold,
    velocityThreshold,
  );
  const requestedIndex = currentIndex + direction;
  const lastIndex = Math.max(0, total - 1);
  const index = Math.max(0, Math.min(lastIndex, requestedIndex));

  return {
    boundary: direction !== 0 && requestedIndex !== index,
    direction,
    index,
  };
}
