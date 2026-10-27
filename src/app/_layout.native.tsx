import { EdgeBackRegion } from '@/components/navigation/EdgeBackRegion.native';
import { accountRouteIdentity, infoRouteIdentity } from '@/components/navigation/route-identity.native';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { useGuide } from '@/features/usage-guide/GuideBindings';
import { GuideTourProvider } from '@/features/usage-guide/GuideTourProvider';
import { Stack, SplashScreen, usePathname, useGlobalSearchParams, type ErrorBoundaryProps, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppViewport } from '@/components/platform/AppViewport';
import { ModalHost } from '@/components/platform/ModalHost';
import { EdgeOneAlertHost } from '@/components/platform/EdgeOneAlertHost';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { StartupBrandScreen } from '@/components/states/StartupBrandScreen';
import { AppText, Button, Screen } from '@/components/ui';
import { AccountRestoreState } from '@/features/auth/AccountRestoreState.native';
import { destinationWithQuery, isGuestPublicPath, isPublicStackScreen, postLoginDestination } from '@/features/auth/guest-access';
import { appErrorBoundaryDescription, includeNativeProtectedRoutes } from '@/config/native-route-surface';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { AppRuntime } from '@/platform/AppRuntime';
import { useAppFonts } from '@/platform/use-app-fonts';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  if (!fontsLoaded && !fontError) return <StartupBrandScreen />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppViewport>
        <ModalHost>
          <EdgeOneAlertHost />
          <SafeAreaProvider>
            <AuthProvider>
              <AppRuntime>
                <View style={styles.root}>
                  <StatusBar backgroundColor={colors.background} style="dark" />
                  <GuideTourProvider><AppStack /></GuideTourProvider>
                </View>
              </AppRuntime>
            </AuthProvider>
          </SafeAreaProvider>
        </ModalHost>
      </AppViewport>
    </GestureHandlerRootView>
  );
}

