/** Public learning is filtered by content access; account and discover tools remain protected. */
const publicPaths = new Set(['/', '/discover', '/profile', '/download', '/info/about', '/info/agreement', '/info/privacy', '/info/services']);

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

/** Ordinary account entry never restores a previous tab or private account page. */
export function postLoginDestination(params: Record<string, string | string[] | undefined>) {
  const target = typeof params.next === 'string' ? safeAppDestination(params.next) : undefined;
  if (params.intent === 'external' && target) {
    const path = normalizedAppPath(target);
    if (/^\/question-bank\/[^/]+(?:\/study\/[^/]+\/[^/]+)?$/u.test(path)
      || /^\/content\/(?:hotspot|resources)\/[^/]+(?:\/study)?$/u.test(path)) return target;
  }
  return '/(tabs)';
}

/** Match the current content page to an actual incoming app/universal link. */
export function isExternalContentEntry(url: string | null | undefined, pathname: string, destination: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['readyoufife:', 'https:', 'http:'].includes(parsed.protocol)) return false;
    if (parsed.protocol !== 'readyoufife:' && parsed.hostname !== 'readyoufife.com' && parsed.hostname !== 'www.readyoufife.com') return false;
    const incoming = parsed.protocol === 'readyoufife:' ? `/${parsed.host}${parsed.pathname}` : parsed.pathname;
    return normalizedAppPath(incoming) === normalizedAppPath(pathname)
      && normalizedAppPath(destination) === normalizedAppPath(pathname)
      && postLoginDestination({ intent: 'external', next: destination }) !== '/(tabs)';
  } catch { return false; }
}
