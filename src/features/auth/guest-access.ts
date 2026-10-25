/** Public learning and course promotion are browsable; account and learning tools remain protected. */
const publicPaths = new Set(['/', '/discover', '/profile', '/download', '/content/courses', '/info/about', '/info/agreement', '/info/privacy', '/info/services']);

export function normalizedAppPath(path: string) {
  const pathname = path.split(/[?#]/u)[0].replace(/^\/\(tabs\)(?=\/|$)/u, '') || '/';
  return pathname.length > 1 ? pathname.replace(/\/$/u, '') : pathname;
}

export function isGuestPublicPath(path: string) {
  const pathname = normalizedAppPath(path);
  return /^\/question-bank\/[^/]+(?:\/study\/[^/]+\/[^/]+)?$/u.test(pathname) || publicPaths.has(pathname) || /^\/legal\/(agreement|privacy|services)$/u.test(pathname);
}

export function isPublicStackScreen(name: string, params?: object) {
  if (['index', '(tabs)', 'auth/[slug]', 'download'].includes(name)) return true;
  if (['question-bank/[bankId]/index', 'question-bank/[bankId]/study/[categoryId]/[topicId]'].includes(name)) return true;
  if (name === 'content/[slug]' && (params as { slug?: unknown } | undefined)?.slug === 'courses') return true;
  if (name === 'legal/[slug]') return ['agreement', 'privacy', 'services'].includes(String((params as { slug?: unknown } | undefined)?.slug));
  return name === 'info/[slug]' && ['about', 'agreement', 'privacy', 'services'].includes(String((params as { slug?: unknown } | undefined)?.slug));
}

/** Only in-app paths can be saved as post-login destinations. */
export function safeAppDestination(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/u.test(value)) return undefined;
  const pathname = normalizedAppPath(value);
  if (pathname.startsWith('/auth/') || pathname.startsWith('/legal/')) return undefined;
  return value;
}

export function publicLoginReturn(value: string | string[] | undefined) {
  const path = typeof value === 'string' ? safeAppDestination(value) : undefined;
  return path && isGuestPublicPath(path) ? path : '/(tabs)';
}

export function destinationWithQuery(pathname: string, params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Expo exposes path parameters alongside search parameters.
    if (['slug', 'bankId', 'categoryId', 'topicId', 'briefId', 'articleSlug'].includes(key)) continue;
    if (key.startsWith('__') || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  return `${pathname}${query.size ? `?${query.toString()}` : ''}`;
}
