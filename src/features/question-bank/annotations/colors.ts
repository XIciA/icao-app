import { colors } from '@/theme';

import type { AnnotationToneKey } from './types';

export const annotationToneColors: Record<AnnotationToneKey, string> = {
  green: '#45A26B',
  yellow: '#D6A72D',
  red: '#D94A53',
  blue: colors.primary,
};

export const annotationHighlightBackgrounds: Record<AnnotationToneKey, string> = {
  green: 'rgba(69, 162, 107, 0.24)',
  yellow: 'rgba(214, 167, 45, 0.28)',
  red: 'rgba(217, 74, 83, 0.20)',
  blue: 'rgba(31, 94, 217, 0.18)',
};
