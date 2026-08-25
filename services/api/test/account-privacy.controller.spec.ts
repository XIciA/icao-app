import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AccountPrivacyController } from '../src/account/account-privacy.controller';
import type { AccountService } from '../src/account/account.service';
import type { AuthenticatedRequest } from '../src/auth/auth.types';
import type { SyncService } from '../src/sync/sync.service';

const request = {
  id: 'request-1',
  user: { id: '11111111-1111-4111-8111-111111111111', phone: '+8613800138000' },
} as AuthenticatedRequest;

function fixture() {
  const generations = { aiResultGeneration: 2, dataGeneration: 3, deletedCount: 4 };
  const account = {
    exportAccountData: vi.fn().mockResolvedValue({
      accountId: request.user!.id,
      createdAt: '2026-08-01T00:00:00.000Z',
      phone: request.user!.phone,
      providers: ['phone'],
    }),
  };
  const sync = {
    clearLearningData: vi.fn().mockResolvedValue(generations),
    deleteAiResult: vi.fn().mockResolvedValue(generations),
    deleteAllAiResults: vi.fn().mockResolvedValue(generations),
    exportLearningData: vi.fn().mockResolvedValue({
      aiResultGeneration: 2,
      cardStates: [],
      dataGeneration: 3,
      documents: [],
      records: [],
    }),
  };
  return {
    account,
    controller: new AccountPrivacyController(
      account as unknown as AccountService,
      sync as unknown as SyncService,
    ),
    generations,
    sync,
  };
}

describe('AccountPrivacyController', () => {
  it('routes single and bulk deletions only for the authenticated account', async () => {
    const { controller, generations, sync } = fixture();

    await expect(controller.deleteAiResult('result-1', request)).resolves.toEqual({ requestId: 'request-1', data: generations });
    await expect(controller.deleteAllAiResults({ confirmation: '删除全部AI结果' }, request)).resolves.toEqual({ requestId: 'request-1', data: generations });
    await expect(controller.clearLearningData({ confirmation: '清除学习数据' }, request)).resolves.toEqual({ requestId: 'request-1', data: generations });

    expect(sync.deleteAiResult).toHaveBeenCalledWith(request.user!.id, 'result-1');
    expect(sync.deleteAllAiResults).toHaveBeenCalledWith(request.user!.id);
    expect(sync.clearLearningData).toHaveBeenCalledWith(request.user!.id);
  });

  it('rejects malformed destructive confirmations before touching learning data', async () => {
    const { controller, sync } = fixture();

    await expect(controller.deleteAllAiResults({ confirmation: '删除' } as never, request))
      .rejects.toSatisfy((error: unknown) => error instanceof BadRequestException && error.message === 'invalid_privacy_confirmation');
    await expect(controller.clearLearningData({ confirmation: '清除' } as never, request))
      .rejects.toSatisfy((error: unknown) => error instanceof BadRequestException && error.message === 'invalid_privacy_confirmation');
    expect(sync.deleteAllAiResults).not.toHaveBeenCalled();
    expect(sync.clearLearningData).not.toHaveBeenCalled();
  });

  it('exports account and learning snapshots without exposing another account selector', async () => {
    const { account, controller, sync } = fixture();

    const response = await controller.exportData(request);

    expect(response.data).toMatchObject({
      schemaVersion: 1,
      account: { accountId: request.user!.id, phone: request.user!.phone },
      learning: { dataGeneration: 3, aiResultGeneration: 2 },
    });
    expect(account.exportAccountData).toHaveBeenCalledWith(request.user!.id, request.user!.phone);
    expect(sync.exportLearningData).toHaveBeenCalledWith(request.user!.id);
  });
});
