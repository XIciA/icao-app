import { resolveLegalRuntimeCopy } from '../legal-release-surface';

describe('legal copy release surface', () => {
  it.each([
    ['ios', 'vercel-legacy'],
    ['android', 'vercel-legacy'],
    ['web', 'edgeone-production'],
  ] as const)('uses the formal 16+ DeepSeek and local lookup copy on %s', (platform, runtime) => {
    const copy = resolveLegalRuntimeCopy(platform, runtime);
    const combined = Object.values(copy).join('\n');

    expect(combined).toContain('16周岁');
    expect(combined).toContain('DeepSeek 开放平台');
    expect(combined).toContain('腾讯云语音识别');
    expect(combined).toContain('本地静态词典查词不调用文本 AI、不消耗 AI 点数');
    expect(combined).not.toMatch(/阿里云百炼|通义千问/u);
  });

  it('preserves the frozen Vercel legacy legal copy', () => {
    const combined = Object.values(resolveLegalRuntimeCopy('web', 'vercel-legacy')).join('\n');

    expect(combined).toContain('阿里云百炼通义千问');
    expect(combined).toContain('不满十四周岁');
    expect(combined).toContain('AI 单词查询缓存默认保留 30 天');
  });
});
