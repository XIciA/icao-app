import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack, SplashScreen, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
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
    <SafeAreaProvider>
      <StatusBar backgroundColor={colors.background} style="dark" />
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
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="detail/[slug]" />
        <Stack.Screen name="question-bank/[bankId]/index" />
        <Stack.Screen name="question-bank/[bankId]/study/[categoryId]/[topicId]" />
      </Stack>
    </SafeAreaProvider>
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
  errorRoot: { backgroundColor: colors.background, flex: 1 },
});
