import { isFormalAppSurface, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';

const HIDDEN_FORMAL_APP_CONTENT_SLUGS = new Set(['ai-report', 'courses']);

export type MockExamDiscoverCopy = Readonly<{
  title: string;
  en: string;
  description: string;
}>;

const FORMAL_APP_MOCK_EXAM_COPY: MockExamDiscoverCopy = Object.freeze({
  title: '模拟练习',
  en: 'Practice',
  description: '按题目完成口语练习',
});

const VERCEL_LEGACY_MOCK_EXAM_COPY: MockExamDiscoverCopy = Object.freeze({
  title: 'AI 模考',
  en: 'Mock Exam',
  description: 'AI 考官问答实时评分',
});

export function isContentAvailableOnPlatform(
  slug: string,
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
) {
  return !isFormalAppSurface(platform, runtime) || !HIDDEN_FORMAL_APP_CONTENT_SLUGS.has(slug);
}

export function resolveMockExamDiscoverCopy(
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): MockExamDiscoverCopy {
  return isFormalAppSurface(platform, runtime)
    ? FORMAL_APP_MOCK_EXAM_COPY
    : VERCEL_LEGACY_MOCK_EXAM_COPY;
}
