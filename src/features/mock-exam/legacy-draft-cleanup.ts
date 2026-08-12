import Storage from '@/platform/storage';

const LEGACY_MOCK_EXAM_DRAFT_KEY = 'icao.mock-exam.v1.draft';

export async function discardLegacyMockExamDraft() {
  await Storage.removeItem(LEGACY_MOCK_EXAM_DRAFT_KEY);
}
