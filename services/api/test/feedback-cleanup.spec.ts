import { HttpException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { FeedbackAttachmentStorage } from '../src/feedback/feedback-attachment-storage';
import { FeedbackCleanupService } from '../src/feedback/feedback-cleanup.service';

type Row = Record<string, unknown>;

function database(selectResults: Row[][]) {
  const remaining = [...selectResults];
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => remaining.shift() ?? [],
      }),
    }),
  }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteRow = vi.fn(() => ({ where: deleteWhere }));
  return {
    service: { db: { select, delete: deleteRow } } as unknown as DatabaseService,
    deleteRow,
    deleteWhere,
  };
}

function cleanupService(
  fakeDatabase: ReturnType<typeof database>,
  storage: { remove: ReturnType<typeof vi.fn>; listOldest: ReturnType<typeof vi.fn> },
) {
  return new FeedbackCleanupService(
    { nodeEnv: 'test' } as ApiConfig,
    fakeDatabase.service,
    storage as unknown as FeedbackAttachmentStorage,
  );
}

describe('FeedbackCleanupService', () => {
  const now = new Date('2027-07-24T00:00:00.000Z');

  it('removes attachment objects before deleting the complete expired ticket', async () => {
    const fakeDatabase = database([
      [{ id: 'expired-ticket' }],
      [{ objectKey: 'feedback/expired.png' }],
    ]);
    const storage = {
      remove: vi.fn(async () => undefined),
      listOldest: vi.fn(async () => []),
    };
    const service = cleanupService(fakeDatabase, storage);

    await expect(service.run(now)).resolves.toEqual({
      ticketsDeleted: 1,
      ticketFailures: 0,
      orphanObjectsDeleted: 0,
    });

    expect(storage.remove).toHaveBeenCalledWith(['feedback/expired.png']);
    expect(fakeDatabase.deleteRow).toHaveBeenCalledTimes(1);
    expect(fakeDatabase.deleteWhere).toHaveBeenCalledTimes(1);
    const storageRemovalOrder = storage.remove.mock.invocationCallOrder[0];
    const ticketDeletionOrder = fakeDatabase.deleteWhere.mock.invocationCallOrder[0];
    expect(storageRemovalOrder).toBeDefined();
    expect(ticketDeletionOrder).toBeDefined();
    expect(storageRemovalOrder!).toBeLessThan(ticketDeletionOrder!);
  });

  it('deletes an expired ticket without calling storage for an empty attachment list', async () => {
    const fakeDatabase = database([
      [{ id: 'text-only-ticket' }],
      [],
    ]);
    const storage = {
      remove: vi.fn(async () => undefined),
      listOldest: vi.fn(async () => []),
    };
    const service = cleanupService(fakeDatabase, storage);

    await expect(service.run(now)).resolves.toEqual({
      ticketsDeleted: 1,
      ticketFailures: 0,
      orphanObjectsDeleted: 0,
    });

    expect(storage.remove).not.toHaveBeenCalled();
    expect(fakeDatabase.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('keeps the whole ticket eligible, logs a redacted failure, and retries next pass', async () => {
    const fakeDatabase = database([
      [{ id: 'retry-ticket' }],
      [{ objectKey: 'feedback/retry.png' }],
      [{ id: 'retry-ticket' }],
      [{ objectKey: 'feedback/retry.png' }],
    ]);
    const storage = {
      remove: vi.fn()
        .mockRejectedValueOnce(new HttpException('feedback_cleanup_failed', 503))
        .mockResolvedValue(undefined),
      listOldest: vi.fn(async () => []),
    };
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = cleanupService(fakeDatabase, storage);

    await expect(service.run(now)).resolves.toMatchObject({ ticketFailures: 1, ticketsDeleted: 0 });
    expect(fakeDatabase.deleteWhere).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      event: 'feedback_cleanup_failed',
      failureCode: 'feedback_cleanup_failed',
      retryable: true,
      stage: 'ticket',
    });

    await expect(service.run(now)).resolves.toMatchObject({ ticketFailures: 0, ticketsDeleted: 1 });
    expect(fakeDatabase.deleteWhere).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('makes a scheduled cycle failure visible without exposing its raw error and allows the next run', async () => {
    const select = vi.fn()
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: async () => { throw new Error('private database detail'); } }) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }));
    const fakeDatabase = {
      service: { db: { select, delete: vi.fn() } } as unknown as DatabaseService,
    };
    const storage = {
      remove: vi.fn(async () => undefined),
      listOldest: vi.fn(async () => []),
    };
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new FeedbackCleanupService(
      { nodeEnv: 'test' } as ApiConfig,
      fakeDatabase.service,
      storage as unknown as FeedbackAttachmentStorage,
    );

    await expect(service.runScheduled(now)).resolves.toMatchObject({ ticketFailures: 1 });
    expect(log).toHaveBeenCalledWith({
      event: 'feedback_cleanup_failed',
      failureCode: 'feedback_cleanup_unexpected',
      retryable: true,
      stage: 'cycle',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private database detail');

    await expect(service.runScheduled(now)).resolves.toMatchObject({ ticketFailures: 0 });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('removes old unreferenced objects left by an earlier ticket deletion', async () => {
    const fakeDatabase = database([
      [],
      [{ objectKey: 'feedback/referenced.png' }],
    ]);
    const storage = {
      remove: vi.fn(async () => undefined),
      listOldest: vi.fn(async () => [
        { objectKey: 'feedback/referenced.png', createdAt: new Date('2027-07-22T00:00:00.000Z') },
        { objectKey: 'feedback/orphan.png', createdAt: new Date('2027-07-22T00:00:00.000Z') },
        { objectKey: 'feedback/recent.png', createdAt: new Date('2027-07-23T12:00:00.000Z') },
      ]),
    };
    const service = cleanupService(fakeDatabase, storage);

    await expect(service.run(now)).resolves.toEqual({
      ticketsDeleted: 0,
      ticketFailures: 0,
      orphanObjectsDeleted: 1,
    });
    expect(storage.remove).toHaveBeenCalledWith(['feedback/orphan.png']);
  });
});
