import type { RecordingAsset } from './types';
import type { CardLearningState } from '../types';

export type StudyLoginContinuation = {
  key: string;
  sessionId: string;
  startedAt: number;
  states: Record<string, CardLearningState>;
  answers: Record<string, string>;
  recordings: Record<string, RecordingAsset>;
};
// In-memory, one-use navigation handoff. Audio still belongs to RecordingRepository.
// Nothing is uploaded or added to the synchronized LearningRecord contract.
const pending = new Map<string, { value: StudyLoginContinuation; release(): void }>();
export function retainStudyForLogin(value: StudyLoginContinuation, owner: { retainSessionForLogin(id: string): void; releaseSessionFromLogin(id: string): void }) {
  cancelStudyLogin();
  const token = `login-study-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  pending.set(token, { value, release: () => owner.releaseSessionFromLogin(value.sessionId) });
  owner.retainSessionForLogin(value.sessionId);
  return token;
}
export function peekStudyLogin(token: string | undefined, key: string) {
  const value = token ? pending.get(token) : undefined;
  return value?.value.key === key ? value.value : undefined;
}
export function finishStudyLogin(token: string | undefined) {
  const value = token ? pending.get(token) : undefined;
  if (!value || !token) return;
  pending.delete(token);
  value.release();
}
export function cancelStudyLogin() {
  for (const token of pending.keys()) finishStudyLogin(token);
}
