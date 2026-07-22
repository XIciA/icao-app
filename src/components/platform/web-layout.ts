import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const WEB_LAYOUT_BREAKPOINTS = Object.freeze({
  desktop: 1024,
  tablet: 768,
});

export const WEB_CONTENT_LAYOUT = Object.freeze({
  desktopMaxWidth: 1280,
  desktopWidthRatio: 0.88,
});

export type WebLayoutMode = 'mobile' | 'tablet' | 'desktop';

export function resolveWebLayoutMode(width: number): WebLayoutMode {
  if (width >= WEB_LAYOUT_BREAKPOINTS.desktop) return 'desktop';
  if (width >= WEB_LAYOUT_BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

export function resolveWebContentWidth(width: number): number {
  if (resolveWebLayoutMode(width) !== 'desktop') return width;
  return Math.min(width * WEB_CONTENT_LAYOUT.desktopWidthRatio, WEB_CONTENT_LAYOUT.desktopMaxWidth);
}

export function useWebLayout() {
  const viewport = useWindowDimensions();
  const mode = useMemo(() => resolveWebLayoutMode(viewport.width), [viewport.width]);
  const contentWidth = useMemo(() => resolveWebContentWidth(viewport.width), [viewport.width]);

  return {
    ...viewport,
    contentWidth,
    isDesktop: mode === 'desktop',
    isMobile: mode === 'mobile',
    isTablet: mode === 'tablet',
    mode,
  } as const;
}
