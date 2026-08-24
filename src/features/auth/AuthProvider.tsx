import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { AccountSummary } from '@icao/contracts';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { apiFetch, apiRequest, setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';
import { archiveAndBindEmptyLearningSync, bindEmptyLearningSync, bindLearningSync, clearPersonalLearningData, inspectLearningSyncBinding, runLearningSync, setLearningSyncActiveUser } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';

import { getAuthService, type AppSession, type PhoneBindingChallenge } from './auth-service';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from './ui-acceptance-mode';

type AuthContextValue = {
  configured: boolean;
  accountReady: boolean;
  canAccessApp: boolean;
  restoring: boolean;
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
  requestPhoneOtp(phone: string): Promise<void>;
  requestPasswordRecoveryOtp(phone: string): Promise<void>;
  verifyPhoneOtp(phone: string, token: string, purpose?: 'login' | 'recovery'): Promise<AppSession>;
  signInWithPhonePassword(phone: string, password: string): Promise<void>;
  updatePassword(password: string, currentPassword?: string): Promise<void>;
  requestPhoneBindingOtp(phone: string): Promise<PhoneBindingChallenge>;
  resendPhoneBindingOtp(challenge: PhoneBindingChallenge): Promise<void>;
  verifyPhoneBindingOtp(challenge: PhoneBindingChallenge, token: string): Promise<void>;
  signIn(inviteCode: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  deleteAccount(): Promise<void>;
};

const unavailable = async () => { throw new Error('auth_not_configured'); };
const AuthContext = createContext<AuthContextValue>({
  configured: false,
  accountReady: false,
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
  deleteAccount: unavailable,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAuthService(), []);
  const [restoring, setRestoring] = useState(Boolean(service));
  const [session, setSession] = useState<AppSession>();
  const [account, setAccount] = useState<AccountSummary>();
  const [passwordAuthorization, setPasswordAuthorization] = useState<{
    accessToken: string;
    expiresAt: number;
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
  const accountInitializationRef = useRef<{
    promise: Promise<AccountSummary>;
    userId: string;
  } | undefined>(undefined);

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

  const acceptAuthenticatedSession = useCallback(async (next: AppSession) => {
    setSessionSnapshot(next);
    try {
      const resolved = await initializeInternalAccount(next);
      if (sessionRef.current?.user.id !== next.user.id) throw new Error('auth_request_not_completed');
      setAccount(resolved);
      setLearningSyncActiveUser(resolved.accountId);
      return next;
    } catch {
      if (!sessionRef.current || sessionRef.current.user.id === next.user.id) {
        await service?.signOut('local').catch(() => undefined);
        setSessionSnapshot(undefined, true);
      }
      throw new Error('auth_service_unavailable');
    }
  }, [initializeInternalAccount, service, setSessionSnapshot]);

  useEffect(() => {
    if (!service) return;
    let active = true;
    setApiAccessTokenProvider(async () => (await service.getSession())?.accessToken);
    setApiAuthRecovery({
      refresh: async () => {
        const next = await service.refreshSession();
        setSessionSnapshot(next);
        return next?.accessToken;
      },
      onInvalidated: async () => {
        await service.signOut('local').catch(() => undefined);
        await clearLocalAiConsent().catch(() => undefined);
        setSessionSnapshot(undefined, true);
        setPasswordAuthorization(undefined);
      },
    });
    const unsubscribe = service.onSessionChange((next) => {
      if (active) {
        setSessionSnapshot(next);
        if (next) setUiAcceptanceMode(false);
        if (next && !accountInitializationRef.current) {
          void acceptAuthenticatedSession(next).catch(() => undefined);
        }
      }
    });
    void service.getSession().then(async (next) => {
      if (!active) return;
      if (!next) {
        setSessionSnapshot(undefined, true);
        return;
      }
      await acceptAuthenticatedSession(next).catch(() => undefined);
    }).finally(() => { if (active) setRestoring(false); });
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
  }, [acceptAuthenticatedSession, service, setSessionSnapshot]);

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
      setAccountReady(false);
      setUiAcceptanceMode(false);
      setPasswordAuthorization(undefined);
      setAccount(undefined);
      await acceptAuthenticatedSession(await service.signInWithApple());
    },
    async requestPhoneOtp(phone) { if (!service) return unavailable(); await service.requestPhoneOtp(phone); },
    async requestPasswordRecoveryOtp(phone) { if (!service) return unavailable(); await service.requestPasswordRecoveryOtp(phone); },
    async verifyPhoneOtp(phone, token, purpose = 'login') {
      if (!service) return unavailable();
      setAccountReady(false);
      setUiAcceptanceMode(false);
      const next = await service.verifyPhoneOtp(phone, token);
      const passwordPurpose = purpose === 'recovery' ? 'recovery' : undefined;
      if (passwordPurpose) {
        try {
          const authorization = await service.authorizePasswordRecovery();
          setPasswordAuthorization({
            accessToken: next.accessToken,
            expiresAt: authorization.expiresAt,
            purpose: passwordPurpose,
            userId: next.user.id,
          });
        } catch (error) {
          await service.signOut('local').catch(() => undefined);
          setPasswordAuthorization(undefined);
          setSessionSnapshot(undefined, true);
          throw error;
        }
      } else setPasswordAuthorization(undefined);
      await acceptAuthenticatedSession(next);
      return next;
    },
    async signInWithPhonePassword(phone, password) {
      if (!service) return unavailable();
      setAccountReady(false);
      setUiAcceptanceMode(false);
      setPasswordAuthorization(undefined);
      await acceptAuthenticatedSession(await service.signInWithPhonePassword(phone, password));
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
      const next = await service.updatePassword(password, currentPassword);
      setPasswordAuthorization(undefined);
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
    async signOut() { if (!service) return unavailable(); await service.signOut('local'); await clearLocalAiConsent().catch(() => undefined); setPasswordAuthorization(undefined); setSessionSnapshot(undefined, true); },
    async signOutAll() { if (!service) return unavailable(); await revokeAllAndClear(); },
    async deleteAccount() {
      if (!service) return unavailable();
      const response = await apiFetch('/v1/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: '注销账号' }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as { error?: { code?: string } } | undefined;
        throw new Error(body?.error?.code ?? `api_http_${response.status}`);
      }
      await service.signOut('local').catch(() => undefined);
      await clearLocalAiConsent().catch(() => undefined);
      await clearPersonalLearningData();
      setPasswordAuthorization(undefined);
      setSessionSnapshot(undefined, true);
    },
  }), [acceptAuthenticatedSession, account, accountReady, passwordAuthorization, pendingPath, restoring, revokeAllAndClear, service, session, setSessionSnapshot, uiAcceptanceMode]);

  return <AuthContext.Provider value={value}>{children}<AppModal animationType="fade" onRequestClose={() => undefined} transparent visible={bindingPrompt}><View style={styles.overlay}><View style={styles.dialog}><AppText variant="sectionTitle">选择本机学习数据归属</AppText><AppText>此设备已有旧版或其他账号的本机数据。继续前必须选择合并到当前账号，或保存本地归档并从当前账号的云端数据开始。</AppText>{bindingError ? <AppText color={colors.destructive} variant="caption">{bindingError}</AppText> : null}<Button disabled={binding} onPress={() => void confirmBinding()}>{binding ? '正在处理…' : '合并到当前账号并同步'}</Button><Button disabled={binding} onPress={() => void archiveBinding()} variant="outline">本地归档并从云端开始</Button></View></View></AppModal></AuthContext.Provider>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
});

export function useAuth() {
  return useContext(AuthContext);
}
