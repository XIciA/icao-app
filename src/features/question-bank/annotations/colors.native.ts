import { ANNOTATION_PALETTE } from '@icao/contracts/annotation-management';

import type { AnnotationToneKey } from './types';

export const annotationToneColors: Record<AnnotationToneKey, string> = { ...ANNOTATION_PALETTE };

export const annotationHighlightBackgrounds = Object.fromEntries(Object.entries(ANNOTATION_PALETTE).map(([key, hex]) => {
  const components = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return [key, `rgba(${components.join(', ')}, ${key === 'yellow' ? '0.38' : key === 'blue' ? '0.18' : '0.30'})`];
})) as Record<AnnotationToneKey, string>;
