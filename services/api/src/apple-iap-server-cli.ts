import 'reflect-metadata';

import {
  configuredAppleStoreServerApiClientFactory,
} from './commerce/apple-store-server-api-client';
import { AppleStoreServerApiService } from './commerce/apple-store-server-api.service';
import {
  AppleServerReconciliationApplyError,
  AppleServerReconciliationService,
} from './commerce/apple-server-reconciliation.service';
import { configuredAppleStoreVerifier } from './commerce/apple-store-verifier';
import { CommerceService } from './commerce/commerce.service';
import { PersistentCommerceBenefitsService } from './commerce/persistent-commerce-benefits.service';
import type { CommerceEnvironment } from './commerce/product-catalog';
import { loadConfig } from './config';
import { DatabaseService } from './database/database.service';

const TEST_NOTIFICATION_CONFIRMATION = {
  production: 'REQUEST_APPLE_TEST_NOTIFICATION_PRODUCTION',
  sandbox: 'REQUEST_APPLE_TEST_NOTIFICATION_SANDBOX',
} as const;
const RECONCILIATION_CONFIRMATION = {
  production: 'APPLY_APPLE_RECONCILIATION_PRODUCTION',
  sandbox: 'APPLY_APPLE_RECONCILIATION_SANDBOX',
} as const;

type TestNotificationCommand = Readonly<{
  command: 'test-notification';
  confirmation?: string;
  environment: CommerceEnvironment;
  execute: boolean;
}>;

type ReconcileCommand = Readonly<{
  apply: boolean;
  command: 'reconcile';
  confirmation?: string;
  environment: CommerceEnvironment;
  maxPages?: number;
  maxTransactions?: number;
  resumeBatchId?: string;
  transactionId: string;
}>;

export type AppleIapServerCliCommand = TestNotificationCommand | ReconcileCommand;

type AppleIapServerCliDependencies = Readonly<{
  isRoot: () => boolean;
  reconcile: (input: ReconcileCommand) => Promise<unknown>;
  requestTestNotification: (environment: CommerceEnvironment) => Promise<unknown>;
  write: (value: Readonly<Record<string, unknown>>) => void;
}>;

function requiredValue(values: ReadonlyMap<string, string>, key: string) {
  const value = values.get(key);
  if (!value) throw new Error(`apple_iap_server_cli_${key.replaceAll('-', '_')}_required`);
  return value;
}

function positiveInteger(value: string | undefined, code: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(code);
  return parsed;
}

export function parseAppleIapServerCliCommand(argv: readonly string[]): AppleIapServerCliCommand {
  const command = argv[0];
  if (command !== 'test-notification' && command !== 'reconcile') {
    throw new Error('apple_iap_server_cli_command_invalid');
  }
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (['--execute', '--apply'].includes(token)) {
      switches.add(token.slice(2));
      continue;
    }
    if (!token.startsWith('--')) throw new Error('apple_iap_server_cli_argument_invalid');
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || flags.has(key)) {
      throw new Error('apple_iap_server_cli_argument_invalid');
    }
    flags.set(key, value);
    index += 1;
  }
  const allowed = command === 'test-notification'
    ? new Set(['environment', 'confirm'])
    : new Set([
      'environment',
      'confirm',
      'transaction-id',
      'max-pages',
      'max-transactions',
      'resume-batch-id',
    ]);
  if ([...flags.keys()].some((key) => !allowed.has(key))) {
    throw new Error('apple_iap_server_cli_argument_invalid');
  }
  if (command === 'test-notification' && switches.has('apply')) {
    throw new Error('apple_iap_server_cli_argument_invalid');
  }
  if (command === 'reconcile' && switches.has('execute')) {
    throw new Error('apple_iap_server_cli_argument_invalid');
  }
  const environment = requiredValue(flags, 'environment');
  if (environment !== 'production' && environment !== 'sandbox') {
    throw new Error('apple_iap_server_cli_environment_invalid');
  }
  if (command === 'test-notification') {
    return {
      command,
      confirmation: flags.get('confirm'),
      environment,
      execute: switches.has('execute'),
    };
  }
  const transactionId = requiredValue(flags, 'transaction-id');
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(transactionId)) {
    throw new Error('apple_iap_server_cli_transaction_id_invalid');
  }
  const resumeBatchId = flags.get('resume-batch-id');
  if (
    resumeBatchId
    && (
      !switches.has('apply')
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
        .test(resumeBatchId)
    )
  ) throw new Error('apple_iap_server_cli_resume_batch_id_invalid');
  return {
    apply: switches.has('apply'),
    command,
    confirmation: flags.get('confirm'),
    environment,
    maxPages: positiveInteger(
      flags.get('max-pages'),
      'apple_iap_server_cli_max_pages_invalid',
    ),
    maxTransactions: positiveInteger(
      flags.get('max-transactions'),
      'apple_iap_server_cli_max_transactions_invalid',
    ),
    resumeBatchId,
    transactionId,
  };
}

