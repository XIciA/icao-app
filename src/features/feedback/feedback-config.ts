import type { FeedbackCategory } from '@icao/contracts';
export type FeedbackKind = 'opinion' | 'exam_report' | 'opi_hotspot';
export const feedbackKind = (source?: string): FeedbackKind => source === 'exam_report' || source === 'opi_hotspot' ? source : 'opinion';
export const feedbackTitle = (kind: FeedbackKind) => kind === 'exam_report' ? '考情反馈' : kind === 'opi_hotspot' ? 'OPI 热点收集' : '意见反馈';
export const feedbackCategories: Record<FeedbackCategory, string> = { feature_suggestion: '功能建议', content_correction: '内容纠错', other: '其他', listening: '听力', sentences900: '900句', radiotelephony: '陆空通话', storytelling: '故事复述', opi: 'OPI' };
export const examFeedbackOptions = (['listening', 'sentences900', 'radiotelephony', 'storytelling', 'opi'] as const).map(value => ({ value, label: feedbackCategories[value] }));
