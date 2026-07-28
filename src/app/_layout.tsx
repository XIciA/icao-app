import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack, SplashScreen, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppViewport } from '@/components/platform/AppViewport';
import { ModalHost } from '@/components/platform/ModalHost';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { AppText } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { AppRuntime } from '@/platform/AppRuntime';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    NotoSerifSC_600SemiBold: require('../../assets/fonts/NotoSerifSC_600SemiBold.ttf'),
  });

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

  useEffect(() => {
    if (!auth.restoring && !auth.canAccessApp && pathname && pathname !== '/' && !pathname.startsWith('/auth/') && !pathname.startsWith('/legal/')) {
      auth.rememberPendingPath(pathname);
    }
  }, [auth, pathname]);

  if (auth.restoring) return <GlobalLoadingScreen />;

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
          description={__DEV__ ? error.message : '页面遇到异常，请稍后重新加载。'}
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
