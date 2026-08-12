import Storage from '@/platform/storage';

import { discardLegacyMockExamDraft } from '../legacy-draft-cleanup';

jest.mock('@/platform/storage', () => ({
  __esModule: true,
  default: { removeItem: jest.fn(async () => undefined) },
}));

describe('discardLegacyMockExamDraft', () => {
  it('removes the obsolete resumable draft without converting it into a record', async () => {
    await discardLegacyMockExamDraft();

    expect(Storage.removeItem).toHaveBeenCalledWith('icao.mock-exam.v1.draft');
  });
});
