import { Image } from 'expo-image';
import { AlertCircle, ImageIcon, RotateCcw } from '@/components/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';

const loadTimeoutMillis = 12_000;

export function ImageQuestionCard({
  imagePath,
  imageAlt,
  onDisplayed,
}: {
  imagePath: string;
  imageAlt: string;
  onDisplayed?: () => void;
}) {
  const asset = useQuestionBankAsset(imagePath);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'timeout'>('loading');
  const displayedPath = useRef<string | undefined>(undefined);

  useEffect(() => {
    setState('loading');
    const timeout = setTimeout(() => setState((current) => current === 'ready' || current === 'error' ? current : 'timeout'), loadTimeoutMillis);
    return () => clearTimeout(timeout);
  }, [asset.uri, attempt, imagePath]);

  useEffect(() => {
    if (!asset.resolving && !asset.uri) setState('error');
  }, [asset.resolving, asset.uri]);

  function handleLoad() {
    setState('ready');
    if (displayedPath.current !== imagePath) {
      displayedPath.current = imagePath;
      onDisplayed?.();
    }
  }

  function retry() {
    setState('loading');
    setAttempt((current) => current + 1);
    asset.retry();
  }

  const failed = state === 'error' || state === 'timeout';

  return (
    <View style={styles.root} testID="image-question-card">
      <View style={styles.heading}>
        <ImageIcon color={colors.mutedForeground} size={15} />
        <AppText variant="button">观察图片</AppText>
      </View>
      <View style={styles.frame}>
        {asset.uri && !failed ? (
          <Image
            accessible
            accessibilityLabel={imageAlt}
            cachePolicy="memory-disk"
            contentFit="contain"
            key={`${asset.uri}:${attempt}`}
            onError={() => setState('error')}
            onLoad={handleLoad}
            onLoadStart={() => setState('loading')}
            source={asset.uri}
            style={styles.image}
            testID="image-question-image"
          />
        ) : null}
        {state === 'loading' ? (
          <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.overlay}>
            <ActivityIndicator color={colors.primary} size="small" />
            <AppText color={colors.mutedForeground} variant="caption">正在加载图片…</AppText>
          </View>
        ) : null}
        {failed ? (
          <View accessibilityLiveRegion="polite" style={styles.error}>
            <AlertCircle color={colors.destructive} size={24} />
            <AppText variant="button">{state === 'timeout' ? '图片加载超时' : '图片加载失败'}</AppText>
            <AppText color={colors.mutedForeground} style={styles.errorCopy} variant="caption">
              {state === 'timeout' ? '连接可能已中断，请重新获取图片。' : '请检查网络后重试，题目进度不会丢失。'}
            </AppText>
            <Pressable accessibilityLabel="重试图片" onPress={retry} style={styles.retry}>
              <RotateCcw color={colors.destructive} size={15} />
              <AppText color={colors.destructive} variant="button">重试</AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
      <AppText color={colors.mutedForeground} style={styles.hint} variant="micro">图片将完整显示，可结合后续问题观察场景细节。</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, gap: spacing[3], padding: spacing[3] },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  frame: { aspectRatio: 1.5, backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, overflow: 'hidden', position: 'relative', width: '100%' },
  image: { height: '100%', width: '100%' },
  overlay: { alignItems: 'center', backgroundColor: colors.secondary, gap: spacing[2], height: '100%', justifyContent: 'center', position: 'absolute', width: '100%' },
  error: { alignItems: 'center', gap: spacing[2], height: '100%', justifyContent: 'center', padding: spacing[5] },
  errorCopy: { maxWidth: 260, textAlign: 'center' },
  retry: { alignItems: 'center', borderColor: colors.destructive, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], marginTop: spacing[1], minHeight: 36, paddingHorizontal: spacing[3] },
  hint: { textAlign: 'center' },
});