export function AppStack() {
  const guide = useGuide();
  const auth = useAuth();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const checkPending = useRef(false);
  async function checkAccount(action: () => Promise<void>) {
    if (checkPending.current) return;
    checkPending.current = true; setChecking(true); setCheckFailed(false);
    try { await action(); } catch { setCheckFailed(true); }
    finally { checkPending.current = false; setChecking(false); }
  }
  const authRedirectInFlightRef = useRef(false);
  const publicPage = isGuestPublicPath(pathname);
  const previousPathRef = useRef(pathname);
  const previouslyAuthenticatedRef = useRef(auth.canAccessApp);
  const continueBrowsing = () => { auth.consumePendingPath(); router.replace('/(tabs)'); };
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void SplashScreen.hideAsync().catch(() => undefined); });
    return () => cancelAnimationFrame(frame);
  }, [auth.restoring, publicPage]);

  useEffect(() => {
    // The browser's Back action also cancels the pending login intent. Do not
    // clear it just because rememberPendingPath changed on the source screen.
    const previous = previousPathRef.current;
    previousPathRef.current = pathname;
    if (!auth.canAccessApp && previous.startsWith('/auth/') && publicPage && !pathname.startsWith('/legal/')) {
      auth.consumePendingPath();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const signedOut = previouslyAuthenticatedRef.current && !auth.canAccessApp;
    previouslyAuthenticatedRef.current = auth.canAccessApp;
    if (signedOut && !publicPage && !pathname.startsWith('/auth/')) {
      auth.consumePendingPath();
      router.replace('/(tabs)');
      return;
    }
    if (auth.restoring || auth.canAccessApp || auth.accountRestoreUnavailable || auth.accountDeletionPending
      || publicPage || pathname.startsWith('/auth/')) return;
    const destination = destinationWithQuery(pathname, searchParams);
    auth.rememberPendingPath(destination);
    // Replace the blocked deep link so cancelling login cannot return to a
    // protected page and immediately open login again.
    router.replace({ pathname: '/auth/[slug]', params: { slug: 'login', next: destination, intent: 'external', returnTo: '/(tabs)' } });
  }, [auth, pathname, publicPage, router, searchParams]);

  useEffect(() => {
    if (!auth.restoring && auth.canAccessApp && pathname?.startsWith('/auth/')) {
      if (authRedirectInFlightRef.current) return;
      authRedirectInFlightRef.current = true;
      auth.consumePendingPath();
      // Recovery retains its credential-reset flow; ordinary login opens the banks.
      router.replace((auth.passwordChangePurpose === 'recovery' ? '/account/password?mode=recovery' : postLoginDestination(searchParams)) as Href);
      return;
    }
    authRedirectInFlightRef.current = false;
  }, [auth, pathname, router, searchParams]);

  // Keep the navigator mounted while account checks fail or run. This makes
  // “continue browsing” usable even on a cold-start private deep link.
  const accountState = auth.restoring ? <GlobalLoadingScreen />
    : auth.accountRestoreUnavailable ? <AccountRestoreState retry={auth.retryAccountRestore} signOut={auth.signOut} onBrowse={continueBrowsing} />
    : auth.accountDeletionPending ? <Screen><CenteredState
        actionLabel={checking ? "正在检查…" : "重新检查"}
        description="删除任务正在安全处理。完成前此账号不能继续使用；你可以先浏览题库目录。"
        onAction={() => { void checkAccount(auth.resumeAccountDeletion); }}
        title={checkFailed ? "检查未完成，请稍后重试" : "账号正在注销"}
        secondary={<Button onPress={continueBrowsing} variant="ghost">继续浏览题库</Button>}
      /></Screen> : undefined;

  return (
    <View style={styles.root}>
      <Stack
            screenLayout={({ children, navigation, route }) => {
              if (accountState && (route.name === 'auth/[slug]' || !isPublicStackScreen(route.name, route.params))) return accountState;
              // Never mount a protected page (or its data hooks) for a guest.
              if ((!auth.canAccessApp && !isPublicStackScreen(route.name, route.params)) || (auth.canAccessApp && route.name === 'auth/[slug]')) return <GlobalLoadingScreen />;
              return Platform.OS === 'ios'
                ? <EdgeBackRegion enabled={!['index', '(tabs)', 'auth/[slug]'].includes(route.name)} navigation={navigation}>{children}</EdgeBackRegion>
                : children;
            }}
            screenListeners={{ transitionStart: () => guide?.suspend(true), transitionEnd: () => guide?.suspend(false) }}
            screenOptions={{
              animation: 'slide_from_right',
              animationDuration: 220,
              contentStyle: { backgroundColor: colors.background },
              fullScreenGestureEnabled: false,
              gestureDirection: 'horizontal',
              gestureEnabled: Platform.OS !== 'ios',
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'fade', gestureEnabled: false }} />
              <Stack.Screen name="auth/[slug]" options={{ gestureEnabled: false }} />
            <Stack.Screen name="legal/[slug]" />
            <Stack.Screen name="download" />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade', fullScreenGestureEnabled: false, gestureEnabled: false }} />
              <Stack.Screen name="question-bank/[bankId]/index" />
              <Stack.Screen
                name="question-bank/[bankId]/study/[categoryId]/[topicId]"
                options={{ gestureEnabled: Platform.OS !== 'ios' }}
              />
              <Stack.Screen name="learning-records" />
              <Stack.Screen name="annotations" />
              <Stack.Screen name="word-favorites" />
              <Stack.Screen name="content/[slug]" />
              {includeNativeProtectedRoutes ? <Stack.Screen name="content/hotspot/[briefId]" /> : null}
              {includeNativeProtectedRoutes ? (
                <Stack.Screen
                  name="content/hotspot/[briefId]/study"
                  options={{ gestureEnabled: Platform.OS !== 'ios' }}
                />
              ) : null}
              <Stack.Screen name="content/resources/[articleSlug]" />
              <Stack.Screen name="account/[slug]" dangerouslySingular={accountRouteIdentity} />
              <Stack.Screen name="info/[slug]" dangerouslySingular={infoRouteIdentity} />
      </Stack>
      <UiAcceptanceBadge />
    </View>
  );
}

function UiAcceptanceBadge() {
  const auth = useAuth();
  const router = useRouter();
  if (!auth.uiAcceptanceMode) return null;
  return (
    <Pressable
      accessibilityLabel="退出 UI 验收模式"
      accessibilityRole="button"
      onPress={() => {
        auth.exitUiAcceptanceMode();
        router.replace('/auth/login');
      }}
      style={({ pressed }) => [styles.acceptanceBadge, pressed ? styles.acceptanceBadgePressed : null]}
    >
      <AppText color={colors.accentForeground} variant="micro">UI 验收模式 · 退出</AppText>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <View style={styles.errorRoot}>
        <CenteredState
          actionLabel="重新加载"
          description={appErrorBoundaryDescription(error)}
          onAction={retry}
          title="页面加载失败"
          tone="destructive"
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorRoot: { backgroundColor: colors.background, flex: 1 },
  acceptanceBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 100,
  },
  acceptanceBadgePressed: { opacity: 0.8 },
});
