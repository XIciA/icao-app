import { resolveWebContentUrl } from '../release.web';

describe('Web content release resolver', () => {
  const originalSameOriginContent = process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_CONTENT;
  const originalRelease = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE;
  const originalBaseUrl = process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL;

  afterAll(() => {
    if (originalSameOriginContent === undefined) {
      delete process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_CONTENT;
    } else {
      process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_CONTENT = originalSameOriginContent;
    }
    if (originalRelease === undefined) {
      delete process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE;
    } else {
      process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE = originalRelease;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL = originalBaseUrl;
    }
  });

  it('keeps vocabulary, editorial, and covers on the current origin', async () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_CONTENT = '1';
    process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE = 'app-qb-v10-test';
    process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_BASE_URL = 'https://content.example.test/release';

    await expect(resolveWebContentUrl('/vocabulary/dataset.json')).resolves.toBe(
      '/web-content/releases/app-qb-v10-test/vocabulary/dataset.json',
    );
    await expect(resolveWebContentUrl('/editorial/release.json')).resolves.toBe(
      '/web-content/releases/app-qb-v10-test/editorial/release.json',
    );
    await expect(resolveWebContentUrl('/editorial-assets/article/cover.jpg')).resolves.toBe(
      '/web-content/releases/app-qb-v10-test/editorial-assets/article/cover.jpg',
    );
  });
});
