import { compactDownloadError, downloadRetryDelay } from '../download-feedback';

test('a temporary credential limit remains a recoverable status after persistence', () => {
  const error = { code: 'content_credential_rate_limited', status: 429, retryAfterSeconds: 300 };
  expect(compactDownloadError(error)).toBe('稍后重试');
  expect(compactDownloadError(compactDownloadError(error))).toBe('稍后重试');
  expect(downloadRetryDelay(error, 8)).toBe(300_000);
  expect(downloadRetryDelay({ status: 429 }, 0)).toBe(60_000);
});

test('permanent access, integrity and storage failures do not auto retry', () => {
  for (const error of [{ status: 401 }, { status: 403 }, new Error('checksum_mismatch'), new Error('SQLITE_FULL')]) {
    expect(downloadRetryDelay(error, 0)).toBeUndefined();
  }
  expect(downloadRetryDelay({ status: 503 }, 0)).toBe(2000);
  expect(downloadRetryDelay({ status: 503 }, 3)).toBeUndefined();
});
