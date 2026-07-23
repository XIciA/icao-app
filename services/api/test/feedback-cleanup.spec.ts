import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { FeedbackAttachmentStorage } from '../src/feedback/feedback-attachment-storage';
import { FeedbackCleanupService } from '../src/feedback/feedback-cleanup.service';

function database(expired: { id: string; objectKey: string }[], referenced: string[]) {
  const select = vi.fn()
    .mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: async () => expired }) }),
    }))
    .mockImplementationOnce(() => ({
      from: () => ({ where: async () => referenced.map((objectKey) => ({ objectKey })) }),
    }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  return {
    service: {
      db: {
        select,
        update: vi.fn(() => ({ set: updateSet })),
      },
    } as unknown as DatabaseService,
    updateSet,
    updateWhere,
  };
}

describe('FeedbackCleanupService', () => {
  const now = new Date('2027-07-24T00:00:00.000Z');

  it('deletes expired attachments, marks them deleted, and removes only unreferenced old objects', async () => {
    const fakeDatabase = database(
      [{ id: 'expired-id', objectKey: 'feedback/expired.png' }],
      ['feedback/referenced.png'],
    );
    const storage = {
      remove: vi.fn(async () => undefined),
      listOldest: vi.fn(async () => [
        { objectKey: 'feedback/referenced.png', createdAt: new Date('2027-07-22T00:00:00.000Z') },
        { objectKey: 'feedback/orphan.png', createdAt: new Date('2027-07-22T00:00:00.000Z') },
        { objectKey: 'feedback/recent.png', createdAt: new Date('2027-07-23T12:00:00.000Z') },
      ]),
    };
    const service = new FeedbackCleanupService(
      { nodeEnv: 'test' } as ApiConfig,
      fakeDatabase.service,
      storage as unknown as FeedbackAttachmentStorage,
    );

    await service.run(now);

    expect(storage.remove).toHaveBeenNthCalledWith(1, ['feedback/expired.png']);
    expect(storage.remove).toHaveBeenNthCalledWith(2, ['feedback/orphan.png']);
    expect(fakeDatabase.updateSet).toHaveBeenCalledWith({ deletedAt: now });
    expect(fakeDatabase.updateWhere).toHaveBeenCalledTimes(1);
  });

  it('keeps an expired row eligible when object deletion fails', async () => {
    const fakeDatabase = database(
      [{ id: 'retry-id', objectKey: 'feedback/retry.png' }],
      [],
    );
    const storage = {
      remove: vi.fn()
        .mockRejectedValueOnce(new Error('storage_unavailable'))
        .mockResolvedValue(undefined),
      listOldest: vi.fn(async () => []),
    };
    const service = new FeedbackCleanupService(
      { nodeEnv: 'test' } as ApiConfig,
      fakeDatabase.service,
      storage as unknown as FeedbackAttachmentStorage,
    );

    await service.run(now);

    expect(fakeDatabase.updateSet).not.toHaveBeenCalled();
  });
});
