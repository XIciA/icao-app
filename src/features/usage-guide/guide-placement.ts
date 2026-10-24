export type Box = { x: number; y: number; width: number; height: number };
export type GuideViewport = { top?: number; bottom?: number };
/** Place callouts within the available area; compact means no valid adjacent placement. */
export function guidePlacement(target: Box | undefined, width: number, height: number, textHeight: number, viewport: GuideViewport = {}) {
  const margin = 16, gap = 20;
  const top = (viewport.top ?? 0) + margin, bottom = height - (viewport.bottom ?? 0) - margin;
  const textWidth = Math.min(320, Math.max(0, width - margin * 2));
  const x = target ? Math.max(margin, Math.min(target.x + target.width / 2 - textWidth / 2, width - textWidth - margin)) : margin;
  const base = { x, y: top, width: textWidth, above: false, line: false, compact: true };
  if (!target || width <= 0 || bottom - top < textHeight) return base;
  const below = Math.max(target.y + target.height + gap, top), above = Math.min(target.y - gap, bottom) - textHeight;
  if (below + textHeight <= bottom) return { ...base, y: below, compact: false };
  if (above >= top) return { ...base, y: above, above: true, compact: false };
  const left = target.x - margin - gap, right = width - margin - target.x - target.width - gap;
  if (Math.max(left, right) >= 180) return { ...base, x: left >= right ? margin : target.x + target.width + gap, width: Math.min(textWidth, Math.max(left, right)), line: true, compact: false };
  return base;
}

/** A compact control has one horizontal origin, never competing left/right insets. */
export function guideSkipPlacement(target: Box | undefined, width: number, top: number): Box {
  const pillWidth = Math.min(112, Math.max(0, width - 32)), height = 44;
  const right = Math.max(16, width - 16 - pillWidth);
  const overlaps = (x: number) => !!target && target.x < x + pillWidth + 8 && target.x + target.width > x - 8 && target.y < top + height && target.y + target.height > top;
  if (!overlaps(right)) return { x: right, y: top, width: pillWidth, height };
  const left = 72; // Reserve the existing back/close control at the leading edge.
  if (!overlaps(left)) return { x: left, y: top, width: pillWidth, height };
  return { x: right, y: Math.max(top, (target?.y ?? top) + (target?.height ?? 0) + 12), width: pillWidth, height };
}
