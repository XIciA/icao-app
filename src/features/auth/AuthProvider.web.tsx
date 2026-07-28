import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { clearPersonalLearningData } from '@/features/sync/learning-sync';
import { setApiAccessTokenProvider, setApiAuthRecovery } from '@/platform/api-client';

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
  const service = useMemo(() => getAuthService(), [])!;
  const [restoring, setRestoring] = useState(true);
  const [session, setSession] = useState<AppSession>();
  const [pendingPath, setPendingPath] = useState<string>();
  const [uiAcceptanceMode, setUiAcceptanceMode] = useState(false);

  useEffect(() => {
    let active = true;
    setApiAccessTokenProvider(async () => (await service.getSession())?.accessToken);
    setApiAuthRecovery({
      refresh: async () => (await service.refreshSession())?.accessToken,
      onInvalidated: async () => {
        await service.signOut('local').catch(() => undefined);
        if (active) setSession(undefined);
      },
    });
    const unsubscribe = service.onSessionChange((next) => {
      if (active) setSession(next);
    });
    void service.getSession()
      .then((next) => { if (active) setSession(next); })
      .finally(() => { if (active) setRestoring(false); });
    return () => {
      active = false;
      unsubscribe();
      setApiAccessTokenProvider(undefined);
      setApiAuthRecovery(undefined);
    };
  }, [service]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: true,
    accountReady: Boolean(session) || uiAcceptanceMode,
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
      setSession(undefined);
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
      setUiAcceptanceMode(false);
      setSession(await service.signInWithInviteCode(inviteCode));
    },
    async signOut() {
      await service.signOut('local');
      setSession(undefined);
    },
    async signOutAll() {
      await service.signOut('local');
      setSession(undefined);
    },
    async deleteAccount() {
      await service.signOut('local');
      await clearPersonalLearningData();
      setSession(undefined);
    },
  }), [pendingPath, restoring, service, session, uiAcceptanceMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
