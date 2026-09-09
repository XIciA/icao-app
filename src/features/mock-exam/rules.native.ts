import type { MockExamModuleId, MockExamType } from './types.native';

export const MOCK_EXAM_MODULE_ORDER: MockExamModuleId[] = ['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'];

export const MOCK_EXAM_MODULES: Record<MockExamType, MockExamModuleId[]> = {
  'icao4-recert': ['radiotelephony', 'opi'],
  'icao5-recert': ['radiotelephony', 'storytelling', 'opi'],
  'icao4-first': ['listening', 'sentences900', 'radiotelephony', 'opi'],
  'icao5-first': ['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'],
};

export const MOCK_EXAM_TYPE_LABELS: Record<MockExamType, string> = {
  'icao4-recert': 'ICAO 4 复考',
  'icao5-recert': 'ICAO 5 复考',
  'icao4-first': 'ICAO 4 初考',
  'icao5-first': 'ICAO 5 初考',
};

export const MOCK_EXAM_MODULE_LABELS: Record<MockExamModuleId, string> = {
  listening: '听力', sentences900: '900 句', radiotelephony: '陆空通话', storytelling: '故事复述', opi: 'OPI 口语面试',
};
