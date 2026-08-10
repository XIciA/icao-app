import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { apiFetch, apiRequest, setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';
import { archiveAndBindEmptyLearningSync, bindEmptyLearningSync, bindLearningSync, clearPersonalLearningData, inspectLearningSyncBinding, runLearningSync, setLearningSyncActiveUser } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';

import { getAuthService, type AppSession } from './auth-service';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from './ui-acceptance-mode';

type AuthContextValue = {
  configured: boolean;
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
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  deleteAccount(inviteCode: string): Promise<void>;
};

const unavailable = async () => { throw new Error('auth_not_configured'); };
const AuthContext = createContext<AuthContextValue>({
  configured: false,
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
  signOut: unavailable,
  signOutAll: unavailable,
  deleteAccount: unavailable,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAuthService(), []);
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
        setLearningSyncActiveUser(next?.user.id);
        setSession(next);
        return next?.accessToken;
      },
      onInvalidated: async () => {
        setLearningSyncActiveUser(undefined);
        await service.signOut('local').catch(() => undefined);
        await clearLocalAiConsent().catch(() => undefined);
        setSession(undefined);
        setAccountReady(false);
      },
    });
    const unsubscribe = service.onSessionChange((next) => {
      if (active) {
        setLearningSyncActiveUser(next?.user.id);
        setSession(next);
        if (next) setUiAcceptanceMode(false);
        if (!next) setAccountReady(false);
      }
    });
    void service.getSession().then((next) => {
      if (active) {
        setLearningSyncActiveUser(next?.user.id);
        setSession(next);
      }
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
  }, [service]);

  useEffect(() => {
    setLearningSyncActiveUser(session?.user.id);
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
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
  }, [session?.user.id]);

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
    await apiRequest<{ revoked: true }>('/v1/account/sessions/revoke-all', { method: 'POST' });
    await service?.signOut('local').catch(() => undefined);
    await clearLocalAiConsent().catch(() => undefined);
    setSession(undefined);
    setAccountReady(false);
  }, [service]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(service),
    accountReady,
    canAccessApp: Boolean(session) || uiAcceptanceMode,
    restoring,
    session,
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
    async signIn(inviteCode) { if (!service) return unavailable(); setAccountReady(false); setUiAcceptanceMode(false); setSession(await service.signInWithInviteCode(inviteCode)); },
    async signOut() { if (!service) return unavailable(); await service.signOut('local'); await clearLocalAiConsent().catch(() => undefined); setSession(undefined); setAccountReady(false); },
    async signOutAll() { if (!service) return unavailable(); await revokeAllAndClear(); },
    async deleteAccount(inviteCode) {
      if (!service) return unavailable();
      const response = await apiFetch('/v1/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode, confirmation: '注销账号' }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as { error?: { code?: string } } | undefined;
        throw new Error(body?.error?.code ?? `api_http_${response.status}`);
      }
      await service.signOut('local').catch(() => undefined);
      await clearLocalAiConsent().catch(() => undefined);
      await clearPersonalLearningData();
      setSession(undefined);
      setAccountReady(false);
    },
  }), [accountReady, pendingPath, restoring, revokeAllAndClear, service, session, uiAcceptanceMode]);

  return <AuthContext.Provider value={value}>{children}<AppModal animationType="fade" onRequestClose={() => undefined} transparent visible={bindingPrompt}><View style={styles.overlay}><View style={styles.dialog}><AppText variant="sectionTitle">选择本机学习数据归属</AppText><AppText>此设备已有旧版或其他账号的本机数据。继续前必须选择合并到当前账号，或保存本地归档并从当前账号的云端数据开始。</AppText>{bindingError ? <AppText color={colors.destructive} variant="caption">{bindingError}</AppText> : null}<Button disabled={binding} onPress={() => void confirmBinding()}>{binding ? '正在处理…' : '合并到当前账号并同步'}</Button><Button disabled={binding} onPress={() => void archiveBinding()} variant="outline">本地归档并从云端开始</Button></View></View></AppModal></AuthContext.Provider>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
});

export function useAuth() {
  return useContext(AuthContext);
}
