import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import {
  archiveAndBindEmptyLearningSync,
  bindEmptyLearningSync,
  bindLearningSync,
  clearPersonalLearningData,
  inspectLearningSyncBinding,
  runLearningSync,
  setLearningSyncActiveUser,
} from '@/features/sync/learning-sync';
import { apiRequest, setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';
import { colors, radii, spacing } from '@/theme';

import { getAuthService, type AppSession } from './auth-service.web';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from './ui-acceptance-mode';

type AuthContextValue = {
  configured: boolean;
  mode: 'invite' | 'phone-otp';
  accountReady: boolean;
  canAccessApp: boolean;
  restoring: boolean;
  session?: AppSession;
  uiAcceptanceAvailable: boolean;
  uiAcceptanceMode: boolean;
  consumePendingPath(): string | undefined;
  enterUiAcceptanceMode(): void;
  exitUiAcceptanceMode(): void;
  rememberPendingPath(path: string): void;
  signIn(inviteCode: string): Promise<void>;
  requestPhoneOtp(phone: string): Promise<void>;
  verifyPhoneOtp(phone: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  deleteAccount(inviteCode: string): Promise<void>;
};

const unavailable = async () => { throw new Error('auth_not_configured'); };
const AuthContext = createContext<AuthContextValue>({
  configured: false,
  mode: 'invite',
  accountReady: false,
  canAccessApp: false,
  restoring: false,
  uiAcceptanceAvailable: false,
  uiAcceptanceMode: false,
  consumePendingPath: () => undefined,
  enterUiAcceptanceMode: () => undefined,
  exitUiAcceptanceMode: () => undefined,
  rememberPendingPath: () => undefined,
  signIn: unavailable,
  requestPhoneOtp: unavailable,
  verifyPhoneOtp: unavailable,
  signOut: unavailable,
  signOutAll: unavailable,
  deleteAccount: unavailable,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAuthService(), []);
  const cloudSyncEnabled = service?.mode === 'phone-otp';
  const [restoring, setRestoring] = useState(Boolean(service));
  const [session, setSession] = useState<AppSession>();
  const [accountReady, setAccountReady] = useState(false);
  const [bindingPrompt, setBindingPrompt] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [pendingPath, setPendingPath] = useState<string>();
  const [uiAcceptanceMode, setUiAcceptanceMode] = useState(false);

  useEffect(() => {
    if (!service) return;
    let active = true;
    setApiAccessTokenProvider(async () => (await service.getSession())?.accessToken);
    setApiAuthRecovery({
      refresh: async () => {
        const next = await service.refreshSession();
        if (cloudSyncEnabled) setLearningSyncActiveUser(next?.user.id);
        if (active) setSession(next);
        return next?.accessToken;
      },
      onInvalidated: async () => {
        if (cloudSyncEnabled) setLearningSyncActiveUser(undefined);
        await service.signOut('local').catch(() => undefined);
        await clearLocalAiConsent().catch(() => undefined);
        if (active) {
          setSession(undefined);
          setAccountReady(false);
        }
      },
    });
    const unsubscribe = service.onSessionChange((next) => {
      if (!active) return;
      if (cloudSyncEnabled) setLearningSyncActiveUser(next?.user.id);
      setSession(next);
      if (next) setUiAcceptanceMode(false);
      else setAccountReady(false);
    });
    void service.getSession()
      .then((next) => {
        if (!active) return;
        if (cloudSyncEnabled) setLearningSyncActiveUser(next?.user.id);
        setSession(next);
      })
      .finally(() => { if (active) setRestoring(false); });
    if (AppState.currentState === 'active') service.startAutoRefresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        service.startAutoRefresh();
        if (cloudSyncEnabled) void runLearningSync().catch(() => undefined);
      } else service.stopAutoRefresh();
    });
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
      service.stopAutoRefresh();
      if (cloudSyncEnabled) setLearningSyncActiveUser(undefined);
      setApiAccessTokenProvider(undefined);
      setApiAuthRecovery(undefined);
    };
  }, [cloudSyncEnabled, service]);

  useEffect(() => {
    if (!cloudSyncEnabled) {
      setAccountReady(Boolean(session));
      setBindingPrompt(false);
      return;
    }
    const userId = session?.user.id;
    setLearningSyncActiveUser(userId);
    if (!userId) {
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
        return;
      }
      await bindEmptyLearningSync(userId);
      if (active) {
        setBindingPrompt(false);
        setAccountReady(true);
      }
    }).catch(() => { if (active) setAccountReady(false); });
    return () => { active = false; };
  }, [cloudSyncEnabled, session]);

  async function confirmBinding() {
    const userId = session?.user.id;
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
    const userId = session?.user.id;
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
    if (!service) return unavailable();
    if (cloudSyncEnabled) {
      await apiRequest<{ revoked: true }>('/v1/account/sessions/revoke-all', { method: 'POST' });
    }
    await service.signOut('local').catch(() => undefined);
    await clearLocalAiConsent().catch(() => undefined);
    setSession(undefined);
    setAccountReady(false);
  }, [cloudSyncEnabled, service]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(service),
    mode: service?.mode ?? 'invite',
    accountReady,
    canAccessApp: Boolean(session) || uiAcceptanceMode,
    restoring,
    session,
    uiAcceptanceAvailable: UI_ACCEPTANCE_MODE_AVAILABLE,
    uiAcceptanceMode,
    consumePendingPath() {
      const value = pendingPath;
      setPendingPath(undefined);
      return value;
    },
    enterUiAcceptanceMode() {
      if (!UI_ACCEPTANCE_MODE_AVAILABLE) return;
      if (cloudSyncEnabled) setLearningSyncActiveUser(undefined);
      setAccountReady(false);
      setUiAcceptanceMode(true);
    },
    exitUiAcceptanceMode() {
      setUiAcceptanceMode(false);
      setPendingPath(undefined);
    },
    rememberPendingPath(path) {
      if (!path.startsWith('/auth/') && !path.startsWith('/legal/')) setPendingPath(path);
    },
    async signIn(inviteCode) {
      if (!service) return unavailable();
      setAccountReady(false);
      setUiAcceptanceMode(false);
      setSession(await service.signInWithInviteCode(inviteCode));
    },
    async requestPhoneOtp(phone) {
      if (!service) return unavailable();
      await service.requestPhoneOtp(phone);
    },
    async verifyPhoneOtp(phone, token) {
      if (!service) return unavailable();
      setAccountReady(false);
      setUiAcceptanceMode(false);
      setSession(await service.verifyPhoneOtp(phone, token));
    },
    async signOut() {
      if (!service) return unavailable();
      await service.signOut('local');
      await clearLocalAiConsent().catch(() => undefined);
      if (cloudSyncEnabled) setLearningSyncActiveUser(undefined);
      setSession(undefined);
      setAccountReady(false);
    },
    async signOutAll() {
      await revokeAllAndClear();
    },
    async deleteAccount() {
      if (!service) return unavailable();
      if (cloudSyncEnabled) throw new Error('account_deletion_requires_app');
      await service.signOut('local');
      await clearPersonalLearningData();
      setSession(undefined);
      setAccountReady(false);
    },
  }), [accountReady, cloudSyncEnabled, pendingPath, restoring, revokeAllAndClear, service, session, uiAcceptanceMode]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AppModal animationType="fade" onRequestClose={() => undefined} transparent visible={bindingPrompt}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <AppText variant="sectionTitle">选择本机学习数据归属</AppText>
            <AppText>此浏览器已有其他账号的学习数据。请选择合并到当前账号，或保存本地归档并从当前账号的云端数据开始。</AppText>
            {bindingError ? <AppText color={colors.destructive} variant="caption">{bindingError}</AppText> : null}
            <Button disabled={binding} onPress={() => void confirmBinding()}>{binding ? '正在处理…' : '合并到当前账号并同步'}</Button>
            <Button disabled={binding} onPress={() => void archiveBinding()} variant="outline">本地归档并从云端开始</Button>
          </View>
        </View>
      </AppModal>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
});

export function useAuth() {
  return useContext(AuthContext);
}
