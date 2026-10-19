export type Box = { x: number; y: number; width: number; height: number };
/** View-local placement; never changes or moves the actual control. */
export function guidePlacement(target: Box | undefined, width: number, height: number, bubbleHeight: number) {
  const margin = 16, bubbleWidth = Math.min(260, width - margin * 2);
  if (!target) return { x: margin, y: Math.max(margin, height - bubbleHeight - 48), width: bubbleWidth, above: false, line: true };
  const center = target.x + target.width / 2;
  const x = Math.max(margin, Math.min(center - bubbleWidth / 2, width - bubbleWidth - margin));
  const below = target.y + target.height + 16, aboveY = target.y - bubbleHeight - 16;
  if (below + bubbleHeight < height - margin) return { x, y: below, width: bubbleWidth, above: false, line: false };
  if (aboveY > margin) return { x, y: aboveY, width: bubbleWidth, above: true, line: false };
  return { x: margin, y: Math.max(margin, Math.min(height - bubbleHeight - 32, target.y - bubbleHeight / 2)), width: bubbleWidth, above: false, line: true };
}
