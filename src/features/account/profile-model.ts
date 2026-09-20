import type { QuestionBankId } from '@/features/question-bank/types';
import { normalizeStudyScope, type StudyScope } from '@icao/contracts';

export const EXAM_GOALS = [
  { id: 'icao4-first', label: 'ICAO 4 初考', banks: ['listening', 'sentences900', 'radiotelephony', 'opi'] },
  { id: 'icao4-recert', label: 'ICAO 4 复考', banks: ['radiotelephony', 'opi'] },
  { id: 'icao5-first', label: 'ICAO 5 初考', banks: ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'] },
  { id: 'icao5-recert', label: 'ICAO 5 复考', banks: ['radiotelephony', 'opi', 'storytelling'] },
] as const satisfies readonly { id: string; label: string; banks: readonly QuestionBankId[] }[];

export type ExamGoal = typeof EXAM_GOALS[number]['id'];
export type UserProfile = { displayName: string; avatarUri: string | null; target: ExamGoal; studyScope?: StudyScope };
export const MAX_PROFILE_AVATAR_LENGTH = 180_000;
export const DEFAULT_PROFILE: Readonly<UserProfile> = Object.freeze({
  avatarUri: null,
  displayName: '飞行学员',
  target: 'icao4-first',
  studyScope: 'selected',
});

export function examGoal(value: unknown) {
  return EXAM_GOALS.find((goal) => goal.id === value) ?? EXAM_GOALS[0];
}

export function normalizeProfile(value: unknown): UserProfile {
  const data = value && typeof value === 'object' ? value as Partial<UserProfile> : {};
  const name = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  return {
    displayName: name && Array.from(name).length <= 24 ? name : DEFAULT_PROFILE.displayName,
    target: examGoal(data.target).id,
    studyScope: normalizeStudyScope(data.studyScope),
    // Local file paths are deliberately not accepted as cross-device profile data.
    avatarUri: typeof data.avatarUri === 'string'
      && data.avatarUri.length <= MAX_PROFILE_AVATAR_LENGTH
      && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/u.test(data.avatarUri)
      ? data.avatarUri : null,
  };
}
