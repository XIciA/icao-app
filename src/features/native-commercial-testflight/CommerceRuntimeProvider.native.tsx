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
  CommerceRuntimeOffering,
  CommerceRuntimePhase,
  CommerceRuntimeValue,
} from './commerce-runtime-types';
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

function failureMessage(failure: CommerceFailureResult) {
  switch (failure.state) {
    case 'cancelled':
      return '已取消购买，未产生扣款。';
    case 'pending':
      return '购买正在等待 App Store 确认，完成后会自动到账。';
    case 'unavailable':
      return failure.code === 'commerce_store_connection_failed'
        ? '暂时无法连接 App Store，请检查网络后重试。'
        : '当前设备暂不支持 App Store 购买。';
    default:
      if (failure.code === 'commerce_purchase_busy') return '已有购买正在处理中，请稍候。';
      if (failure.code === 'commerce_restore_failed') return '恢复购买失败，请检查网络后重试。';
      if (failure.charged === 'unknown') return '购买结果尚未确认，App 会自动继续核对，请勿重复购买。';
      return '购买暂时未完成，请稍后重试。';
  }
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
  const [message, setMessage] = useState<string>();
  const controllerRef = useRef<Controller | undefined>(undefined);
  const generationRef = useRef(0);
  const observedEnvironmentRef = useRef<'sandbox' | 'production' | undefined>(undefined);
  const workingRef = useRef(false);
  const uncertainPurchaseRef = useRef<PersistedUncertainPurchase | undefined>(undefined);
  const uncertainStorageBlockedRef = useRef(false);

  const refreshEntitlement = useCallback(async (controller: Controller, generation: number) => {
    if (generation !== generationRef.current || controllerRef.current !== controller) return;
    const response = await apiRequest<CommerceEntitlementsResponse>('/v1/commerce/entitlements/current');
    if (generation !== generationRef.current || controllerRef.current !== controller) return;
    const environment = observedEnvironmentRef.current ?? 'production';
    setNativeCommerceEnvironment(environment);
    setEntitlementEnvironment(environment);
    setEntitlement(response[environment]);
  }, []);

  const reconcileAndRefresh = useCallback(async (controller: Controller, generation: number) => {
    if (generation !== generationRef.current || controllerRef.current !== controller) {
      return { ok: false, state: 'failed', code: 'commerce_account_changed', charged: 'no' } as const;
    }
    const report = await controller.coordinator.start();
    if (generation !== generationRef.current || controllerRef.current !== controller) return report;
    await refreshEntitlement(controller, generation);
    return report;
  }, [refreshEntitlement]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    observedEnvironmentRef.current = undefined;
    setNativeCommerceEnvironment('production');
    workingRef.current = false;
    uncertainPurchaseRef.current = undefined;
    uncertainStorageBlockedRef.current = false;
    void activateQuestionBankContentAccount(accountId).catch(() => undefined);
    setOfferings([]);
    setEntitlement(undefined);
    setEntitlementEnvironment(undefined);
    setMessage(undefined);
    if (Platform.OS !== 'ios' || !accountId) {
      controllerRef.current = undefined;
      setPhase('unavailable');
      return;
    }

    const provider = createAppleStoreKitCommerceProvider();
    const consumer: CommerceTransactionConsumer = {
      consume: async (transaction) => {
        if (generation !== generationRef.current) return { state: 'deferred' } as const;
        const environment = verifiedEnvironment(transaction);
        if (!environment) return { state: 'deferred' } as const;
        try {
          const verified = await apiRequest<VerifyAppleTransactionResponse>(
            '/v1/commerce/apple/transactions/verify',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ signedTransaction: transaction.signedTransaction }),
            },
          );
          if (generation !== generationRef.current) return { state: 'deferred' } as const;
          if (
            verified.transactionId !== transaction.transactionReference
            || verified.entitlement.environment !== environment
          ) return { state: 'deferred' } as const;
          if (!await confirmNativeCommerceEnvironment(accountId, environment)) {
            return { state: 'deferred' } as const;
          }
          if (generation !== generationRef.current) return { state: 'deferred' } as const;
          observedEnvironmentRef.current = environment;
          if (generation === generationRef.current) {
            setEntitlementEnvironment(environment);
            setEntitlement(verified.entitlement);
          }
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
    setPhase('loading');

    void (async () => {
      const distributionEnvironment = detectNativeDistributionEnvironment();
      const rememberedEnvironment = await activateNativeCommerceEnvironment(
        accountId,
        distributionEnvironment,
      );
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      observedEnvironmentRef.current = rememberedEnvironment;
      setEntitlementEnvironment(rememberedEnvironment);
      const [serverCatalog, storeCatalog, restoredUncertainResult] = await Promise.all([
        apiRequest<CommerceProductCatalogResponse>('/v1/commerce/catalog'),
        provider.listOfferings(),
        loadUncertainPurchase(accountId),
      ]);
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      if (restoredUncertainResult.state === 'invalid') {
        uncertainStorageBlockedRef.current = true;
      }
      const restoredUncertain = restoredUncertainResult.state === 'pending'
        ? restoredUncertainResult.purchase
        : undefined;
      uncertainPurchaseRef.current = restoredUncertain;
      if (!storeCatalog.ok) throw new Error(storeCatalog.code);
      const nextOfferings = validatedOfferings(serverCatalog, storeCatalog.value.offerings);
      const report = await reconcileAndRefresh(controller, generation);
      if (generation !== generationRef.current) return;
      if (!report.ok) throw new Error(report.code);
      setOfferings(nextOfferings);
      if (uncertainStorageBlockedRef.current) {
        setMessage('本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。');
        setPhase('pending');
        return;
      }
      if (restoredUncertain && !reportConfirmsPurchase(report.value, restoredUncertain)) {
        setMessage('上一笔购买仍在等待 App Store 或服务器确认，请勿重复下单。');
        setPhase('pending');
        return;
      }
      if (restoredUncertain) {
        await clearUncertainPurchase(accountId);
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
      }
      setMessage(report.value.deferred > 0 ? '有购买正在后台核对，权益到账后会自动更新。' : undefined);
      setPhase('ready');
    })().catch(() => {
      if (generation !== generationRef.current) return;
      if (uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
        setMessage('上一笔购买仍在核对，请勿重复下单。');
        setPhase('pending');
      } else {
        setMessage('暂时无法连接 App Store 或读取会员信息，请稍后重试。');
        setPhase('error');
      }
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || generation !== generationRef.current || workingRef.current) return;
      void reconcileAndRefresh(controller, generation).then(async (report) => {
        if (!report.ok || generation !== generationRef.current) return;
        const uncertain = uncertainPurchaseRef.current;
        if (!uncertain || !reportConfirmsPurchase(report.value, uncertain)) return;
        await clearUncertainPurchase(controller.accountId);
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
        setMessage('购买已完成核对，会员权益已更新。');
        setPhase('ready');
      }).catch(() => undefined);
    });
    return () => {
      appState.remove();
      if (generationRef.current === generation) generationRef.current += 1;
      if (controllerRef.current === controller) controllerRef.current = undefined;
      void controller.coordinator.dispose();
    };
  }, [accountId, reconcileAndRefresh]);

  useEffect(() => {
    if (phase !== 'pending') return;
    const timer = setInterval(() => {
      const controller = controllerRef.current;
      const uncertain = uncertainPurchaseRef.current;
      const generation = generationRef.current;
      if (!controller || !uncertain || workingRef.current) return;
      workingRef.current = true;
      void reconcileAndRefresh(controller, generation).then(async (report) => {
        if (
          !report.ok
          || generation !== generationRef.current
          || controllerRef.current !== controller
          || !reportConfirmsPurchase(report.value, uncertain)
        ) return;
        await clearUncertainPurchase(controller.accountId);
        if (generation !== generationRef.current || controllerRef.current !== controller) return;
        uncertainPurchaseRef.current = undefined;
        setMessage('购买已完成核对，会员权益已更新。');
        setPhase('ready');
      }).catch(() => undefined).finally(() => {
        if (generation === generationRef.current && controllerRef.current === controller) {
          workingRef.current = false;
        }
      });
    }, 5_000);
    return () => clearInterval(timer);
  }, [phase, reconcileAndRefresh]);

  const refresh = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || workingRef.current) return;
    const generation = generationRef.current;
    workingRef.current = true;
    setMessage(undefined);
    try {
      const report = await reconcileAndRefresh(controller, generation);
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      if (!report.ok) throw new Error(report.code);
      if (uncertainStorageBlockedRef.current) {
        setMessage('本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。');
        setPhase('pending');
        return;
      }
      const uncertain = uncertainPurchaseRef.current;
      if (uncertain && !reportConfirmsPurchase(report.value, uncertain)) {
        setMessage('购买仍在等待 App Store 或服务器确认，请勿重复下单。');
        setPhase('pending');
        return;
      }
      if (uncertain) await clearUncertainPurchase(controller.accountId);
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      uncertainPurchaseRef.current = undefined;
      setMessage(report.value.deferred > 0 ? '仍有购买等待网络核对，请稍后再试。' : '会员与点数状态已更新。');
      setPhase('ready');
    } catch {
      if (generation !== generationRef.current || controllerRef.current !== controller) return;
      if (uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
        setMessage('暂时无法完成购买核对，请勿重复下单。');
        setPhase('pending');
      } else {
        setMessage('状态更新失败，请检查网络后重试。');
        setPhase('error');
      }
    } finally {
      if (generation === generationRef.current && controllerRef.current === controller) {
        workingRef.current = false;
      }
    }
  }, [reconcileAndRefresh]);

  const purchase = useCallback(async (
    productKey: CommerceProductOffering['productKey'],
  ): Promise<CommerceActionResult> => {
    const controller = controllerRef.current;
    if (!controller || workingRef.current) return { ok: false, message: '购买功能正在准备或已有操作进行中。' };
    if (phase !== 'ready' || uncertainStorageBlockedRef.current || uncertainPurchaseRef.current) {
      return { ok: false, message: '上一笔购买仍在核对，请勿重复下单。' };
    }
    const generation = generationRef.current;
    let purchaseDispatched = false;
    workingRef.current = true;
    setPhase('purchasing');
    setMessage(undefined);
    try {
      const baseline = await reconcileAndRefresh(controller, generation);
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
      await persistUncertainPurchase(uncertain);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        await clearUncertainPurchase(controller.accountId).catch(() => undefined);
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = uncertain;
      purchaseDispatched = true;
      const purchaseResult = await controller.provider.purchase({
        offeringKey: productKey,
        applicationAccountToken: controller.accountId,
      });
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!purchaseResult.ok) {
        const result = { ok: false, message: failureMessage(purchaseResult) };
        setMessage(result.message);
        if (purchaseResult.state === 'pending' || purchaseResult.charged === 'unknown') {
          setPhase('pending');
        } else {
          await clearUncertainPurchase(controller.accountId);
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
      await persistUncertainPurchase(exactUncertain);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      uncertainPurchaseRef.current = exactUncertain;
      const report = await controller.coordinator.drainObservedTransactions();
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      await refreshEntitlement(controller, generation);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!report.ok || report.value.serverVerified === 0) {
        const result = { ok: false, message: 'App Store 已返回购买结果，服务器正在继续核对，请勿重复购买。' };
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      if (!reportConfirmsPurchase(report.value, exactUncertain)) {
        const result = { ok: false, message: 'App Store 已返回购买结果，本次交易正在继续核对，请勿重复购买。' };
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      await clearUncertainPurchase(controller.accountId);
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
      setPhase('ready');
      return result;
    } catch {
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!purchaseDispatched) {
        const result = { ok: false, message: '购买前状态核对失败，未发起扣款，请稍后重试。' };
        setMessage(result.message);
        setPhase('error');
        return result;
      }
      const result = { ok: false, message: '购买结果尚未确认，App 会自动继续核对，请勿重复购买。' };
      setMessage(result.message);
      setPhase('pending');
      return result;
    } finally {
      if (generation === generationRef.current && controllerRef.current === controller) {
        workingRef.current = false;
      }
    }
  }, [phase, reconcileAndRefresh, refreshEntitlement]);

  const restorePurchases = useCallback(async (): Promise<CommerceActionResult> => {
    const controller = controllerRef.current;
    if (!controller || workingRef.current) return { ok: false, message: '恢复购买正在准备或已有操作进行中。' };
    const generation = generationRef.current;
    workingRef.current = true;
    setPhase('restoring');
    setMessage(undefined);
    try {
      const report = await controller.coordinator.restorePurchasesFromUserAction();
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      await refreshEntitlement(controller, generation);
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      if (!report.ok) {
        const result = { ok: false, message: failureMessage(report) };
        setMessage(result.message);
        setPhase(uncertainStorageBlockedRef.current || uncertainPurchaseRef.current ? 'pending' : 'ready');
        return result;
      }
      if (uncertainStorageBlockedRef.current) {
        const result = { ok: false, message: '本机上一笔购买记录无法安全核对，请勿重复下单并联系支持。' };
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      const uncertain = uncertainPurchaseRef.current;
      if (uncertain && !reportConfirmsPurchase(report.value, uncertain)) {
        const result = { ok: false, message: '已读取购买记录，未决交易仍在核对，请勿重复下单。' };
        setMessage(result.message);
        setPhase('pending');
        return result;
      }
      if (uncertain) await clearUncertainPurchase(controller.accountId);
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
      setPhase('ready');
      return result;
    } catch {
      if (generation !== generationRef.current || controllerRef.current !== controller) {
        return ACCOUNT_CHANGED_RESULT;
      }
      const result = {
        ok: false,
        message: uncertainStorageBlockedRef.current || uncertainPurchaseRef.current
          ? '恢复失败，未决交易仍在核对，请勿重复下单。'
          : '恢复购买失败，请检查网络后重试。',
      };
      setMessage(result.message);
      setPhase(uncertainStorageBlockedRef.current || uncertainPurchaseRef.current ? 'pending' : 'error');
      return result;
    } finally {
      if (generation === generationRef.current && controllerRef.current === controller) {
        workingRef.current = false;
      }
    }
  }, [refreshEntitlement]);

  const value = useMemo<CommerceRuntimeValue>(() => ({
    supported: Platform.OS === 'ios' && Boolean(accountId),
    phase,
    offerings,
    entitlement,
    entitlementEnvironment,
    message,
    purchase,
    refresh,
    restorePurchases,
  }), [accountId, entitlement, entitlementEnvironment, message, offerings, phase, purchase, refresh, restorePurchases]);

  return <CommerceRuntimeContext.Provider value={value}>{children}</CommerceRuntimeContext.Provider>;
}

export function useCommerceRuntime() {
  const value = useContext(CommerceRuntimeContext);
  if (!value) throw new Error('useCommerceRuntime must be used inside CommerceRuntimeProvider');
  return value;
}
