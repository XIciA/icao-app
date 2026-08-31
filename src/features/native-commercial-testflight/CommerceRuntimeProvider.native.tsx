import type {
  CommerceEntitlementsResponse,
  CommerceProductCatalogResponse,
  CommerceProductOffering,
  VerifyAppleTransactionResponse,
} from '@icao/contracts';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { activateQuestionBankContentAccount } from '@/features/question-bank/data/member-content-cache';
import { apiRequest } from '@/platform/api-client';

import { createAppleStoreKitCommerceProvider } from './apple-storekit-commerce-provider.native';
import type {
  CommerceFailureResult,
  CommerceOffering,
  CommerceTransaction,
  NativeCommerceProvider,
} from './commerce-provider.native';
import {
  NativeCommerceTransactionCoordinator,
  type CommerceTransactionCoordinationReport,
  type CommerceTransactionConsumer,
} from './commerce-transaction-coordinator.native';
import type {
  CommerceActionResult,
  CommerceEntitlementChange,
  CommerceEntitlementChangeReason,
  CommerceRuntimeOffering,
  CommerceRuntimeError,
  CommerceRuntimeOperation,
  CommerceRuntimePhase,
  CommerceRuntimeValue,
} from './commerce-runtime-types';
import {
  CommerceRuntimeOperationDeadlineError,
  CommerceRuntimeOperationGate,
  type CommerceRuntimeOperationScope,
} from './commerce-runtime-operation.native';
import { publishCommerceEntitlementChange } from './commerce-entitlement-events';
import {
  clearUncertainPurchase,
  loadUncertainPurchase,
  persistUncertainPurchase,
  type PersistedUncertainPurchase,
} from './commerce-uncertain-purchase.native';
import { listMembershipProducts } from './membership-products.native';
import {
  activateNativeCommerceEnvironment,
  confirmNativeCommerceEnvironment,
  detectNativeDistributionEnvironment,
  setNativeCommerceEnvironment,
} from './commerce-environment';

type Controller = Readonly<{
  accountId: string;
  coordinator: NativeCommerceTransactionCoordinator;
  provider: NativeCommerceProvider;
}>;

const CommerceRuntimeContext = createContext<CommerceRuntimeValue | undefined>(undefined);
const COMMERCE_RUNTIME_OPERATION_DEADLINE_MS = 60_000;

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('commerce_operation_cancelled'));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new Error('commerce_operation_cancelled')));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function runtimeError(
  code: CommerceRuntimeError['code'],
  operation: CommerceRuntimeOperation,
  userMessage: string,
  options: Pick<CommerceRuntimeError, 'retryable' | 'chargeStatus'>,
): CommerceRuntimeError {
  return { code, operation, userMessage, ...options };
}

function uncertainPurchaseError(
  operation: CommerceRuntimeOperation,
  userMessage: string,
): CommerceRuntimeError {
  return runtimeError('uncertain-purchase', operation, userMessage, {
    retryable: true,
    chargeStatus: 'unknown',
  });
}

