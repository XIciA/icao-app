const HIDDEN_NATIVE_CONTENT_SLUGS = new Set(['ai-report', 'courses']);

export function isContentAvailableOnPlatform(slug: string, platform: string) {
  return platform === 'web' || !HIDDEN_NATIVE_CONTENT_SLUGS.has(slug);
}
