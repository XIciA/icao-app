import { resolveLegalRuntimeCopy } from '../legal-release-surface';

describe('legal copy release surface', () => {
  // This is the retained shared/Web compatibility copy. Native displays app-content documents.
  it.each(['ios', 'android', 'web'])('keeps the shared formal fallback distinct from legacy on %s', (platform) => {
    const combined = Object.values(resolveLegalRuntimeCopy(platform, 'edgeone-production')).join('\n');
    expect(combined).toContain('16周岁');
    expect(combined).toContain('DeepSeek 开放平台');
    expect(combined).toContain('Apple App Store 以非自动续期方式购买');
    expect(combined).not.toContain('阿里云百炼通义千问');
  });

  it('preserves the frozen Vercel legacy legal copy', () => {
    const combined = Object.values(resolveLegalRuntimeCopy('web', 'vercel-legacy')).join('\n');

    expect(combined).toContain('阿里云百炼通义千问');
    expect(combined).toContain('不满十四周岁');
    expect(combined).toContain('AI 单词查询缓存默认保留 30 天');
    expect(combined).toContain('运营阶段提供的授权方式');
    expect(combined).toContain('题库、音频、课程、文章');
    expect(combined).not.toContain('非自动续期方式购买');
    expect(combined).not.toContain('DeepSeek-V4-Flash-0731');
  });
});
