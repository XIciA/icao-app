import { colors } from '@/theme';

import type { AnnotationToneKey } from './types';

export const annotationToneColors = {
  green: '#34C98A',
  yellow: '#F2C94C',
  red: '#F06570',
  blue: colors.primary,
} as Record<AnnotationToneKey, string>;

export const annotationHighlightBackgrounds = {
  green: 'rgba(52, 201, 138, 0.30)',
  yellow: 'rgba(242, 201, 76, 0.38)',
  red: 'rgba(240, 101, 112, 0.30)',
  blue: 'rgba(31, 94, 217, 0.18)',
} as Record<AnnotationToneKey, string>;