export async function runAppleIapServerCli(
  argv: readonly string[],
  dependencies: AppleIapServerCliDependencies,
) {
  if (!dependencies.isRoot()) throw new Error('apple_iap_server_cli_requires_root');
  const command = parseAppleIapServerCliCommand(argv);
  if (command.command === 'test-notification') {
    if (!command.execute) {
      const result = {
        action: 'request_test_notification',
        dryRun: true,
        environment: command.environment,
        networkAttempted: false,
        requiredConfirmation: TEST_NOTIFICATION_CONFIRMATION[command.environment],
      } as const;
      dependencies.write(result);
      return result;
    }
    if (command.confirmation !== TEST_NOTIFICATION_CONFIRMATION[command.environment]) {
      throw new Error('apple_iap_server_cli_confirmation_invalid');
    }
    const response = await dependencies.requestTestNotification(command.environment);
    const result = {
      action: 'request_test_notification',
      dryRun: false,
      environment: command.environment,
      networkAttempted: true,
      response,
    } as const;
    dependencies.write(result);
    return result;
  }
  if (
    command.apply
    && command.confirmation !== RECONCILIATION_CONFIRMATION[command.environment]
  ) throw new Error('apple_iap_server_cli_confirmation_invalid');
  try {
    const response = await dependencies.reconcile(command);
    const result = {
      action: 'reconcile_transaction_history',
      databaseMutationAllowed: command.apply,
      environment: command.environment,
      response,
    } as const;
    dependencies.write(result);
    return result;
  } catch (error) {
    const result = {
      action: 'reconcile_transaction_history',
      databaseMutationAllowed: command.apply,
      environment: command.environment,
      error: error instanceof AppleServerReconciliationApplyError
        ? {
          code: error.message,
          ...(error.result.recovery
            ? {
              recoverable: true,
              resumeBatchId: error.result.recovery.resumeBatchId,
            }
            : error.result.status === 'finalization_failed'
              ? { recoverable: false }
              : {}),
          result: error.result,
        }
        : { code: safeCliErrorCode(error) },
    } as const;
    dependencies.write(result);
    throw error;
  }
}

function safeCliErrorCode(error: unknown) {
  const candidate = error instanceof Error ? error.message : '';
  return /^[a-z0-9_:-]{1,120}$/u.test(candidate)
    ? candidate
    : 'apple_iap_server_cli_failed';
}

async function main() {
  let database: DatabaseService | undefined;
  try {
    await runAppleIapServerCli(process.argv.slice(2), {
      isRoot: () => process.getuid?.() === 0,
      write: (value) => console.log(JSON.stringify(value, null, 2)),
      requestTestNotification: async (environment) => {
        const config = loadConfig();
        const service = new AppleStoreServerApiService(
          config,
          configuredAppleStoreServerApiClientFactory(config),
          configuredAppleStoreVerifier(config),
        );
        return service.requestTestNotification(environment);
      },
      reconcile: async (command) => {
        const config = loadConfig();
        database = new DatabaseService(config);
        const verifier = configuredAppleStoreVerifier(config);
        const commerce = new CommerceService(
          config,
          database,
          verifier,
          new PersistentCommerceBenefitsService(),
        );
        const appleServer = new AppleStoreServerApiService(
          config,
          configuredAppleStoreServerApiClientFactory(config),
          verifier,
        );
        const reconciliation = new AppleServerReconciliationService(
          appleServer,
          commerce,
          database,
        );
        return reconciliation.reconcileTransactionHistory(command);
      },
    });
  } finally {
    await database?.onModuleDestroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : 'apple_iap_server_cli_failed';
    console.error(code);
    process.exitCode = 1;
  });
}
