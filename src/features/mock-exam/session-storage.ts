import Storage from '@/platform/storage';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { recordingRepository } from '@/features/question-bank/recording/recording-repository';

import { MOCK_EXAM_MODULE_LABELS, MOCK_EXAM_TYPE_LABELS } from './rules';
import type { MockExamDraft, MockExamSession } from './types';

const DRAFT_KEY = 'icao.mock-exam.v1.draft';

export function makeMockExamDraft(session: MockExamSession, answeredItemIds: Iterable<string>): MockExamDraft {
  return {
    id: session.id,
    startedAt: session.startedAt,
    config: session.config,
    mode: session.mode,
    sections: session.sections.map((section) => ({ id: section.id, title: section.title, items: section.items.map((item) => ({ id: item.id })) })),
    answeredItemIds: [...answeredItemIds],
  };
}

export async function saveMockExamDraft(draft: MockExamDraft) { await Storage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export async function clearMockExamDraft() { await Storage.removeItem(DRAFT_KEY); }

async function readMockExamDraft() {
  const raw = await Storage.getItem(DRAFT_KEY);
  if (!raw) return undefined;
  try { return JSON.parse(raw) as MockExamDraft; } catch { await clearMockExamDraft(); return undefined; }
}

export async function finishMockExam(draft: MockExamDraft, reason: 'abort' | 'complete') {
  const totalCount = draft.sections.reduce((sum, section) => sum + section.items.length, 0);
  const now = new Date().toISOString();
  await sqliteLearningStore.addRecord({
    id: `mock-exam-record-${draft.id}`,
    sessionId: draft.id,
    bankId: 'mock_exam',
    bankTitle: 'AI 模考',
    categoryTitle: MOCK_EXAM_TYPE_LABELS[draft.config.examType],
    topicTitle: draft.mode === 'complete' ? '按考试规则组卷' : `自选模考 · ${draft.config.modules.map((id) => MOCK_EXAM_MODULE_LABELS[id]).join('、')}`,
    completedCount: draft.answeredItemIds.length,
    totalCount,
    correctCount: 0,
    durationSeconds: Math.max(1, Math.round((Date.now() - Date.parse(draft.startedAt)) / 1000)),
    reason,
    createdAt: now,
    updatedAt: now,
    recordType: 'mock_exam',
    mockExam: {
      examType: draft.config.examType,
      mode: draft.mode,
      moduleIds: draft.config.modules,
      sectionCounts: draft.sections.map((section) => ({ id: section.id, title: section.title, total: section.items.length })),
    },
  });
  recordingRepository.cleanupSession(draft.id);
  await clearMockExamDraft();
}

export async function recoverInterruptedMockExam() {
  const draft = await readMockExamDraft();
  if (!draft) return false;
  await finishMockExam(draft, 'abort');
  return true;
}
