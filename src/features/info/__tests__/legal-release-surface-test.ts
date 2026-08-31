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
    expect(combined).toContain('DeepSeek-V4-Flash-0731');
    expect(combined).toContain('Deepseek Chat');
    expect(combined).toContain('Beijing-DeepseekChat-202404280016');
    expect(combined).toContain('AI 辅助生成');
    expect(combined).toContain('不得恶意删除、遮挡或隐匿该标识');
    expect(combined).toContain('腾讯云语音识别');
    expect(combined).toContain('Apple App Store 以非自动续期方式购买');
    expect(combined).toContain('手机号密码、Apple 登录或微信登录');
    expect(combined).toContain('微信 OpenSDK');
    expect(combined).toContain('不包含微信支付能力');
    expect(combined).toContain('或相关权利人依法享有权利');
    expect(combined).toContain('本地静态词典查词不调用文本 AI、不消耗 AI 点数');
    expect(combined).not.toMatch(/阿里云百炼|通义千问/u);
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
