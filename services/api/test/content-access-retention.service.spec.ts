import { describe, expect, it, vi } from 'vitest';

import { ContentAccessRetentionService } from '../src/content-access/content-access-retention.service';
import type { DatabaseService } from '../src/database/database.service';

describe('ContentAccessRetentionService', () => {
  it('deletes both credential and Sandbox grant retention batches', async () => {
    const execute = vi.fn(async () => undefined);
    const service = new ContentAccessRetentionService({ db: { execute } } as unknown as DatabaseService);

    await service.cleanup(new Date('2026-08-25T00:00:00.000Z'));

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
