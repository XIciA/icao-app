import {
  WEB_CONTENT_LAYOUT,
  WEB_LAYOUT_BREAKPOINTS,
  resolveWebContentWidth,
  resolveWebLayoutMode,
} from '../web-layout';

describe('responsive web layout mode', () => {
  it.each([
    [360, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1440, 'desktop'],
  ] as const)('maps %ipx to %s', (width, mode) => {
    expect(resolveWebLayoutMode(width)).toBe(mode);
  });

  it('keeps the documented breakpoints stable', () => {
    expect(WEB_LAYOUT_BREAKPOINTS).toEqual({ desktop: 1024, tablet: 768 });
  });

  it.each([
    [390, 390],
    [768, 768],
    [1024, 901.12],
    [1440, 1267.2],
    [1920, 1280],
    [2560, 1280],
  ] as const)('limits %ipx browser content to %ipx', (width, expected) => {
    expect(resolveWebContentWidth(width)).toBeCloseTo(expected);
  });

  it('keeps the confirmed lightweight desktop width rules stable', () => {
    expect(WEB_CONTENT_LAYOUT).toEqual({ desktopMaxWidth: 1280, desktopWidthRatio: 0.88 });
  });
});
