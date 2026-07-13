import { colors } from '@/theme';

import type { AnnotationToneKey } from './types';

export const annotationToneColors: Record<AnnotationToneKey, string> = {
  green: '#34C98A',
  yellow: '#F2C94C',
  red: '#F06570',
  blue: colors.primary,
};

export const annotationHighlightBackgrounds: Record<AnnotationToneKey, string> = {
  green: 'rgba(52, 201, 138, 0.30)',
  yellow: 'rgba(242, 201, 76, 0.38)',
  red: 'rgba(240, 101, 112, 0.30)',
  blue: 'rgba(31, 94, 217, 0.18)',
};