function failureRuntimeError(
  failure: CommerceFailureResult,
  operation: CommerceRuntimeOperation,
): CommerceRuntimeError {
  if (failure.state === 'cancelled') {
    return runtimeError('purchase-cancelled', operation, '已取消购买，未产生扣款。', {
      retryable: true,
      chargeStatus: 'cancelled',
    });
  }
  if (failure.state === 'pending') {
    return runtimeError(
      'purchase-pending',
      operation,
      '购买正在等待 App Store 确认，完成后会自动到账。',
      { retryable: false, chargeStatus: 'pending' },
    );
  }
  if (failure.code === 'commerce_operation_busy') {
    return runtimeError('operation-busy', operation, '已有购买或核对操作正在进行，请稍候。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_operation_cancelled') {
    return runtimeError('operation-cancelled', operation, '账号或购买环境已变化，请重新查看当前状态。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_reconciliation_timed_out') {
    return runtimeError('restore-timed-out', operation, '核对购买记录超时，请稍后重试。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_reconciliation_budget_exceeded') {
    return runtimeError('restore-failed', operation, '购买记录较多，暂时无法完成核对，请联系支持。', {
      retryable: false,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_restore_failed') {
    return runtimeError('restore-failed', operation, '恢复购买失败，请检查网络后重试。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_store_connection_failed') {
    return runtimeError('catalog-unavailable', operation, '暂时无法连接 App Store，请检查网络后重试。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.code === 'commerce_purchase_busy') {
    return runtimeError('operation-busy', operation, '已有购买正在处理中，请稍候。', {
      retryable: true,
      chargeStatus: 'not-applicable',
    });
  }
  if (failure.charged === 'unknown') {
    return runtimeError(
      'purchase-unconfirmed',
      operation,
      '购买结果尚未确认，App 会自动继续核对，请勿重复购买。',
      { retryable: false, chargeStatus: 'unknown' },
    );
  }
  return runtimeError('purchase-failed', operation, '购买暂时未完成，请稍后重试。', {
    retryable: failure.retryable,
    chargeStatus: 'not-started',
  });
}

function failureMessage(failure: CommerceFailureResult) {
  return failureRuntimeError(failure, 'purchase').userMessage;
}

function validatedOfferings(
  serverCatalog: CommerceProductCatalogResponse,
  storeOfferings: readonly CommerceOffering[],
): readonly CommerceRuntimeOffering[] {
  if (serverCatalog.priceSource !== 'storekit') throw new Error('commerce_catalog_price_source_invalid');
  const localProducts = listMembershipProducts();
  if (
    serverCatalog.products.length !== localProducts.length
    || storeOfferings.length !== localProducts.length
  ) throw new Error('commerce_catalog_incomplete');
  const serverByKey = new Map(serverCatalog.products.map((product) => [product.productKey, product]));
  const storeByKey = new Map(storeOfferings.map((offering) => [offering.key, offering]));
  return localProducts.map((local) => {
    const server = serverByKey.get(local.key);
    const store = storeByKey.get(local.key);
    if (
      !server
      || !store
      || server.storeProductId !== local.appleProductId
      || server.durationDays !== local.durationDays
      || server.autoRenews !== false
      || server.recommended !== local.recommended
      || store.durationDays !== local.durationDays
      || store.recommended !== local.recommended
      || !store.localizedPrice.trim()
      || !store.currencyCode.trim()
    ) throw new Error('commerce_catalog_mismatch');
    return {
      productKey: local.key,
      displayName: server.displayName,
      durationDays: local.durationDays,
      recommended: local.recommended,
      localizedPrice: store.localizedPrice,
      currencyCode: store.currencyCode,
    };
  });
}

function verifiedEnvironment(transaction: CommerceTransaction) {
  return transaction.environment === 'sandbox' || transaction.environment === 'production'
    ? transaction.environment
    : undefined;
}

const ACCOUNT_CHANGED_RESULT: CommerceActionResult = {
  ok: false,
  message: '账号已切换，请在当前账号重新查看会员状态。',
  error: runtimeError(
    'account-changed',
    'reconciliation',
    '账号已切换，请在当前账号重新查看会员状态。',
    { retryable: true, chargeStatus: 'not-applicable' },
  ),
};

function reportConfirmsPurchase(
  report: CommerceTransactionCoordinationReport,
  uncertain: PersistedUncertainPurchase,
) {
  if (uncertain.transactionReference) {
    return report.serverVerifiedTransactions.some((transaction) => (
      transaction.transactionReference === uncertain.transactionReference
      && (!uncertain.environment || transaction.environment === uncertain.environment)
    ));
  }
  const baseline = new Set(uncertain.baselineTransactionReferences);
  return report.serverVerifiedTransactions.some((transaction) => (
    !baseline.has(transaction.transactionReference)
    && transaction.offeringKey === uncertain.offeringKey
    && Date.parse(transaction.purchasedAt) >= Date.parse(uncertain.startedAt)
  ));
}

export function CommerceRuntimeProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  // Commerce is an optional authenticated subsystem. It starts only after the
  // core account and learning-data ownership gate are ready, so an early
  // catalog request can never race a newly established auth session.
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  const [phase, setPhase] = useState<CommerceRuntimePhase>('unavailable');
  const [offerings, setOfferings] = useState<readonly CommerceRuntimeOffering[]>([]);
  const [entitlement, setEntitlement] = useState<CommerceRuntimeValue['entitlement']>();
  const [entitlementEnvironment, setEntitlementEnvironment] = useState<'sandbox' | 'production'>();
  const [entitlementChange, setEntitlementChange] = useState<CommerceEntitlementChange>();
  const [error, setError] = useState<CommerceRuntimeError>();
  const [message, setMessage] = useState<string>();
  const controllerRef = useRef<Controller | undefined>(undefined);
  const generationRef = useRef(0);
  const observedEnvironmentRef = useRef<'sandbox' | 'production' | undefined>(undefined);
  const operationGateRef = useRef(new CommerceRuntimeOperationGate());
  const catalogReadyRef = useRef(false);
  const entitlementRevisionRef = useRef(0);
  const entitlementChangeRef = useRef<CommerceEntitlementChange | undefined>(undefined);
  const uncertainPurchaseRef = useRef<PersistedUncertainPurchase | undefined>(undefined);
  const uncertainStorageBlockedRef = useRef(false);

  const publishEntitlement = useCallback((
    controller: Controller,
    generation: number,
    environment: 'sandbox' | 'production',
    snapshot: CommerceRuntimeValue['entitlement'],
    reason: CommerceEntitlementChangeReason,
  ) => {
    if (generation !== generationRef.current || controllerRef.current !== controller) return;
    const previous = entitlementChangeRef.current;
    const effectiveReason = previous && (
      previous.accountId !== controller.accountId || previous.environment !== environment
    ) ? (previous.accountId === controller.accountId ? 'environment-change' : 'account-change') : reason;
    const next: CommerceEntitlementChange = {
      accountId: controller.accountId,
      environment,
      revision: entitlementRevisionRef.current + 1,
      ...(snapshot ? { snapshot } : {}),
      reason: effectiveReason,
    };
    entitlementRevisionRef.current = next.revision;
    entitlementChangeRef.current = next;
    setNativeCommerceEnvironment(environment);
    setEntitlementEnvironment(environment);
    setEntitlement(snapshot);
    setEntitlementChange(next);
    publishCommerceEntitlementChange(next);
  }, []);

  const refreshEntitlement = useCallback(async (
    controller: Controller,
    generation: number,
    reason: CommerceEntitlementChangeReason,
    operation: CommerceRuntimeOperationScope,
  ) => {
    if (generation !== generationRef.current || controllerRef.current !== controller) return;
    const response = await operation.wait(
      apiRequest<CommerceEntitlementsResponse>(
        '/v1/commerce/entitlements/current',
        { signal: operation.signal },
      ),
    );
    if (generation !== generationRef.current || controllerRef.current !== controller) return;
    const environment = observedEnvironmentRef.current ?? 'production';
    publishEntitlement(controller, generation, environment, response[environment], reason);
  }, [publishEntitlement]);

  const reconcileAndRefresh = useCallback(async (
    controller: Controller,
    generation: number,
    reason: CommerceEntitlementChangeReason,
    operation: CommerceRuntimeOperationScope,
  ) => {
    if (generation !== generationRef.current || controllerRef.current !== controller) {
      return { ok: false, state: 'failed', code: 'commerce_account_changed', charged: 'no' } as const;
    }
    let report: Awaited<ReturnType<NativeCommerceTransactionCoordinator['start']>>;
    try {
      report = await operation.wait(controller.coordinator.start({ signal: operation.signal }));
    } finally {
      // Coordinator public timeouts do not cancel the underlying StoreKit call.
      // Keep this runtime operation occupied until that physical chain drains.
      operation.drain(controller.coordinator.whenIdle());
    }
    if (generation !== generationRef.current || controllerRef.current !== controller) return report;
    await refreshEntitlement(controller, generation, reason, operation);
    return report;
  }, [refreshEntitlement]);

  const reloadCatalog = useCallback(async (
    controller: Controller,
    generation: number,
    operation: CommerceRuntimeOperationScope,
  ) => {
    catalogReadyRef.current = false;
    if (generation === generationRef.current && controllerRef.current === controller) setOfferings([]);
    const [serverCatalog, storeCatalog] = await Promise.all([
      operation.wait(apiRequest<CommerceProductCatalogResponse>(
        '/v1/commerce/catalog',
        { signal: operation.signal },
      )),
      operation.wait(controller.provider.listOfferings()),
    ]);
    if (generation !== generationRef.current || controllerRef.current !== controller) {
      throw new Error('commerce_account_changed');
    }
    if (!storeCatalog.ok) throw new Error(storeCatalog.code);
    const nextOfferings = validatedOfferings(serverCatalog, storeCatalog.value.offerings);
    catalogReadyRef.current = true;
    setOfferings(nextOfferings);
    return nextOfferings;
  }, []);

  useEffect(() => {
    const operationGate = operationGateRef.current;
    operationGate.abortAndDetach();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    observedEnvironmentRef.current = undefined;
    setNativeCommerceEnvironment('production');
    catalogReadyRef.current = false;
    uncertainPurchaseRef.current = undefined;
    uncertainStorageBlockedRef.current = false;
    void activateQuestionBankContentAccount(accountId).catch(() => undefined);
    setOfferings([]);
    setEntitlement(undefined);
    setEntitlementEnvironment(undefined);
    setError(undefined);
    setMessage(undefined);
    if (Platform.OS !== 'ios' || !accountId) {
      const previous = entitlementChangeRef.current;
      if (previous) {
        const next: CommerceEntitlementChange = {
          accountId: previous.accountId,
          environment: previous.environment,
          revision: entitlementRevisionRef.current + 1,
          reason: 'account-change',
        };
        entitlementRevisionRef.current = next.revision;
        entitlementChangeRef.current = next;
        setEntitlementChange(next);
        publishCommerceEntitlementChange(next);
      }
      controllerRef.current = undefined;
      setPhase('unavailable');
      return;
    }

    const provider = createAppleStoreKitCommerceProvider();
    const consumer: CommerceTransactionConsumer = {
      consume: async (transaction, options) => {
        if (generation !== generationRef.current) return { state: 'deferred' } as const;
        const environment = verifiedEnvironment(transaction);
        if (!environment) return { state: 'deferred' } as const;
        try {
          const verified = await withAbortSignal(
            apiRequest<VerifyAppleTransactionResponse>(
              '/v1/commerce/apple/transactions/verify',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ signedTransaction: transaction.signedTransaction }),
                ...(options?.signal ? { signal: options.signal } : {}),
              },
            ),
            options?.signal,
          );
          if (options?.signal?.aborted || generation !== generationRef.current) {
            return { state: 'deferred' } as const;
          }
          if (
            verified.transactionId !== transaction.transactionReference
            || verified.entitlement.environment !== environment
          ) return { state: 'deferred' } as const;
          if (!await confirmNativeCommerceEnvironment(
            accountId,
            environment,
            { signal: options?.signal },
          )) {
            return { state: 'deferred' } as const;
          }
          if (options?.signal?.aborted || generation !== generationRef.current) {
            return { state: 'deferred' } as const;
          }
          observedEnvironmentRef.current = environment;
          const activeController = controllerRef.current;
          if (!activeController) return { state: 'deferred' } as const;
          publishEntitlement(
            activeController,
            generation,
            environment,
            verified.entitlement,
            'transaction-verification',
          );
          return {
            state: 'server-verified',
            transactionReference: transaction.transactionReference,
            signedTransaction: transaction.signedTransaction,
          } as const;
        } catch {
          return { state: 'deferred' } as const;
        }
      },
    };
    const controller: Controller = {
      accountId,
      provider,
      coordinator: new NativeCommerceTransactionCoordinator(provider, consumer),
    };
    controllerRef.current = controller;
    publishEntitlement(controller, generation, 'production', undefined, 'account-change');
    const startupOperation = operationGate.begin({
      deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
    });
    if (!startupOperation) throw new Error('commerce_runtime_startup_operation_busy');
    setPhase('loading');

    void (async () => {
      const distributionEnvironment = detectNativeDistributionEnvironment();
      const [rememberedEnvironment, restoredUncertainResult] = await Promise.all([
        startupOperation.wait(activateNativeCommerceEnvironment(accountId, distributionEnvironment)),
        startupOperation.wait(loadUncertainPurchase(accountId)),
        reloadCatalog(controller, generation, startupOperation),
      ]);
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      observedEnvironmentRef.current = rememberedEnvironment;
      publishEntitlement(
        controller,
        generation,
        rememberedEnvironment,
        undefined,
        'environment-change',
      );
      if (restoredUncertainResult.state === 'invalid') {
        uncertainStorageBlockedRef.current = true;
      }
      const restoredUncertain = restoredUncertainResult.state === 'pending'
        ? restoredUncertainResult.purchase
        : undefined;
      uncertainPurchaseRef.current = restoredUncertain;
      const report = await reconcileAndRefresh(
        controller,
        generation,
        'startup-reconciliation',
        startupOperation,
      );
      if (generation !== generationRef.current) return;
      if (!report.ok) throw new Error(report.code);
      if (uncertainStorageBlockedRef.current) {
        const nextError = uncertainPurchaseError(
          'reconciliation',
          '本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
        return;
      }
      if (restoredUncertain && !reportConfirmsPurchase(report.value, restoredUncertain)) {
        const nextError = uncertainPurchaseError(
          'reconciliation',
          '上一笔购买仍在等待 App Store 或服务器确认，请勿重复下单。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
        return;
      }
      if (restoredUncertain) {
        await startupOperation.wait(clearUncertainPurchase(accountId));
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
      }
      setMessage(report.value.deferred > 0 ? '有购买正在后台核对，权益到账后会自动更新。' : undefined);
      setError(undefined);
      setPhase('ready');
    })().catch((caught: unknown) => {
      if (generation !== generationRef.current) return;
      if (uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
        const nextError = uncertainPurchaseError(
          'reconciliation',
          '上一笔购买仍在核对，请勿重复下单。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
      } else {
        const internalCode = caught instanceof Error ? caught.message : '';
        const invalidCatalog = [
          'commerce_catalog_incomplete',
          'commerce_catalog_invalid',
          'commerce_catalog_mismatch',
          'commerce_catalog_price_source_invalid',
        ].includes(internalCode);
        const nextError = runtimeError(
          invalidCatalog ? 'catalog-invalid' : 'catalog-unavailable',
          'catalog',
          invalidCatalog
            ? 'App Store 商品信息尚未完全同步，请稍后再查看。'
            : '暂时无法连接 App Store 或读取会员信息，请稍后重试。',
          { retryable: !invalidCatalog, chargeStatus: 'not-applicable' },
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('error');
      }
    }).finally(() => startupOperation.finish());

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || generation !== generationRef.current) return;
      const operation = operationGate.begin({
        deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
      });
      if (!operation) return;
      setPhase('reconciling');
      setError(undefined);
      void (async () => {
        if (!catalogReadyRef.current) await reloadCatalog(controller, generation, operation);
        const report = await reconcileAndRefresh(
          controller,
          generation,
          'foreground-reconciliation',
          operation,
        );
        if (!report.ok || generation !== generationRef.current) throw new Error('reconciliation_failed');
        const uncertain = uncertainPurchaseRef.current;
        if (!uncertain) {
          setPhase('ready');
          return;
        }
        if (!reportConfirmsPurchase(report.value, uncertain)) {
          const nextError = uncertainPurchaseError(
            'reconciliation',
            '购买仍在等待 App Store 或服务器确认，请勿重复下单。',
          );
          setError(nextError);
          setMessage(nextError.userMessage);
          setPhase('pending');
          return;
        }
        await operation.wait(clearUncertainPurchase(controller.accountId));
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
        setMessage('购买已完成核对，会员权益已更新。');
        setError(undefined);
        setPhase('ready');
      })().catch(() => {
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        const nextError = runtimeError(
          'refresh-failed',
          'reconciliation',
          '自动核对暂时失败，可稍后手动刷新。',
          { retryable: true, chargeStatus: 'not-applicable' },
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase(uncertainPurchaseRef.current ? 'pending' : 'error');
      }).finally(() => operation.finish());
    });
    return () => {
      appState.remove();
      operationGate.abortAndDetach();
      if (generationRef.current === generation) generationRef.current += 1;
      if (controllerRef.current === controller) controllerRef.current = undefined;
      void controller.coordinator.dispose();
    };
  }, [accountId, publishEntitlement, reconcileAndRefresh, reloadCatalog]);

  useEffect(() => {
    if (phase !== 'pending') return;
    const timer = setInterval(() => {
      const controller = controllerRef.current;
      const uncertain = uncertainPurchaseRef.current;
      const generation = generationRef.current;
      if (!controller || !uncertain) return;
      const operation = operationGateRef.current.begin({
        deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
      });
      if (!operation) return;
      void reconcileAndRefresh(
        controller,
        generation,
        'pending-reconciliation',
        operation,
      ).then(async (report) => {
        if (
          !report.ok
          || generation !== generationRef.current
          || controllerRef.current !== controller
          || !reportConfirmsPurchase(report.value, uncertain)
        ) return;
        await operation.wait(clearUncertainPurchase(controller.accountId));
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
        setMessage('购买已完成核对，会员权益已更新。');
        setError(undefined);
        setPhase('ready');
      }).catch(() => undefined).finally(() => operation.finish());
    }, 5_000);
    return () => clearInterval(timer);
  }, [phase, reconcileAndRefresh]);

  const refresh = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    const operation = operationGateRef.current.begin({
      deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
    });
    if (!operation) {
      const nextError = runtimeError(
        'operation-busy',
        'refresh',
        '已有购买或核对操作仍在完成，请稍候。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      setError(nextError);
      setMessage(nextError.userMessage);
      return;
    }
    const generation = generationRef.current;
    setPhase('reconciling');
    setError(undefined);
    setMessage(undefined);
    try {
      await reloadCatalog(controller, generation, operation);
      const report = await reconcileAndRefresh(
        controller,
        generation,
        'manual-refresh',
        operation,
      );
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      if (!report.ok) throw new Error(report.code);
      if (uncertainStorageBlockedRef.current) {
        const nextError = uncertainPurchaseError(
          'refresh',
          '本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
        return;
      }
      const uncertain = uncertainPurchaseRef.current;
      if (uncertain && !reportConfirmsPurchase(report.value, uncertain)) {
        const nextError = uncertainPurchaseError(
          'refresh',
          '购买仍在等待 App Store 或服务器确认，请勿重复下单。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
        return;
      }
      if (uncertain) await operation.wait(clearUncertainPurchase(controller.accountId));
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      uncertainPurchaseRef.current = undefined;
      setMessage(report.value.deferred > 0 ? '仍有购买等待网络核对，请稍后再试。' : '会员与点数状态已更新。');
      setError(undefined);
      setPhase('ready');
    } catch {
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      if (uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
        const nextError = uncertainPurchaseError(
          'refresh',
          '暂时无法完成购买核对，请勿重复下单。',
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('pending');
      } else {
        const nextError = runtimeError(
          'refresh-failed',
          'refresh',
          '状态更新失败，请检查网络后重试。',
          { retryable: true, chargeStatus: 'not-applicable' },
        );
        setError(nextError);
        setMessage(nextError.userMessage);
        setPhase('error');
      }
    } finally {
      operation.finish();
    }
  }, [reconcileAndRefresh, reloadCatalog]);

  const purchase = useCallback(async (
    productKey: CommerceProductOffering['productKey'],
  ): Promise<CommerceActionResult> => {
    const controller = controllerRef.current;
    if (!controller) {
      const nextError = runtimeError(
        'operation-busy',
        'purchase',
        '购买功能正在准备或已有操作进行中。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    if (uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
      const nextError = uncertainPurchaseError(
        'purchase',
        '上一笔购买仍在核对，请勿重复下单。',
      );
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    if (phase !== 'ready') {
      const nextError = runtimeError(
        'operation-busy',
        'purchase',
        '购买功能正在准备或已有操作进行中。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    const operation = operationGateRef.current.begin({
      deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
    });
    if (!operation) {
      const nextError = runtimeError(
        'operation-busy',
        'purchase',
        '上一项购买或核对操作仍在完成，请稍候。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      setError(nextError);
      setMessage(nextError.userMessage);
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    const generation = generationRef.current;
    let purchaseDispatched = false;
    setPhase('purchasing');
    setError(undefined);
    setMessage(undefined);
    try {
      const baseline = await reconcileAndRefresh(controller, generation, 'purchase', operation);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!baseline.ok) throw new Error(baseline.code);
      const uncertain: PersistedUncertainPurchase = {
        accountId: controller.accountId,
        offeringKey: productKey,
        startedAt: new Date().toISOString(),
        baselineTransactionReferences: baseline.value.observedReferences,
      };
      const baselinePersist = persistUncertainPurchase(uncertain);
      try {
        await operation.wait(baselinePersist);
      } catch (caught: unknown) {
        // A late baseline marker must not survive when StoreKit was never
        // dispatched. Keep the operation locked through compensating cleanup.
        operation.drain(baselinePersist.then(
          () => clearUncertainPurchase(controller.accountId),
          () => undefined,
        ));
        throw caught;
      }
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        operation.drain(clearUncertainPurchase(controller.accountId).catch(() => undefined));
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = uncertain;
      purchaseDispatched = true;
      const purchaseResult = await operation.wait(controller.provider.purchase({
        offeringKey: productKey,
        applicationAccountToken: controller.accountId,
      }));
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!purchaseResult.ok) {
        const nextError = failureRuntimeError(purchaseResult, 'purchase');
        const result = { ok: false, message: failureMessage(purchaseResult), error: nextError };
        setError(nextError);
        setMessage(result.message);
        if (purchaseResult.state === 'pending' || purchaseResult.charged === 'unknown') {
          setPhase('pending');
        } else {
          await operation.wait(clearUncertainPurchase(controller.accountId));
          if (generation !== generationRef.current || controllerRef.current !== controller) {
            return ACCOUNT_CHANGED_RESULT;
          }
          uncertainPurchaseRef.current = undefined;
          setPhase('ready');
        }
        return result;
      }
      const transactionReference = purchaseResult.value.transaction.transactionReference;
      const exactUncertain: PersistedUncertainPurchase = {
        ...uncertain,
        transactionReference,
        environment: verifiedEnvironment(purchaseResult.value.transaction),
      };
      await operation.wait(persistUncertainPurchase(exactUncertain));
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = exactUncertain;
      let report: Awaited<ReturnType<NativeCommerceTransactionCoordinator['drainObservedTransactions']>>;
      try {
        report = await operation.wait(controller.coordinator.drainObservedTransactions({
          signal: operation.signal,
        }));
      } finally {
        operation.drain(controller.coordinator.whenIdle());
      }
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      await refreshEntitlement(controller, generation, 'purchase', operation);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!report.ok || report.value.serverVerified === 0) {
        const nextError = uncertainPurchaseError(
          'purchase',
          'App Store 已返回购买结果，服务器正在继续核对，请勿重复购买。',
        );
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      if (!reportConfirmsPurchase(report.value, exactUncertain)) {
        const nextError = uncertainPurchaseError(
          'purchase',
          'App Store 已返回购买结果，本次交易正在继续核对，请勿重复购买。',
        );
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      await operation.wait(clearUncertainPurchase(controller.accountId));
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = undefined;
      const result = {
        ok: true,
        message: report.value.finishedReferences.includes(transactionReference)
          ? '购买成功，会员权益已到账。'
          : '会员权益已到账，App Store 确认将在后台自动完成。',
      };
      setMessage(result.message);
      setError(undefined);
      setPhase('ready');
      return result;
    } catch (caught: unknown) {
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!purchaseDispatched) {
        const timedOut = caught instanceof CommerceRuntimeOperationDeadlineError;
        const nextError = runtimeError(
          'purchase-failed',
          'purchase',
          timedOut
            ? '购买前准备等待超时，未发起扣款，请稍后重试。'
            : '购买前状态核对失败，未发起扣款，请稍后重试。',
          { retryable: true, chargeStatus: 'not-started' },
        );
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase('error');
        return result;
      }
      const nextError = runtimeError(
        'purchase-unconfirmed',
        'purchase',
        '购买结果尚未确认，App 会自动继续核对，请勿重复购买。',
        { retryable: false, chargeStatus: 'unknown' },
      );
      const result = { ok: false, message: nextError.userMessage, error: nextError };
      setError(nextError);
      setMessage(result.message);
      setPhase('pending');
      return result;
    } finally {
      operation.finish();
    }
  }, [phase, reconcileAndRefresh, refreshEntitlement]);

  const restorePurchases = useCallback(async (): Promise<CommerceActionResult> => {
    const controller = controllerRef.current;
    if (
      !controller
      || !(['ready', 'pending', 'error'] as CommerceRuntimePhase[]).includes(phase)
    ) {
      const nextError = runtimeError(
        'operation-busy',
        'restore',
        '恢复购买正在准备或已有操作进行中。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    const operation = operationGateRef.current.begin({
      deadlineMs: COMMERCE_RUNTIME_OPERATION_DEADLINE_MS,
    });
    if (!operation) {
      const nextError = runtimeError(
        'operation-busy',
        'restore',
        '上一项购买或核对操作仍在完成，请稍候。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      setError(nextError);
      setMessage(nextError.userMessage);
      return { ok: false, message: nextError.userMessage, error: nextError };
    }
    const generation = generationRef.current;
    setPhase('restoring');
    setError(undefined);
    setMessage(undefined);
    try {
      let report: Awaited<ReturnType<NativeCommerceTransactionCoordinator['restorePurchasesFromUserAction']>>;
      try {
        report = await operation.wait(controller.coordinator.restorePurchasesFromUserAction({
          signal: operation.signal,
        }));
      } finally {
        operation.drain(controller.coordinator.whenIdle());
      }
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!report.ok) {
        const nextError = failureRuntimeError(report, 'restore');
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase(uncertainStorageBlockedRef.current || uncertainPurchaseRef.current ? 'pending' : 'error');
        return result;
      }
      await refreshEntitlement(
        controller,
        generation,
        'restore',
        operation,
      );
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (uncertainStorageBlockedRef.current) {
        const nextError = uncertainPurchaseError(
          'restore',
          '本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。',
        );
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      const uncertain = uncertainPurchaseRef.current;
      if (uncertain && !reportConfirmsPurchase(report.value, uncertain)) {
        const nextError = uncertainPurchaseError(
          'restore',
          '已读取购买记录，未决交易仍在核对，请勿重复下单。',
        );
        const result = { ok: false, message: nextError.userMessage, error: nextError };
        setError(nextError);
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      if (uncertain) await operation.wait(clearUncertainPurchase(controller.accountId));
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = undefined;
      const result = {
        ok: true,
        message: report.value.deferred > 0
          ? '已读取购买记录，部分交易仍在后台核对。'
          : '购买记录与会员权益已恢复。',
      };
      setMessage(result.message);
      setError(undefined);
      setPhase('ready');
      return result;
    } catch (caught: unknown) {
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      const nextError = runtimeError(
        caught instanceof CommerceRuntimeOperationDeadlineError ? 'restore-timed-out' : 'restore-failed',
        'restore',
        uncertainStorageBlockedRef.current || uncertainPurchaseRef.current
          ? '恢复失败，未决交易仍在核对，请勿重复下单。'
          : caught instanceof CommerceRuntimeOperationDeadlineError
            ? '恢复购买等待超时，请稍后重试。'
            : '恢复购买失败，请检查网络后重试。',
        { retryable: true, chargeStatus: 'not-applicable' },
      );
      const result = { ok: false, message: nextError.userMessage, error: nextError };
      setError(nextError);
      setMessage(result.message);
      setPhase(uncertainStorageBlockedRef.current || uncertainPurchaseRef.current ? 'pending' : 'error');
      return result;
    } finally {
      operation.finish();
    }
  }, [phase, refreshEntitlement]);

  const value = useMemo<CommerceRuntimeValue>(() => ({
    supported: Platform.OS === 'ios' && Boolean(accountId),
    phase,
    offerings,
    entitlement,
    entitlementEnvironment,
    entitlementChange,
    error,
    message,
    purchase,
    refresh,
    restorePurchases,
  }), [accountId, entitlement, entitlementChange, entitlementEnvironment, error, message, offerings, phase, purchase, refresh, restorePurchases]);

  return <CommerceRuntimeContext.Provider value={value}>{children}</CommerceRuntimeContext.Provider>;
}

export function useCommerceRuntime() {
  const value = useContext(CommerceRuntimeContext);
  if (!value) throw new Error('useCommerceRuntime must be used inside CommerceRuntimeProvider');
  return value;
}
