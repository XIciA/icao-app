import { isContentAvailableOnPlatform, resolveMockExamDiscoverCopy } from '../native-release-surface';

describe('formal App 1.0.0 content surface', () => {
  it('hides the course catalog on both Native platforms while preserving learning content', () => {
    for (const platform of ['ios', 'android']) {
      expect(isContentAvailableOnPlatform('courses', platform)).toBe(false);
      expect(isContentAvailableOnPlatform('ai-report', platform)).toBe(false);
      expect(isContentAvailableOnPlatform('vocab', platform)).toBe(true);
      expect(isContentAvailableOnPlatform('hotspot', platform)).toBe(true);
      expect(isContentAvailableOnPlatform('resources', platform)).toBe(true);
    }
  });

  it('applies the same launch gate to EdgeOne production Web', () => {
    expect(isContentAvailableOnPlatform('courses', 'web', 'edgeone-production')).toBe(false);
    expect(isContentAvailableOnPlatform('ai-report', 'web', 'edgeone-production')).toBe(false);
    expect(isContentAvailableOnPlatform('mock-exam', 'web', 'edgeone-production')).toBe(true);
  });

  it('preserves only the frozen Vercel legacy content surface', () => {
    expect(isContentAvailableOnPlatform('courses', 'web', 'vercel-legacy')).toBe(true);
    expect(isContentAvailableOnPlatform('ai-report', 'web', 'vercel-legacy')).toBe(true);
  });

  it('uses neutral practice copy on formal surfaces without changing Vercel legacy', () => {
    for (const [platform, runtime] of [
      ['ios', 'vercel-legacy'],
      ['android', 'vercel-legacy'],
      ['web', 'edgeone-production'],
    ] as const) {
      expect(resolveMockExamDiscoverCopy(platform, runtime)).toEqual({
        title: '模拟练习',
        en: 'Practice',
        description: '按题目完成口语练习',
      });
    }
    expect(resolveMockExamDiscoverCopy('web', 'vercel-legacy')).toEqual({
      title: 'AI 模考',
      en: 'Mock Exam',
      description: 'AI 考官问答实时评分',
    });
  });
});
