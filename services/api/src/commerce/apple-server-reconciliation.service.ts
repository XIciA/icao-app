import { Injectable } from '@nestjs/common';

import type { CommerceEnvironment } from './product-catalog';
import {
  AppleStoreServerApiService,
} from './apple-store-server-api.service';
import {
  CommerceService,
  type AppleCommerceReconciliationReport,
} from './commerce.service';

export type AppleServerReconciliationResult = Readonly<{
  accountId: string;
  applied: number;
  checked: number;
  environment: CommerceEnvironment;
  mismatches: number;
  mode: 'apply' | 'dry_run';
  pages: number;
  transactions: readonly AppleCommerceReconciliationReport[];
}>;

@Injectable()
export class AppleServerReconciliationService {
  constructor(
    private readonly appleServer: AppleStoreServerApiService,
    private readonly commerce: CommerceService,
  ) {}

  async reconcileTransactionHistory(input: Readonly<{
    apply: boolean;
    environment: CommerceEnvironment;
    maxPages?: number;
    maxTransactions?: number;
    transactionId: string;
  }>): Promise<AppleServerReconciliationResult> {
    const history = await this.appleServer.loadTransactionHistory(
      input.environment,
      input.transactionId,
      {
        maxPages: input.maxPages,
        maxTransactions: input.maxTransactions,
      },
    );
    const reports: AppleCommerceReconciliationReport[] = [];
    for (const item of history.transactions) {
      reports.push(await this.commerce.reconcileAppleServerTransaction(
        item.signedTransaction,
        input.environment,
        input.apply,
      ));
    }
    return this.result(history, input.environment, input.apply, reports);
  }

  private result(
    history: Readonly<{ accountId: string; pages: number }>,
    environment: CommerceEnvironment,
    apply: boolean,
    transactions: readonly AppleCommerceReconciliationReport[],
  ): AppleServerReconciliationResult {
    return {
      accountId: history.accountId,
      applied: transactions.filter((item) => item.applied).length,
      checked: transactions.length,
      environment,
      mismatches: transactions.filter((item) => item.mismatch).length,
      mode: apply ? 'apply' : 'dry_run',
      pages: history.pages,
      transactions,
    };
  }
}
