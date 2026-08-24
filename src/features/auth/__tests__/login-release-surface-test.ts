import { resolveLoginAgeCopy } from '../login-release-surface';

describe('login age release surface', () => {
  it.each([
    ['ios', 'vercel-legacy'],
    ['android', 'vercel-legacy'],
    ['web', 'edgeone-production'],
  ] as const)('requires the 16+ confirmation on %s', (platform, runtime) => {
    expect(resolveLoginAgeCopy(platform, runtime)).toEqual({
      consentLabel: '我已年满16周岁，并同意用户协议与隐私政策',
      consentError: '请确认已满16周岁，并同意用户协议与隐私政策。',
    });
  });

  it('preserves the frozen Vercel legacy confirmation copy', () => {
    expect(resolveLoginAgeCopy('web', 'vercel-legacy')).toEqual({
      consentLabel: '我已年满14周岁，并同意用户协议与隐私政策',
      consentError: '请确认已满14周岁，并同意用户协议与隐私政策。',
    });
  });
});
