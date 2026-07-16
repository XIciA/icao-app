import { usePathname, useRouter } from 'expo-router';
import { Headphones, Pause, Play, SkipForward, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, radii, shadows, spacing } from '@/theme';

import { useRadioPlayer } from './RadioPlayerProvider';

export function RadioMiniPlayer() {
  const radio = useRadioPlayer();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const track = radio.currentTrack;
  const stopAndClear = radio.stopAndClear;
  useEffect(() => {
    if (!auth.restoring && !auth.session) stopAndClear();
  }, [auth.restoring, auth.session, stopAndClear]);
  const hidden = !auth.session
    || !radio.sessionVisible
    || !track
    || pathname === '/content/radio'
    || pathname.includes('/study/')
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/legal/');
  if (hidden || !track) return null;
  const onTabs = pathname === '/' || pathname.startsWith('/discover') || pathname.startsWith('/profile');

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="返回随身听"
        onPress={() => router.push('/content/radio')}
        style={({ pressed }) => [styles.shell, { bottom: onTabs ? Math.max(insets.bottom + 72, 86) : Math.max(insets.bottom + spacing[3], spacing[4]) }, pressed ? styles.pressed : null]}
      >
        <View style={styles.icon}><Headphones color={colors.primaryForeground} size={18} /></View>
        <View style={styles.copy}>
          <AppText color={colors.primary} numberOfLines={1} variant="micro">{radio.waitingForNext ? `间隔 · ${radio.intervalRemaining}s` : track.bankTitle}</AppText>
          <AppText numberOfLines={1} variant="button">{track.title}</AppText>
        </View>
        <Pressable accessibilityLabel={radio.playing ? '暂停随身听' : '播放随身听'} hitSlop={6} onPress={(event) => { event.stopPropagation(); void radio.toggle(); }} style={styles.action}>
          {radio.playing ? <Pause color={colors.foreground} fill={colors.foreground} size={19} /> : <Play color={colors.foreground} fill={colors.foreground} size={19} />}
        </Pressable>
        <Pressable accessibilityLabel="下一首" hitSlop={6} onPress={(event) => { event.stopPropagation(); void radio.next(true); }} style={styles.action}>
          <SkipForward color={colors.foreground} fill={colors.foreground} size={19} />
        </Pressable>
        <Pressable accessibilityLabel="关闭随身听" hitSlop={6} onPress={(event) => { event.stopPropagation(); radio.stopAndClear(); }} style={styles.close}>
          <X color={colors.mutedForeground} size={15} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.primary20, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2], left: spacing[4], minHeight: 66, paddingHorizontal: spacing[3], paddingVertical: spacing[2], position: 'absolute', right: spacing[4], ...shadows.floating },
  pressed: { transform: [{ scale: 0.99 }] },
  icon: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.lg, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1, gap: 1, minWidth: 0 },
  action: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 34 },
  close: { alignItems: 'center', height: 32, justifyContent: 'center', width: 24 },
});
