import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { setApiAccessTokenProvider } from '@/platform/api-client';
import { bindEmptyLearningSync, bindLearningSync, inspectLearningSyncBinding, runLearningSync } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';

import { getAuthService, type AppSession } from './auth-service';

type AuthContextValue = {
  configured: boolean;
  restoring: boolean;
  session?: AppSession;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

const unavailable = async () => { throw new Error('auth_not_configured'); };
const AuthContext = createContext<AuthContextValue>({ configured: false, restoring: false, signIn: unavailable, signUp: unavailable, signOut: unavailable });

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => getAuthService(), []);
  const [restoring, setRestoring] = useState(Boolean(service));
  const [session, setSession] = useState<AppSession>();
  const [bindingPrompt, setBindingPrompt] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [dismissedUserId, setDismissedUserId] = useState<string>();

  useEffect(() => {
    if (!service) return;
    let active = true;
    setApiAccessTokenProvider(async () => (await service.getSession())?.accessToken);
    const unsubscribe = service.onSessionChange((next) => {
      if (active) {
        setSession(next);
        if (!next) setDismissedUserId(undefined);
      }
    });
    void service.getSession().then((next) => { if (active) setSession(next); }).finally(() => { if (active) setRestoring(false); });
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
      setApiAccessTokenProvider(undefined);
    };
  }, [service]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || dismissedUserId === userId) {
      setBindingPrompt(false);
      return;
    }
    let active = true;
    void inspectLearningSyncBinding(userId).then(async (inspection) => {
      if (!active) return;
      if (inspection.needsConfirmation) setBindingPrompt(true);
      else {
        await bindEmptyLearningSync(userId);
        if (active) setBindingPrompt(false);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [dismissedUserId, session?.user.id]);

  async function confirmBinding() {
    const userId = session?.user.id;
    if (!userId) return;
    setBinding(true);
    setBindingError('');
    try {
      await bindLearningSync(userId, 'upload-local');
      setBindingPrompt(false);
    } catch {
      setBindingError('绑定或首次同步失败，本机数据仍保留，可稍后重试。');
    } finally {
      setBinding(false);
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(service),
    restoring,
    session,
    async signIn(email, password) { if (!service) return unavailable(); setSession(await service.signInWithEmail(email, password)); },
    async signUp(email, password) { if (!service) return unavailable(); setSession(await service.signUpWithEmail(email, password)); },
    async signOut() { if (!service) return unavailable(); await service.signOut(); setSession(undefined); setDismissedUserId(undefined); },
  }), [restoring, service, session]);

  return <AuthContext.Provider value={value}>{children}<Modal animationType="fade" transparent visible={bindingPrompt}><View style={styles.overlay}><View style={styles.dialog}><AppText variant="sectionTitle">确认本机学习数据归属</AppText><AppText>此设备已有未归属的学习数据。确认后会先保留快照，再合并到当前邮箱账号；不会静默覆盖或删除本机数据。</AppText>{bindingError ? <AppText color={colors.destructive} variant="caption">{bindingError}</AppText> : null}<Button disabled={binding} onPress={() => void confirmBinding()}>{binding ? '正在绑定…' : '归入当前账号并同步'}</Button><Button disabled={binding} onPress={() => { setDismissedUserId(session?.user.id); setBindingPrompt(false); }} variant="outline">暂不启用同步</Button></View></View></Modal></AuthContext.Provider>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
});

export function useAuth() {
  return useContext(AuthContext);
}
