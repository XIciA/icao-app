import {
  getQuestionBankAssetBaseUrl,
  resolveQuestionBankAsset,
  resolveRemoteQuestionBankAsset,
} from '../platform/resource-service.web';

describe('question-bank Web resource service', () => {
  const originalSameOriginAssets = process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS;

  afterEach(() => {
    if (originalSameOriginAssets === undefined) {
      delete process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS;
    } else {
      process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS = originalSameOriginAssets;
    }
  });

  it('keeps canonical question-bank resources on the current Web origin', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS = '1';

    expect(getQuestionBankAssetBaseUrl()).toBe('');
    expect(resolveQuestionBankAsset('/question-bank-assets/audio/listening/main/001.mp3')).toBe(
      '/question-bank-assets/audio/listening/main/001.mp3',
    );
    expect(resolveQuestionBankAsset('question-bank-assets/audio/listening/main/002.mp3')).toBe(
      '/question-bank-assets/audio/listening/main/002.mp3',
    );
    await expect(
      resolveRemoteQuestionBankAsset('/question-bank-assets/audio/listening/main/003.mp3'),
    ).resolves.toBe('/question-bank-assets/audio/listening/main/003.mp3');
  });

  it('does not rewrite an explicitly absolute resource URL', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS = '1';

    expect(resolveQuestionBankAsset('https://media.example.test/audio.mp3')).toBe(
      'https://media.example.test/audio.mp3',
    );
  });
});
