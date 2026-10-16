import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { DeleteAccountResponse } from '@icao/contracts';
import type { LoginMethodActionPurpose, NativeAccountSummary, NativeStartPhoneOtpResponse } from '@icao/contracts/native-auth';
import type { AppContentLegalDocument, LegalConsentStatus } from '@icao/contracts/app-content';

import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { ApiClientError, apiRequest, apiRequestWithAccessToken, setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';
import { runLearningSync, setLearningSyncActiveUser, switchLearningSyncAccount } from '@/features/sync/learning-sync.native';

import { getAuthService, type AppSession, type PhoneBindingChallenge } from './auth-service';
import { clearDeletedAccountLocalData } from './account-deletion-local-cleanup';
import { clearPendingAccountDeletion, pendingAccountDeletionFor, readPendingAccountDeletion } from './account-deletion-state';
import type { PersistedPhoneOtpChallenge } from './phone-otp-challenge-store';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from './ui-acceptance-mode';
import { acceptLegalDocuments, getLegalConsentStatus } from '@/features/app-content/legal-consent.native';
import { LegalConsentGate } from '@/features/app-content/LegalConsentGate.native';
import { AccountRestoreState } from './AccountRestoreState.native';

export type LoginLegalDocuments = { agreement: AppContentLegalDocument; privacy: AppContentLegalDocument };

export type AccountDeletionAuthentication = {
  method: 'apple' | 'password' | 'phone_otp' | 'wechat';
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
  account?: NativeAccountSummary;
  session?: AppSession;
  passwordChangePurpose?: 'recovery' | 'setup';
  passwordChangeReturnPath?: '/(tabs)' | '/account/security';
  uiAcceptanceAvailable: boolean;
  uiAcceptanceMode: boolean;
  consumePendingPath(): string | undefined;
  enterUiAcceptanceMode(): void;
  exitUiAcceptanceMode(): void;
  rememberPendingPath(path: string): void;
  rememberLoginConsent(documents: LoginLegalDocuments | undefined): void;
  changeLoginMethod(provider: 'apple' | 'wechat', action: 'bind' | 'unbind', authentication: AccountDeletionAuthentication): Promise<void>;
  requestLoginMethodPhoneOtp(provider: 'apple' | 'wechat', action: 'bind' | 'unbind'): Promise<NativeStartPhoneOtpResponse>;
  signInWithApple(): Promise<void>;
  isWechatSignInAvailable(): Promise<boolean>;
  signInWithWechat(): Promise<void>;
  requestPhoneOtp(phone: string): Promise<NativeStartPhoneOtpResponse>;
  requestPasswordRecoveryOtp(phone: string): Promise<NativeStartPhoneOtpResponse>;
  verifyPhoneOtp(challenge: PersistedPhoneOtpChallenge, token: string): Promise<AppSession>;
  verifyCurrentAccountRecoveryOtp(challenge: PersistedPhoneOtpChallenge, token: string): Promise<void>;
  signInWithPhonePassword(phone: string, password: string): Promise<void>;
  updatePassword(password: string, currentPassword?: string): Promise<void>;
  requestPhoneBindingOtp(phone: string, recentAuthGrantId?: string): Promise<PhoneBindingChallenge>;
  authorizePhoneBinding(authentication: AccountDeletionAuthentication): Promise<string>;
  requestPhoneBindingVerificationOtp(): Promise<NativeStartPhoneOtpResponse>;
  resendPhoneBindingOtp(challenge: PhoneBindingChallenge): Promise<PhoneBindingChallenge>;
  verifyPhoneBindingOtp(challenge: PhoneBindingChallenge, token: string): Promise<void>;
  signIn(inviteCode: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(authentication: AccountDeletionAuthentication): Promise<void>;
  requestAccountDeletionPhoneOtp(purpose?: 'account_delete' | 'session_revoke_all'): Promise<void>;
  retryAccountRestore(): Promise<void>;
  resumeAccountDeletion(): Promise<void>;
  deleteAccount(authentication: AccountDeletionAuthentication, confirm?: () => Promise<boolean>): Promise<void>;
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
  rememberLoginConsent: () => undefined,
  changeLoginMethod: unavailable,
  requestLoginMethodPhoneOtp: unavailable,
  signInWithApple: unavailable,
  isWechatSignInAvailable: async () => false,
  signInWithWechat: unavailable,
  requestPhoneOtp: unavailable,
  requestPasswordRecoveryOtp: unavailable,
  verifyPhoneOtp: unavailable,
  verifyCurrentAccountRecoveryOtp: unavailable,
  signInWithPhonePassword: unavailable,
  updatePassword: unavailable,
  requestPhoneBindingOtp: unavailable,
  authorizePhoneBinding: unavailable,
  requestPhoneBindingVerificationOtp: unavailable,
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
  const [account, setAccount] = useState<NativeAccountSummary>();
  const activeAccountIdRef = useRef<string | undefined>(undefined);
  const [legalStatus, setLegalStatus] = useState<LegalConsentStatus>();
  const legalStatusRef = useRef<LegalConsentStatus | undefined>(undefined);
  const loginConsentRef = useRef<LoginLegalDocuments | undefined>(undefined);
  const [passwordAuthorization, setPasswordAuthorization] = useState<{
    accessToken: string;
    expiresAt: number;
    grantId: string;
    purpose: 'recovery' | 'setup';
    origin?: 'login' | 'security';
    userId: string;
  }>();
  const [accountReady, setAccountReady] = useState(false);
  const [pendingPath, setPendingPath] = useState<string>();
  const [uiAcceptanceMode, setUiAcceptanceMode] = useState(
    __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1',
  );
  const sessionRef = useRef<AppSession | undefined>(undefined);
  const accountDeletionPendingRef = useRef(false);
  const accountDeletionInspectionRef = useRef<Promise<'completed' | 'none' | 'pending' | 'unavailable'> | undefined>(undefined);
  const accountDeletionFinalizationRef = useRef<Promise<void> | undefined>(undefined);
  const accountDeletionSubmissionRef = useRef(false);
  const accountDeletionActionRef = useRef(false);
  const loginMethodActionRef = useRef(false);
  const accountInitializationRef = useRef<{
    promise: Promise<NativeAccountSummary>;
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
      activeAccountIdRef.current = undefined;
      setAccountReady(false);
      legalStatusRef.current = undefined;
      setLegalStatus(undefined);
      if (!next) loginConsentRef.current = undefined;
    }
    setSession(next);
  }, []);

  const beginInteractiveAuth = useCallback(() => {
    if (accountDeletionPendingRef.current) throw new Error('account_deletion_in_progress');
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

  const finalizeAccountDeletion = useCallback((deletedAccountId: string) => {
    if (accountDeletionFinalizationRef.current) return accountDeletionFinalizationRef.current;
    let finalization!: Promise<void>;
    finalization = (async () => {
      setAccountDeletionState(true);
      setAccountRestoreUnavailable(false);
      setSessionSnapshot(undefined, true);
      setPasswordAuthorization(undefined);
      await clearDeletedAccountLocalData(deletedAccountId);
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
        await finalizeAccountDeletion(pending.accountId);
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
    const promise = apiRequestWithAccessToken<NativeAccountSummary>('/v1/account', next.accessToken);
    accountInitializationRef.current = { promise, userId: next.user.id };
    void promise.catch(() => {
      if (accountInitializationRef.current?.promise === promise) accountInitializationRef.current = undefined;
    });
    return promise;
  }, []);

  const acceptAuthenticatedSession = useCallback(async (next: AppSession, expectedEpoch = sessionMutationRef.current) => {
    const assertCurrent = () => {
      if (sessionMutationRef.current !== expectedEpoch || sessionRef.current?.user.id !== next.user.id) {
        throw new Error('auth_request_not_completed');
      }
    };
    if (sessionMutationRef.current !== expectedEpoch) {
      throw new Error('auth_request_not_completed');
    }
    setSessionSnapshot(next);
    try {
      const resolved = await initializeInternalAccount(next);
      if (expectedEpoch !== undefined && sessionMutationRef.current !== expectedEpoch) {
        throw new Error('auth_request_not_completed');
      }
      if (sessionRef.current?.user.id !== next.user.id) throw new Error('auth_request_not_completed');
      await switchLearningSyncAccount(resolved.accountId);
      assertCurrent();
      let consent = legalStatusRef.current?.accountId === resolved.accountId ? legalStatusRef.current : undefined;
      if (!consent) {
        consent = await getLegalConsentStatus(resolved.accountId);
        assertCurrent();
        const accepted = loginConsentRef.current;
        if (consent.required && accepted
          && accepted.agreement.version === consent.agreement.version && accepted.privacy.version === consent.privacy.version) {
          try {
            const receipt = await acceptLegalDocuments(resolved.accountId, accepted);
            assertCurrent();
            consent = { ...consent, required: false, receipt };
          } catch (error) {
            // A failed receipt must leave the confirmation screen available, never fabricate acceptance.
            if (error instanceof ApiClientError && error.code === 'legal_version_changed') consent = await getLegalConsentStatus(resolved.accountId);
          }
        }
        assertCurrent();
        loginConsentRef.current = undefined;
      }
      if (
        sessionRef.current?.user.id !== next.user.id
        || (expectedEpoch !== undefined && sessionMutationRef.current !== expectedEpoch)
      ) throw new Error('auth_request_not_completed');
      setAccount(resolved);
      activeAccountIdRef.current = resolved.accountId;
      legalStatusRef.current = consent;
      setLegalStatus(consent);
      setAccountRestoreUnavailable(false);
      setAccountReady(true);
      return next;
    } catch {
      if (sessionMutationRef.current === expectedEpoch && sessionRef.current?.user.id === next.user.id) {
        // A temporary account-profile failure must not destroy a verified auth
        // session. The root gate keeps business data closed and offers retry.
        setAccountRestoreUnavailable(true);
      }
      throw new Error('auth_service_unavailable');
    }
  }, [initializeInternalAccount, setSessionSnapshot]);

  const restorePersistedAccount = useCallback(async () => {
    if (!service) return false;
    const expectedMutation = sessionMutationRef.current;
    try {
      const deletionState = await inspectPendingAccountDeletion();
      if (deletionState !== 'none') return deletionState === 'unavailable' ? false : undefined;
      const next = sessionRef.current ?? await service.getSession();
      if (sessionMutationRef.current !== expectedMutation) return;
      if (!next) {
        setSessionSnapshot(undefined, true);
        setAccountRestoreUnavailable(false);
        return;
      }
      await acceptAuthenticatedSession(next, expectedMutation);
      if (sessionMutationRef.current !== expectedMutation) return;
      setAccountRestoreUnavailable(false);
    } catch {
      if (sessionMutationRef.current !== expectedMutation) return;
      if (accountDeletionPendingRef.current) return;
      setAccountRestoreUnavailable(true);
      return false;
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
        let persisted: AppSession | undefined;
        try {
          persisted = await service.getSession();
        } catch {
          if (sessionRef.current?.accessToken === rejectedToken) setAccountRestoreUnavailable(true);
          return;
        }
        if (sessionRef.current?.accessToken !== rejectedToken) return;
        if (persisted?.accessToken && persisted.accessToken !== rejectedToken) {
          setSessionSnapshot(persisted);
          return;
        }
        if (sessionRef.current?.accessToken !== rejectedToken) return;
        try {
          await service.signOut('local');
        } catch {
          if (sessionRef.current?.accessToken === rejectedToken) setAccountRestoreUnavailable(true);
          return;
        }
        if (sessionRef.current?.accessToken !== rejectedToken) return;
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
      }).catch(() => {
        if (active && sessionMutationRef.current === observedMutation && interactiveAuthRef.current === undefined) {
          setAccountRestoreUnavailable(true);
        }
      });
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

  const revokeAllAndClear = useCallback(async (grantId: string, accessToken: string, assertCurrent: () => void) => {
    assertCurrent();
    await apiRequestWithAccessToken<{ revoked: true }>('/v1/account/sessions/revoke-all', accessToken, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantId }),
    });
    assertCurrent();
    await service?.signOut('local').catch(() => undefined);
    assertCurrent();
    await Promise.resolve(clearLocalAiConsent()).catch(() => undefined);
    assertCurrent();
    setPasswordAuthorization(undefined);
    setSessionSnapshot(undefined, true);
  }, [service, setSessionSnapshot]);

  const isWechatSignInAvailable = useCallback(async () => {
    return service ? service.isWechatSignInAvailable() : false;
  }, [service]);

  const value = useMemo<AuthContextValue>(() => ({
    isWechatSignInAvailable,
    configured: Boolean(service),
    accountReady,
    accountDeletionPending,
    accountRestoreUnavailable,
    account,
    canAccessApp: Boolean(session && account && accountReady && legalStatus?.accountId === account.accountId && !legalStatus.required) || uiAcceptanceMode,
    restoring,
    session,
    passwordChangePurpose: passwordAuthorization
      && passwordAuthorization.userId === session?.user.id
      && passwordAuthorization.accessToken === session?.accessToken
      && passwordAuthorization.expiresAt > Date.now()
      ? passwordAuthorization.purpose
      : undefined,
    passwordChangeReturnPath: passwordAuthorization?.origin === 'security' ? '/account/security' : '/(tabs)',
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
    rememberLoginConsent(documents) { loginConsentRef.current = documents; },
    async requestLoginMethodPhoneOtp(provider, action) {
      if (!service) return unavailable();
      return service.requestLoginMethodPhoneOtp(`${provider}_${action === 'bind' ? 'binding' : 'unbinding'}`);
    },
    async changeLoginMethod(provider, action, authentication) {
      if (!service || !account) return unavailable();
      if (loginMethodActionRef.current) throw new Error('login_method_change_in_progress');
      loginMethodActionRef.current = true;
      const expectedEpoch = sessionMutationRef.current;
      const expectedUserId = sessionRef.current?.user.id;
      const stillCurrent = () => sessionMutationRef.current === expectedEpoch
        && sessionRef.current?.user.id === expectedUserId && activeAccountIdRef.current === account.accountId;
      const purpose: LoginMethodActionPurpose = `${provider}_${action === 'bind' ? 'binding' : 'unbinding'}`;
      try {
        const grant = authentication.method === 'apple' ? await service.authorizeLoginMethodWithApple(purpose)
          : authentication.method === 'wechat' ? await service.authorizeLoginMethodWithWechat(purpose)
          : authentication.method === 'password' ? await service.authorizeLoginMethodWithPassword(authentication.password ?? '', purpose)
          : await service.authorizeLoginMethodWithPhoneOtp(authentication.phoneOtp ?? '', purpose);
        if (!stillCurrent()) throw new Error('auth_request_not_completed');
        const result = action === 'unbind' ? await service.unbindLoginMethod(provider, grant.grantId)
          : provider === 'apple' ? await service.bindApple(grant.grantId) : await service.bindWechat(grant.grantId);
        if (!stillCurrent() || result.accountId !== account.accountId) throw new Error('auth_request_not_completed');
        if (result.sessionEnded) {
          await service.signOut('local').catch(() => undefined);
          if (!stillCurrent()) return;
          setSessionSnapshot(undefined, true);
          setPasswordAuthorization(undefined);
          return;
        }
        accountInitializationRef.current = undefined;
        const refreshed = await apiRequest<NativeAccountSummary>('/v1/account');
        if (!stillCurrent() || refreshed.accountId !== account.accountId) throw new Error('auth_request_not_completed');
        setAccount(refreshed);
      } finally { loginMethodActionRef.current = false; }
    },
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
        if (sessionMutationRef.current !== epoch) throw new Error('auth_request_not_completed');
        const passwordPurpose = challenge.purpose === 'recovery' ? 'recovery' : undefined;
        if (passwordPurpose) {
          // The newly verified recovery session has not been adopted by the
          // provider yet. Authorize against that exact token explicitly rather
          // than the global token provider, which may still be empty or stale.
          const authorization = await service.authorizePasswordRecovery(
            challenge.challengeId,
            next.accessToken,
          );
          if (sessionMutationRef.current !== epoch) throw new Error('auth_request_not_completed');
          setPasswordAuthorization({
            accessToken: next.accessToken,
            expiresAt: authorization.expiresAt,
            grantId: authorization.grantId,
            purpose: passwordPurpose,
            origin: 'login',
            userId: next.user.id,
          });
          setPendingPath('/account/password?mode=recovery');
        } else setPasswordAuthorization(undefined);
        await acceptAuthenticatedSession(next, epoch);
        return next;
      } catch (error) {
        if (challenge.purpose === 'recovery' && sessionMutationRef.current === epoch) {
          await service.signOut('local').catch(() => undefined);
          if (sessionMutationRef.current === epoch) {
            setPasswordAuthorization(undefined);
            setSessionSnapshot(undefined, true);
          }
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
    async verifyCurrentAccountRecoveryOtp(challenge, token) {
      if (!service || !account || !session || !account.phone || challenge.phone !== account.phone) return unavailable();
      if (interactiveAuthRef.current !== undefined) throw new Error('auth_request_not_completed');
      const epoch = ++sessionMutationRef.current;
      interactiveAuthRef.current = epoch;
      try {
        const result = await service.verifyCurrentAccountRecoveryOtp(challenge, token, account.accountId);
        if (sessionMutationRef.current !== epoch || activeAccountIdRef.current !== account.accountId) throw new Error('auth_request_not_completed');
        // The service verified the same business account. Adopting its phone proof
        // must not unmount the security page or switch the learning workspace.
        sessionRef.current = result.session;
        setSession(result.session);
        accountInitializationRef.current = undefined;
        setPasswordAuthorization({
          accessToken: result.session.accessToken,
          userId: result.session.user.id,
          grantId: result.authorization.grantId,
          expiresAt: result.authorization.expiresAt,
          purpose: 'recovery', origin: 'security',
        });
      } finally { finishInteractiveAuth(epoch); }
    },
    async updatePassword(password, currentPassword) {
      if (!service) return unavailable();
      if (interactiveAuthRef.current !== undefined) throw new Error('auth_request_not_completed');
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
      const epoch = ++sessionMutationRef.current;
      const accountId = activeAccountIdRef.current;
      interactiveAuthRef.current = epoch;
      try {
        const next = await service.updatePassword(
          password,
          currentPassword,
          authorization?.purpose === 'recovery' ? authorization.grantId : undefined,
        );
        if (sessionMutationRef.current !== epoch || activeAccountIdRef.current !== accountId) throw new Error('auth_request_not_completed');
        sessionRef.current = next;
        setSession(next);
        setAccount((current) => current && current.accountId === accountId ? { ...current, hasPassword: true } : current);
        accountInitializationRef.current = undefined;
      } finally {
        if (sessionMutationRef.current === epoch) setPasswordAuthorization(undefined);
        finishInteractiveAuth(epoch);
      }
    },
    async authorizePhoneBinding(authentication) {
      if (!service || !account) return unavailable();
      const epoch = sessionMutationRef.current;
      const grant = authentication.method === 'apple' ? await service.authorizeLoginMethodWithApple('phone_binding')
        : authentication.method === 'wechat' ? await service.authorizeLoginMethodWithWechat('phone_binding')
        : authentication.method === 'password' ? await service.authorizeLoginMethodWithPassword(authentication.password ?? '', 'phone_binding')
        : await service.authorizeLoginMethodWithPhoneOtp(authentication.phoneOtp ?? '', 'phone_binding');
      if (sessionMutationRef.current !== epoch || activeAccountIdRef.current !== account.accountId) throw new Error('auth_request_not_completed');
      return grant.grantId;
    },
    async requestPhoneBindingVerificationOtp() {
      if (!service) return unavailable();
      return service.requestLoginMethodPhoneOtp('phone_binding');
    },
    async requestPhoneBindingOtp(phone, recentAuthGrantId) {
      if (!service) return unavailable();
      return service.requestPhoneBindingOtp(phone, recentAuthGrantId);
    },
    async resendPhoneBindingOtp(challenge) {
      if (!service) return unavailable();
      return service.resendPhoneBindingOtp(challenge);
    },
    async verifyPhoneBindingOtp(challenge, token) {
      if (!service || !account) return unavailable();
      if (interactiveAuthRef.current !== undefined) throw new Error('auth_request_not_completed');
      const epoch = ++sessionMutationRef.current;
      interactiveAuthRef.current = epoch;
      try {
        const verified = await service.verifyPhoneBindingOtp(challenge, token);
        if (sessionMutationRef.current !== epoch || activeAccountIdRef.current !== account.accountId
          || verified.account.accountId !== account.accountId) throw new Error('auth_request_not_completed');
        // Binding changes the authentication principal, never the permanent
        // account, its current learning workspace, or its legal receipt.
        sessionRef.current = verified.session;
        setSession(verified.session);
        setAccount(verified.account);
        accountInitializationRef.current = undefined;
      } finally { finishInteractiveAuth(epoch); }
    },
    async signIn() { throw new Error('invite_login_removed'); },
    async signOut() {
      if (!service) return unavailable();
      const epoch = ++sessionMutationRef.current;
      interactiveAuthRef.current = epoch;
      try {
        await service.signOut('local');
        if (sessionMutationRef.current !== epoch) return;
        await clearLocalAiConsent().catch(() => undefined);
        if (sessionMutationRef.current !== epoch) return;
        setPasswordAuthorization(undefined);
        setAccountRestoreUnavailable(false);
        setSessionSnapshot(undefined, true);
      } finally { finishInteractiveAuth(epoch); }
    },
    async signOutAll(authentication) {
      if (!service || !account || !session) return unavailable();
      if (interactiveAuthRef.current !== undefined) throw new Error('auth_request_not_completed');
      const epoch = ++sessionMutationRef.current;
      interactiveAuthRef.current = epoch;
      const assertCurrent = () => {
        if (sessionMutationRef.current !== epoch || activeAccountIdRef.current !== account.accountId) {
          throw new Error('auth_request_not_completed');
        }
      };
      try {
      let grantId: string;
      switch (authentication.method) {
        case 'apple':
          grantId = (await service.authorizeAccountDeletionWithApple('session_revoke_all')).grantId;
          break;
        case 'wechat':
          grantId = (await service.authorizeAccountDeletionWithWechat(account.accountId, 'session_revoke_all')).grantId;
          break;
        case 'password':
          grantId = (await service.authorizeAccountDeletionWithPassword(
            authentication.password ?? '',
            'session_revoke_all',
          )).grantId;
          break;
        case 'phone_otp':
          grantId = (await service.authorizeAccountDeletionWithPhoneOtp(
            authentication.phoneOtp ?? '',
            'session_revoke_all',
          )).grantId;
          break;
      }
      await revokeAllAndClear(grantId, session.accessToken, assertCurrent);
      } finally { finishInteractiveAuth(epoch); }
    },
    async requestAccountDeletionPhoneOtp(purpose = 'account_delete') {
      if (!service) return unavailable();
      await service.requestAccountDeletionPhoneOtp(purpose);
    },
    async retryAccountRestore() {
      setRestoring(true);
      try {
        if (await restorePersistedAccount() === false) throw new Error('account_restore_unavailable');
      } finally {
        setRestoring(false);
      }
    },
    async resumeAccountDeletion() {
      if (await inspectPendingAccountDeletion() === 'unavailable') throw new Error('account_restore_unavailable');
    },
    async deleteAccount(authentication, confirm) {
      if (!service || !account || !session) return unavailable();
      if (accountDeletionActionRef.current) throw new Error('account_deletion_in_progress');
      accountDeletionActionRef.current = true;
      const actionEpoch = sessionMutationRef.current;
      const actionUserId = sessionRef.current?.user.id;
      try {
        let grantId: string;
        switch (authentication.method) {
          case 'apple':
            grantId = (await service.authorizeAccountDeletionWithApple()).grantId;
            break;
          case 'wechat':
            grantId = (await service.authorizeAccountDeletionWithWechat(account.accountId)).grantId;
            break;
          case 'password':
            grantId = (await service.authorizeAccountDeletionWithPassword(authentication.password ?? '')).grantId;
            break;
          case 'phone_otp':
            grantId = (await service.authorizeAccountDeletionWithPhoneOtp(authentication.phoneOtp ?? '')).grantId;
            break;
        }
        if (confirm && !await confirm()) throw new Error('account_deletion_cancelled');
        if (sessionMutationRef.current !== actionEpoch || sessionRef.current?.user.id !== actionUserId) {
          throw new Error('auth_request_not_completed');
        }
        const pending = await pendingAccountDeletionFor(account.accountId);
        if (sessionMutationRef.current !== actionEpoch || sessionRef.current?.user.id !== actionUserId) {
          throw new Error('auth_request_not_completed');
        }
        accountDeletionSubmissionRef.current = true;
        setAccountRestoreUnavailable(false);
        setAccountDeletionState(true);
        try {
          const response = await apiRequestWithAccessToken<DeleteAccountResponse>('/v1/account', session.accessToken, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              confirmation: '注销账号',
              grantId,
              idempotencyKey: pending.idempotencyKey,
            }),
          });
          accountDeletionSubmissionRef.current = false;
          if (sessionMutationRef.current !== actionEpoch || sessionRef.current?.user.id !== actionUserId) {
            throw new Error('auth_request_not_completed');
          }
          setSessionSnapshot(undefined, true);
          if (response.status === 'completed') {
            await finalizeAccountDeletion(pending.accountId);
          }
        } catch (error) {
          accountDeletionSubmissionRef.current = false;
          if (sessionMutationRef.current !== actionEpoch || (sessionRef.current && sessionRef.current.user.id !== actionUserId)) throw error;
          const deterministicRejection = error instanceof ApiClientError
            && error.status >= 400
            && error.status < 500
            && ![408, 409, 425, 429].includes(error.status);
          if (await inspectPendingAccountDeletion(deterministicRejection) === 'none') throw error;
        }
      } finally { accountDeletionActionRef.current = false; }
    },
  }), [isWechatSignInAvailable, acceptAuthenticatedSession, account, accountDeletionPending, accountReady, accountRestoreUnavailable, beginInteractiveAuth, finalizeAccountDeletion, finishInteractiveAuth, inspectPendingAccountDeletion, legalStatus, passwordAuthorization, pendingPath, restorePersistedAccount, restoring, revokeAllAndClear, service, session, setAccountDeletionState, setSessionSnapshot, uiAcceptanceMode]);

  const applyLegalStatus = useCallback((next: LegalConsentStatus) => {
    if (next.accountId !== activeAccountIdRef.current || !sessionRef.current) return;
    legalStatusRef.current = next;
    setLegalStatus(next);
  }, []);

  return <AuthContext.Provider value={value}>
    {accountRestoreUnavailable && session && !accountDeletionPending
      ? <AccountRestoreState retry={value.retryAccountRestore} signOut={value.signOut} /> : children}
    <LegalConsentGate accountId={accountReady && !restoring && !uiAcceptanceMode ? account?.accountId : undefined}
      onSignOut={value.signOut} onStatus={applyLegalStatus} status={legalStatus} />
  </AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
