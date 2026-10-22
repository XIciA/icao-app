export type Box = { x: number; y: number; width: number; height: number };
export type GuideViewport = { top?: number; bottom?: number };
/** Keep the callout outside the target; large reading regions use a compact edge hint. */
export function guidePlacement(target: Box | undefined, width: number, height: number, bubbleHeight: number, viewport: GuideViewport = {}) {
  const margin = 16, gap = 38, top = (viewport.top ?? 0) + margin;
  const bottom = height - (viewport.bottom ?? 0) - margin;
  const bubbleWidth = Math.min(280, Math.max(0, width - margin * 2));
  const x = target ? Math.max(margin, Math.min(target.x + target.width / 2 - bubbleWidth / 2, width - bubbleWidth - margin)) : margin;
  // A missing anchor must never put a blind callout over the bottom action.
  if (!target) return { x, y: Math.max(top, Math.min(top + 56, bottom - Math.min(bubbleHeight, 120))), width: bubbleWidth, above: false, line: false, compact: true };
  const below = target.y + target.height + gap, aboveY = target.y - bubbleHeight - gap;
  if (aboveY >= top) return { x, y: aboveY, width: bubbleWidth, above: true, line: false, compact: false };
  if (below + bubbleHeight <= bottom) return { x, y: below, width: bubbleWidth, above: false, line: false, compact: false };
  // Prefer a free side for large targets. The compact reading hint can be hidden.
  const left = target.x - margin - gap, right = width - margin - target.x - target.width - gap;
  if (Math.max(left, right) >= 180) return { x: left >= right ? margin : target.x + target.width + gap, y: top, width: Math.min(bubbleWidth, Math.max(left, right)), above: false, line: true, compact: false };
  return { x: margin, y: Math.max(top, Math.min(top + 56, bottom - Math.min(bubbleHeight, 120))), width: bubbleWidth, above: false, line: false, compact: true };
}
