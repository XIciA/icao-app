import { isContentAvailableOnPlatform } from '../native-release-surface';

describe('Native 1.0.0 content surface', () => {
  it('hides the course catalog on both Native platforms while preserving learning content', () => {
    for (const platform of ['ios', 'android']) {
      expect(isContentAvailableOnPlatform('courses', platform)).toBe(false);
      expect(isContentAvailableOnPlatform('ai-report', platform)).toBe(false);
      expect(isContentAvailableOnPlatform('vocab', platform)).toBe(true);
      expect(isContentAvailableOnPlatform('hotspot', platform)).toBe(true);
      expect(isContentAvailableOnPlatform('resources', platform)).toBe(true);
    }
  });

  it('does not alter the frozen Web content surface', () => {
    expect(isContentAvailableOnPlatform('courses', 'web')).toBe(true);
    expect(isContentAvailableOnPlatform('ai-report', 'web')).toBe(true);
  });
});
