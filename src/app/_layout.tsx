import { Stack, SplashScreen, usePathname, useRouter, type ErrorBoundaryProps, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppViewport } from '@/components/platform/AppViewport';
import { ModalHost } from '@/components/platform/ModalHost';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { AppText } from '@/components/ui';
import { appErrorBoundaryDescription, includeNativeProtectedRoutes } from '@/config/native-route-surface';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { AppRuntime } from '@/platform/AppRuntime';
import { useAppFonts } from '@/platform/use-app-fonts';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return <GlobalLoadingScreen />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppViewport>
        <ModalHost>
          <SafeAreaProvider>
            <AuthProvider>
              <AppRuntime>
                <View style={styles.root}>
                  <StatusBar backgroundColor={colors.background} style="dark" />
                  <AppStack />
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
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const authRedirectInFlightRef = useRef(false);

  useEffect(() => {
    if (!auth.restoring && !auth.canAccessApp && pathname && pathname !== '/' && !pathname.startsWith('/auth/') && !pathname.startsWith('/legal/')) {
      auth.rememberPendingPath(pathname);
    }
  }, [auth, pathname]);

  useEffect(() => {
    if (!auth.restoring && auth.canAccessApp && pathname?.startsWith('/auth/')) {
      if (authRedirectInFlightRef.current) return;
      authRedirectInFlightRef.current = true;
      router.replace((auth.consumePendingPath() ?? '/(tabs)') as Href);
      return;
    }
    authRedirectInFlightRef.current = false;
  }, [auth, pathname, router]);

  if (auth.restoring) return <GlobalLoadingScreen />;
  if (auth.accountRestoreUnavailable) {
    return (
      <CenteredState
        actionLabel="重新检查"
        description="暂时无法读取本机安全登录状态，或无法向服务器确认账号请求。为保护账号与本机数据，确认成功前不会进入业务页面。"
        onAction={() => { void auth.retryAccountRestore().catch(() => undefined); }}
        title="暂时无法确认账号状态"
      />
    );
  }
  if (auth.accountDeletionPending) {
    return (
      <CenteredState
        actionLabel="重新检查"
        description="删除任务正在安全处理。完成前此账号不能继续使用；你可以关闭 App，稍后重新打开会自动继续检查。"
        onAction={() => { void auth.resumeAccountDeletion().catch(() => undefined); }}
        title="账号正在注销"
      />
    );
  }

  return (
    <View style={styles.root}>
      <Stack
            screenOptions={{
              animation: 'slide_from_right',
              animationDuration: 220,
              contentStyle: { backgroundColor: colors.background },
              fullScreenGestureEnabled: true,
              gestureEnabled: true,
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Protected guard={!auth.canAccessApp}>
              <Stack.Screen name="auth/[slug]" options={{ gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Screen name="legal/[slug]" />
            <Stack.Protected guard={auth.canAccessApp}>
              <Stack.Screen name="(tabs)" options={{ animation: 'fade', fullScreenGestureEnabled: false, gestureEnabled: false }} />
              <Stack.Screen name="question-bank/[bankId]/index" />
              <Stack.Screen
                name="question-bank/[bankId]/study/[categoryId]/[topicId]"
                options={{ fullScreenGestureEnabled: false, gestureEnabled: false }}
              />
              <Stack.Screen name="learning-records" />
              <Stack.Screen name="annotations" />
              <Stack.Screen name="word-favorites" />
              <Stack.Screen name="content/[slug]" />
              {includeNativeProtectedRoutes ? (
                <>
                  <Stack.Screen name="content/hotspot/[briefId]" />
                  <Stack.Screen
                    name="content/hotspot/[briefId]/study"
                    options={{ fullScreenGestureEnabled: false, gestureEnabled: false }}
                  />
                </>
              ) : null}
              <Stack.Screen name="content/resources/[articleSlug]" />
              <Stack.Screen name="account/[slug]" />
              <Stack.Screen name="info/[slug]" />
            </Stack.Protected>
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
