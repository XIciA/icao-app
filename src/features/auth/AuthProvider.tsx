import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { AccountSummary, DeleteAccountResponse, StartPhoneOtpResponse } from '@icao/contracts';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { ApiClientError, apiRequest, setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';
import { archiveAndBindEmptyLearningSync, bindEmptyLearningSync, bindLearningSync, inspectLearningSyncBinding, runLearningSync, setLearningSyncActiveUser } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';

import { getAuthService, type AppSession, type PhoneBindingChallenge } from './auth-service';
import { clearDeletedAccountLocalData } from './account-deletion-local-cleanup';
import { clearPendingAccountDeletion, pendingAccountDeletionFor, readPendingAccountDeletion } from './account-deletion-state';
import type { PersistedPhoneOtpChallenge } from './phone-otp-challenge-store';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from './ui-acceptance-mode';

type AccountDeletionAuthentication = {
  password?: string;
  phoneOtp?: string;
};

const ACCOUNT_DELETION_AMBIGUITY_WINDOW_MS = 60_000;

type AuthContextValue = {
  configured: boolean;
  accountReady: boolean;
  accountRestoreUnavailable: boolean;
  canAccessApp: boolean;
  restoring: boolean;
  accountDeletionPending: boolean;
  account?: AccountSummary;
  session?: AppSession;
  passwordChangePurpose?: 'recovery' | 'setup';
  uiAcceptanceAvailable: boolean;
  uiAcceptanceMode: boolean;
  consumePendingPath(): string | undefined;
  enterUiAcceptanceMode(): void;
  exitUiAcceptanceMode(): void;
  rememberPendingPath(path: string): void;
  signInWithApple(): Promise<void>;
  signInWithWechat(): Promise<void>;
  requestPhoneOtp(phone: string): Promise<StartPhoneOtpResponse>;
  requestPasswordRecoveryOtp(phone: string): Promise<StartPhoneOtpResponse>;
  verifyPhoneOtp(challenge: PersistedPhoneOtpChallenge, token: string): Promise<AppSession>;
  signInWithPhonePassword(phone: string, password: string): Promise<void>;
  updatePassword(password: string, currentPassword?: string): Promise<void>;
  requestPhoneBindingOtp(phone: string): Promise<PhoneBindingChallenge>;
  resendPhoneBindingOtp(challenge: PhoneBindingChallenge): Promise<void>;
  verifyPhoneBindingOtp(challenge: PhoneBindingChallenge, token: string): Promise<void>;
  signIn(inviteCode: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  requestAccountDeletionPhoneOtp(): Promise<void>;
  retryAccountRestore(): Promise<void>;
  resumeAccountDeletion(): Promise<void>;
  deleteAccount(authentication?: AccountDeletionAuthentication): Promise<void>;
};

const unavailable = async () => { throw new Error('auth_not_configured'); };
const AuthContext = createContext<AuthContextValue>({
  configured: false,
  accountReady: false,
  accountRestoreUnavailable: false,
  accountDeletionPending: false,
  canAccessApp: false,
  restoring: false,
  account: undefined,
  uiAcceptanceAvailable: false,
  uiAcceptanceMode: false,
  consumePendingPath: () => undefined,
  enterUiAcceptanceMode: () => undefined,
  exitUiAcceptanceMode: () => undefined,
  rememberPendingPath: () => undefined,
  signInWithApple: unavailable,
  signInWithWechat: unavailable,
  requestPhoneOtp: unavailable,
  requestPasswordRecoveryOtp: unavailable,
  verifyPhoneOtp: unavailable,
  signInWithPhonePassword: unavailable,
  updatePassword: unavailable,
  requestPhoneBindingOtp: unavailable,
  resendPhoneBindingOtp: unavailable,
  verifyPhoneBindingOtp: unavailable,
  signIn: unavailable,
  signOut: unavailable,
  signOutAll: unavailable,
  requestAccountDeletionPhoneOtp: unavailable,
  retryAccountRestore: unavailable,
  resumeAccountDeletion: unavailable,
  deleteAccount: unavailable,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAuthService(), []);
  const [restoring, setRestoring] = useState(Boolean(service));
  const [accountDeletionPending, setAccountDeletionPending] = useState(false);
  const [accountRestoreUnavailable, setAccountRestoreUnavailable] = useState(false);
  const [session, setSession] = useState<AppSession>();
  const [account, setAccount] = useState<AccountSummary>();
  const [passwordAuthorization, setPasswordAuthorization] = useState<{
    accessToken: string;
    expiresAt: number;
    grantId: string;
    purpose: 'recovery' | 'setup';
    userId: string;
  }>();
  const [accountReady, setAccountReady] = useState(false);
  const [bindingPrompt, setBindingPrompt] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [pendingPath, setPendingPath] = useState<string>();
  const [uiAcceptanceMode, setUiAcceptanceMode] = useState(
    __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1',
  );
  const sessionRef = useRef<AppSession | undefined>(undefined);
  const accountDeletionPendingRef = useRef(false);
  const accountDeletionInspectionRef = useRef<Promise<'completed' | 'none' | 'pending' | 'unavailable'> | undefined>(undefined);
  const accountDeletionFinalizationRef = useRef<Promise<void> | undefined>(undefined);
  const accountDeletionSubmissionRef = useRef(false);
  const accountInitializationRef = useRef<{
    promise: Promise<AccountSummary>;
    userId: string;
  } | undefined>(undefined);
  const sessionMutationRef = useRef(0);
  const interactiveAuthRef = useRef<number | undefined>(undefined);

  const setSessionSnapshot = useCallback((next: AppSession | undefined, resetAccount = false) => {
    const userChanged = sessionRef.current?.user.id !== next?.user.id;
    sessionRef.current = next;
    if (userChanged) accountInitializationRef.current = undefined;
    if (!next || resetAccount || userChanged) {
      setLearningSyncActiveUser(undefined);
      setAccount(undefined);
      setAccountReady(false);
    }
    setSession(next);
  }, []);

  const beginInteractiveAuth = useCallback(() => {
    const epoch = sessionMutationRef.current + 1;
    sessionMutationRef.current = epoch;
    interactiveAuthRef.current = epoch;
    setAccountReady(false);
    setUiAcceptanceMode(false);
    return epoch;
  }, []);

  const finishInteractiveAuth = useCallback((epoch: number) => {
    if (interactiveAuthRef.current === epoch) interactiveAuthRef.current = undefined;
  }, []);

  const setAccountDeletionState = useCallback((pending: boolean) => {
    accountDeletionPendingRef.current = pending;
    setAccountDeletionPending(pending);
  }, []);

  const finalizeAccountDeletion = useCallback(() => {
    if (accountDeletionFinalizationRef.current) return accountDeletionFinalizationRef.current;
    let finalization!: Promise<void>;
    finalization = (async () => {
      setAccountDeletionState(true);
      setAccountRestoreUnavailable(false);
      setSessionSnapshot(undefined, true);
      setPasswordAuthorization(undefined);
      await clearDeletedAccountLocalData();
      if (service) await service.signOut('local');
      await clearPendingAccountDeletion();
      setAccountDeletionState(false);
    })().finally(() => {
      if (accountDeletionFinalizationRef.current === finalization) {
        accountDeletionFinalizationRef.current = undefined;
      }
    });
    accountDeletionFinalizationRef.current = finalization;
    return finalization;
  }, [service, setAccountDeletionState, setSessionSnapshot]);

  const inspectPendingAccountDeletion = useCallback((acceptRecentNotFound = false) => {
    if (accountDeletionSubmissionRef.current) return Promise.resolve('pending' as const);
    if (accountDeletionInspectionRef.current) return accountDeletionInspectionRef.current;
    let inspection!: Promise<'completed' | 'none' | 'pending' | 'unavailable'>;
    inspection = (async () => {
      let pending: Awaited<ReturnType<typeof readPendingAccountDeletion>>;
      try {
        pending = await readPendingAccountDeletion();
      } catch {
        setSessionSnapshot(undefined, true);
        setAccountDeletionState(false);
        setAccountRestoreUnavailable(true);
        return 'unavailable' as const;
      }
      if (!pending) {
        setAccountDeletionState(false);
        setAccountRestoreUnavailable(false);
        return 'none' as const;
      }
      let status: DeleteAccountResponse;
      try {
        status = await apiRequest<DeleteAccountResponse>('/v1/account/deletion/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: pending.idempotencyKey }),
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'account_deletion_job_not_found') {
          if (acceptRecentNotFound || Date.now() - pending.createdAt >= ACCOUNT_DELETION_AMBIGUITY_WINDOW_MS) {
            await clearPendingAccountDeletion();
            setAccountDeletionState(false);
            setAccountRestoreUnavailable(false);
            return 'none' as const;
          }
          setSessionSnapshot(undefined, true);
          setAccountDeletionState(true);
          setAccountRestoreUnavailable(false);
          return 'pending' as const;
        }
        setSessionSnapshot(undefined, true);
        setAccountDeletionState(false);
        setAccountRestoreUnavailable(true);
        return 'unavailable' as const;
      }
      if (status.status === 'completed') {
        setAccountRestoreUnavailable(false);
        await finalizeAccountDeletion();
        return 'completed' as const;
      }
      setSessionSnapshot(undefined, true);
      setAccountDeletionState(true);
      setAccountRestoreUnavailable(false);
      return 'pending' as const;
    })().finally(() => {
      if (accountDeletionInspectionRef.current === inspection) {
        accountDeletionInspectionRef.current = undefined;
      }
    });
    accountDeletionInspectionRef.current = inspection;
    return inspection;
  }, [finalizeAccountDeletion, setAccountDeletionState, setSessionSnapshot]);

  const initializeInternalAccount = useCallback((next: AppSession) => {
    if (accountInitializationRef.current?.userId === next.user.id) {
      return accountInitializationRef.current.promise;
    }
    const promise = apiRequest<AccountSummary>('/v1/account');
    accountInitializationRef.current = { promise, userId: next.user.id };
    void promise.catch(() => {
      if (accountInitializationRef.current?.promise === promise) accountInitializationRef.current = undefined;
    });
    return promise;
  }, []);

  const acceptAuthenticatedSession = useCallback(async (next: AppSession, expectedEpoch?: number) => {
    if (expectedEpoch !== undefined && sessionMutationRef.current !== expectedEpoch) {
      throw new Error('auth_request_not_completed');
    }
    setSessionSnapshot(next);
    try {
      const resolved = await initializeInternalAccount(next);
      if (expectedEpoch !== undefined && sessionMutationRef.current !== expectedEpoch) {
        throw new Error('auth_request_not_completed');
      }
      if (sessionRef.current?.user.id !== next.user.id) throw new Error('auth_request_not_completed');
      setAccount(resolved);
      setAccountRestoreUnavailable(false);
      setLearningSyncActiveUser(resolved.accountId);
      return next;
    } catch {
      if (sessionRef.current?.user.id === next.user.id) {
        // A temporary account-profile failure must not destroy a verified auth
        // session. The root gate keeps business data closed and offers retry.
        setAccountRestoreUnavailable(true);
      }
      throw new Error('auth_service_unavailable');
    }
  }, [initializeInternalAccount, setSessionSnapshot]);

  const restorePersistedAccount = useCallback(async () => {
    if (!service) return;
    const expectedMutation = sessionMutationRef.current;
    try {
      const deletionState = await inspectPendingAccountDeletion();
      if (deletionState !== 'none') return;
      const next = sessionRef.current ?? await service.getSession();
      if (sessionMutationRef.current !== expectedMutation) return;
      if (!next) {
        setSessionSnapshot(undefined, true);
        setAccountRestoreUnavailable(false);
        return;
      }
      await acceptAuthenticatedSession(next);
      setAccountRestoreUnavailable(false);
    } catch {
      if (sessionMutationRef.current !== expectedMutation) return;
      if (accountDeletionPendingRef.current) return;
      setAccountRestoreUnavailable(true);
    }
  }, [acceptAuthenticatedSession, inspectPendingAccountDeletion, service, setSessionSnapshot]);

  useEffect(() => {
    if (!service) return;
    let active = true;
    setApiAccessTokenProvider(async () => sessionRef.current?.accessToken);
    setApiAuthRecovery({
      refresh: async () => {
        const expectedMutation = sessionMutationRef.current;
        const expectedToken = sessionRef.current?.accessToken;
        const next = await service.refreshSession();
        const current = sessionRef.current;
        if (sessionMutationRef.current !== expectedMutation || interactiveAuthRef.current !== undefined) {
          return current?.accessToken;
        }
        if (current?.accessToken !== expectedToken) return current?.accessToken;
        if (next) setSessionSnapshot(next);
        return next?.accessToken ?? current?.accessToken;
      },
      onInvalidated: async (rejectedToken) => {
        if (sessionRef.current?.accessToken !== rejectedToken) return;
        const persisted = await service.getSession().catch(() => undefined);
        if (persisted?.accessToken && persisted.accessToken !== rejectedToken) {
          setSessionSnapshot(persisted);
          return;
        }
        if (sessionRef.current?.accessToken !== rejectedToken) return;
        await service.signOut('local').catch(() => undefined);
        await clearLocalAiConsent().catch(() => undefined);
        setSessionSnapshot(undefined, true);
        setPasswordAuthorization(undefined);
      },
    });
    const unsubscribe = service.onSessionChange((next, event) => {
      if (!active || accountDeletionPendingRef.current || event === 'INITIAL_SESSION') return;
      const observedMutation = sessionMutationRef.current;
      if (interactiveAuthRef.current !== undefined) return;
      // Supabase can deliver a queued old-account event after a newer login.
      // The persisted session is authoritative; an event that no longer
      // matches it is stale and must never clear or replace the current user.
      void service.getSession().then(async (persisted) => {
        if (
          !active
          || accountDeletionPendingRef.current
          || sessionMutationRef.current !== observedMutation
          || interactiveAuthRef.current !== undefined
        ) return;
        if (persisted?.accessToken !== next?.accessToken) return;
        if (!persisted) {
          setSessionSnapshot(undefined, true);
          setPasswordAuthorization(undefined);
          return;
        }
        if (sessionRef.current?.accessToken === persisted.accessToken) return;
        setUiAcceptanceMode(false);
        await acceptAuthenticatedSession(persisted).catch(() => undefined);
      }).catch(() => undefined);
    });
    void restorePersistedAccount().finally(() => { if (active) setRestoring(false); });
    if (AppState.currentState === 'active') service.startAutoRefresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        service.startAutoRefresh();
        void runLearningSync().catch(() => undefined);
      } else service.stopAutoRefresh();
    });
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
      service.stopAutoRefresh();
      setLearningSyncActiveUser(undefined);
      setApiAccessTokenProvider(undefined);
      setApiAuthRecovery(undefined);
    };
  }, [acceptAuthenticatedSession, restorePersistedAccount, service, setSessionSnapshot]);

  useEffect(() => {
    if (!accountDeletionPending) return;
    const timer = setInterval(() => {
      void inspectPendingAccountDeletion().catch(() => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [accountDeletionPending, inspectPendingAccountDeletion]);

  useEffect(() => {
    if (
      passwordAuthorization
      && (
        passwordAuthorization.userId !== session?.user.id
        || passwordAuthorization.accessToken !== session?.accessToken
      )
    ) {
      setPasswordAuthorization(undefined);
    }
  }, [passwordAuthorization, session?.accessToken, session?.user.id]);

  useEffect(() => {
    const userId = account?.accountId;
    const passwordFlowActive = Boolean(
      passwordAuthorization
      && passwordAuthorization.userId === session?.user.id
      && passwordAuthorization.accessToken === session?.accessToken
      && passwordAuthorization.expiresAt > Date.now(),
    );
    if (!userId || passwordFlowActive) {
      setBindingPrompt(false);
      setAccountReady(false);
      return;
    }
    let active = true;
    void inspectLearningSyncBinding(userId).then(async (inspection) => {
      if (!active) return;
      if (inspection.needsConfirmation) {
        setAccountReady(false);
        setBindingPrompt(true);
      }
      else {
        await bindEmptyLearningSync(userId);
        if (active) {
          setBindingPrompt(false);
          setAccountReady(true);
        }
      }
    }).catch(() => { if (active) setAccountReady(false); });
    return () => { active = false; };
  }, [account?.accountId, passwordAuthorization, session?.accessToken, session?.user.id]);

  async function confirmBinding() {
    const userId = account?.accountId;
    if (!userId) return;
    setBinding(true);
    setBindingError('');
    try {
      await bindLearningSync(userId, 'upload-local');
      setBindingPrompt(false);
      setAccountReady(true);
    } catch {
      setBindingError('绑定或首次同步失败，本机数据仍保留，可稍后重试。');
    } finally {
      setBinding(false);
    }
  }

  async function archiveBinding() {
    const userId = account?.accountId;
    if (!userId) return;
    setBinding(true);
    setBindingError('');
    try {
      await archiveAndBindEmptyLearningSync(userId);
      setBindingPrompt(false);
      setAccountReady(true);
    } catch {
      setBindingError('本机归档或云端初始化失败，原数据仍保留，请稍后重试。');
    } finally {
      setBinding(false);
    }
  }

  const revokeAllAndClear = useCallback(async () => {
    await apiRequest<{ revoked: true }>('/v1/account/sessions/revoke-all', { method: 'POST' });
    await service?.signOut('local').catch(() => undefined);
    await clearLocalAiConsent().catch(() => undefined);
    setPasswordAuthorization(undefined);
    setSessionSnapshot(undefined, true);
  }, [service, setSessionSnapshot]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(service),
    accountReady,
    accountDeletionPending,
    accountRestoreUnavailable,
    account,
    canAccessApp: Boolean(session && account) || uiAcceptanceMode,
    restoring,
    session,
    passwordChangePurpose: passwordAuthorization
      && passwordAuthorization.userId === session?.user.id
      && passwordAuthorization.accessToken === session?.accessToken
      && passwordAuthorization.expiresAt > Date.now()
      ? passwordAuthorization.purpose
      : undefined,
    uiAcceptanceAvailable: UI_ACCEPTANCE_MODE_AVAILABLE,
    uiAcceptanceMode,
    consumePendingPath() { const value = pendingPath; setPendingPath(undefined); return value; },
    enterUiAcceptanceMode() {
      if (!UI_ACCEPTANCE_MODE_AVAILABLE) return;
      setLearningSyncActiveUser(undefined);
      setAccountReady(false);
      setUiAcceptanceMode(true);
    },
    exitUiAcceptanceMode() {
      setUiAcceptanceMode(false);
      setPendingPath(undefined);
    },
    rememberPendingPath(path) { if (!path.startsWith('/auth/') && !path.startsWith('/legal/')) setPendingPath(path); },
    async signInWithApple() {
      if (!service) return unavailable();
      const epoch = beginInteractiveAuth();
      setPasswordAuthorization(undefined);
      setAccount(undefined);
      try {
        await acceptAuthenticatedSession(await service.signInWithApple(), epoch);
      } finally {
        finishInteractiveAuth(epoch);
      }
    },
    async signInWithWechat() {
      if (!service) return unavailable();
      const epoch = beginInteractiveAuth();
      setPasswordAuthorization(undefined);
      setAccount(undefined);
      try {
        await acceptAuthenticatedSession(await service.signInWithWechat(), epoch);
      } finally {
        finishInteractiveAuth(epoch);
      }
    },
    async requestPhoneOtp(phone) { if (!service) return unavailable(); return service.requestPhoneOtp(phone); },
    async requestPasswordRecoveryOtp(phone) { if (!service) return unavailable(); return service.requestPasswordRecoveryOtp(phone); },
    async verifyPhoneOtp(challenge, token) {
      if (!service) return unavailable();
      const epoch = beginInteractiveAuth();
      try {
        const next = await service.verifyPhoneOtp(challenge, token);
        const passwordPurpose = challenge.purpose === 'recovery' ? 'recovery' : undefined;
        if (passwordPurpose) {
          const authorization = await service.authorizePasswordRecovery();
          setPasswordAuthorization({
            accessToken: next.accessToken,
            expiresAt: authorization.expiresAt,
            grantId: authorization.grantId,
            purpose: passwordPurpose,
            userId: next.user.id,
          });
          setPendingPath('/account/password?mode=recovery');
        } else setPasswordAuthorization(undefined);
        await acceptAuthenticatedSession(next, epoch);
        return next;
      } catch (error) {
        if (challenge.purpose === 'recovery') {
          await service.signOut('local').catch(() => undefined);
          setPasswordAuthorization(undefined);
          setSessionSnapshot(undefined, true);
        }
        throw error;
      } finally {
        finishInteractiveAuth(epoch);
      }
    },
    async signInWithPhonePassword(phone, password) {
      if (!service) return unavailable();
      const epoch = beginInteractiveAuth();
      setPasswordAuthorization(undefined);
      try {
        await acceptAuthenticatedSession(await service.signInWithPhonePassword(phone, password), epoch);
      } finally {
        finishInteractiveAuth(epoch);
      }
    },
    async updatePassword(password, currentPassword) {
      if (!service) return unavailable();
      const authorization = passwordAuthorization
        && passwordAuthorization.userId === session?.user.id
        && passwordAuthorization.accessToken === session?.accessToken
        && passwordAuthorization.expiresAt > Date.now()
        ? passwordAuthorization
        : undefined;
      const isFirstPasswordSetup = session?.user.phoneBound === true && session.user.hasPassword === false;
      if (currentPassword === undefined && !authorization && !isFirstPasswordSetup) {
        setPasswordAuthorization(undefined);
        throw new Error('phone_reauthentication_required');
      }
      setPasswordAuthorization(undefined);
      const next = await service.updatePassword(
        password,
        currentPassword,
        authorization?.purpose === 'recovery' ? authorization.grantId : undefined,
      );
      setSessionSnapshot(next);
    },
    async requestPhoneBindingOtp(phone) {
      if (!service) return unavailable();
      return service.requestPhoneBindingOtp(phone);
    },
    async resendPhoneBindingOtp(challenge) {
      if (!service) return unavailable();
      await service.resendPhoneBindingOtp(challenge);
    },
    async verifyPhoneBindingOtp(challenge, token) {
      if (!service) return unavailable();
      const verified = await service.verifyPhoneBindingOtp(challenge, token);
      setAccountReady(false);
      setSessionSnapshot(verified.session);
      setAccount(verified.account);
      setLearningSyncActiveUser(verified.account.accountId);
    },
    async signIn() { throw new Error('invite_login_removed'); },
    async signOut() { if (!service) return unavailable(); sessionMutationRef.current += 1; interactiveAuthRef.current = undefined; await service.signOut('local'); await clearLocalAiConsent().catch(() => undefined); setPasswordAuthorization(undefined); setSessionSnapshot(undefined, true); },
    async signOutAll() { if (!service) return unavailable(); await revokeAllAndClear(); },
    async requestAccountDeletionPhoneOtp() {
      if (!service) return unavailable();
      await service.requestAccountDeletionPhoneOtp();
    },
    async retryAccountRestore() {
      setRestoring(true);
      try {
        await restorePersistedAccount();
      } finally {
        setRestoring(false);
      }
    },
    async resumeAccountDeletion() {
      await inspectPendingAccountDeletion();
    },
    async deleteAccount(authentication = {}) {
      if (!service || !account) return unavailable();
      let grantId: string;
      if (session?.user.providers.includes('apple')) {
        grantId = (await service.authorizeAccountDeletionWithApple()).grantId;
      } else if (session?.user.providers.includes('wechat')) {
        grantId = (await service.authorizeAccountDeletionWithWechat(account.accountId)).grantId;
      } else if (session?.user.hasPassword) {
        grantId = (await service.authorizeAccountDeletionWithPassword(authentication.password ?? '')).grantId;
      } else {
        grantId = (await service.authorizeAccountDeletionWithPhoneOtp(authentication.phoneOtp ?? '')).grantId;
      }
      const pending = await pendingAccountDeletionFor(account.accountId);
      accountDeletionSubmissionRef.current = true;
      setAccountRestoreUnavailable(false);
      setAccountDeletionState(true);
      try {
        const response = await apiRequest<DeleteAccountResponse>('/v1/account', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            confirmation: '注销账号',
            grantId,
            idempotencyKey: pending.idempotencyKey,
          }),
        });
        accountDeletionSubmissionRef.current = false;
        setSessionSnapshot(undefined, true);
        if (response.status === 'completed') {
          await finalizeAccountDeletion();
        }
      } catch (error) {
        accountDeletionSubmissionRef.current = false;
        const deterministicRejection = error instanceof ApiClientError
          && error.status >= 400
          && error.status < 500
          && ![408, 409, 425, 429].includes(error.status);
        if (await inspectPendingAccountDeletion(deterministicRejection) === 'none') throw error;
      }
    },
  }), [acceptAuthenticatedSession, account, accountDeletionPending, accountReady, accountRestoreUnavailable, beginInteractiveAuth, finalizeAccountDeletion, finishInteractiveAuth, inspectPendingAccountDeletion, passwordAuthorization, pendingPath, restorePersistedAccount, restoring, revokeAllAndClear, service, session, setAccountDeletionState, setSessionSnapshot, uiAcceptanceMode]);

  return <AuthContext.Provider value={value}>{children}<AppModal animationType="fade" onRequestClose={() => undefined} transparent visible={bindingPrompt}><View style={styles.overlay}><View style={styles.dialog}><AppText variant="sectionTitle">选择本机学习数据归属</AppText><AppText>此设备已有旧版或其他账号的本机数据。继续前必须选择导入当前账号并同步，或保存本地归档并从当前账号的云端数据开始。</AppText>{bindingError ? <AppText color={colors.destructive} variant="caption">{bindingError}</AppText> : null}<Button disabled={binding} onPress={() => void confirmBinding()}>{binding ? '正在处理…' : '导入当前账号并同步'}</Button><Button disabled={binding} onPress={() => void archiveBinding()} variant="outline">本地归档并从云端开始</Button></View></View></AppModal></AuthContext.Provider>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
});

export function useAuth() {
  return useContext(AuthContext);
}
