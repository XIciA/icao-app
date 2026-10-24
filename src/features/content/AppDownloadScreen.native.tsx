import { Link, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { APP_UPDATE_MANIFEST_URL, newerAppUpdate, parseAppUpdates, type AppUpdate } from '@/features/app-updates/update-model';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppBrandLogo } from '@/components/brand/AppBrandLogo';
import { TopBar } from '@/components/navigation/TopBar';
import { useWebLayout } from '@/components/platform/web-layout';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { BookOpen, Headphones, Sparkles } from '@/components/ui/icons';
import { colors, radii, spacing } from '@/theme';

export const APP_STORE_DOWNLOAD_URL = 'https://apps.apple.com/cn/app/id6800583111';
const androidDownloadCandidate = process.env.EXPO_PUBLIC_ICAO_ANDROID_DOWNLOAD_URL ?? '';
export const ANDROID_DOWNLOAD_URL = /^https:\/\/cloud\.readyoufife\.com\/storage\/v1\/object\/public\/app-releases\/android\/[A-Za-z0-9._-]+\.apk$/u.test(androidDownloadCandidate)
  ? androidDownloadCandidate : undefined;
const features = [
  { Icon: BookOpen, label: '题库练习' },
  { Icon: Headphones, label: '随身听' },
  { Icon: Sparkles, label: 'AI 辅助' },
];

function PlatformMark({ apple = false, color = colors.foreground }: { apple?: boolean; color?: string }) {
  return apple ? (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color} aria-hidden>
      <Path d="M16.7 12.6c0-2 1.6-3.1 1.7-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.8.9-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.1 2.6 2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.6 1.2 0 1.9-1 2.6-2 .8-1.1 1.2-2.2 1.2-2.3-.1 0-2.4-.9-2.4-3.5ZM14.6 6.4c.6-.8 1.1-1.9 1-3-.9.1-2 .6-2.7 1.4-.6.7-1.2 1.9-1 2.9 1 .1 2.1-.5 2.7-1.3Z" />
    </Svg>
  ) : (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <Path d="M4 14a8 8 0 0 1 16 0v4H4Zm2-9L4 2m14 3 2-3" />
      <Path d="M8 11h.01M16 11h.01" strokeWidth={3} />
    </Svg>
  );
}

export function AppDownloadScreen({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const { isMobile } = useWebLayout();
  const usePublishedRelease = isEdgeOneProductionWeb();
  const [release, setRelease] = useState<AppUpdate>();
  const [testRelease, setTestRelease] = useState<AppUpdate>();
  const [downloadState, setDownloadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!usePublishedRelease) return;
    const controller = new AbortController();
    let active = true;
    setDownloadState('loading');
    const timeout = setTimeout(() => controller.abort(), 8000);
    void fetch(APP_UPDATE_MANIFEST_URL, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('download_manifest_unavailable');
        const releases = parseAppUpdates(await response.json());
        const published = newerAppUpdate(releases, 'android-apk', '0.0.0', '0');
        if (active) {
          setRelease(published);
          setTestRelease(newerAppUpdate(releases, 'android-test', '0.0.0', '0'));
          setDownloadState('ready');
        }
      })
      .catch(() => { if (active) setDownloadState('error'); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [usePublishedRelease, attempt]);
  const androidUrl = usePublishedRelease ? release?.url : ANDROID_DOWNLOAD_URL;
  const loadingDownload = usePublishedRelease && downloadState === 'loading';
  const failedDownload = usePublishedRelease && downloadState === 'error';
  return (
    <Screen scroll contentStyle={styles.screen} header={<TopBar title="听你五个 APP" onBack={onBack ?? (() => router.replace('/(tabs)/discover'))} right={testRelease ? <Link href={testRelease.url as Href} asChild><Pressable accessibilityRole="link" accessibilityLabel="下载 Android 测试版" style={{ padding: spacing[2] }}><AppText variant="caption" color={colors.mutedForeground}>Android 测试版</AppText></Pressable></Link> : undefined} />}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.logo}><AppBrandLogo size="lg" accessibilityLabel="听你五个 Logo" /></View>
          <AppText style={styles.eyebrow}>把学习，带在身边</AppText>
          <AppText variant="pageTitle" accessibilityRole="header" style={styles.title}>听你五个</AppText>
          <AppText style={styles.intro}>{'题库练习、随身听与 AI 辅助，\n陪你准备每一次 ICAO 考试。'}</AppText>
        </View>
        <View style={styles.features}>
          {features.map(({ Icon, label }) => (
            <View key={label} style={styles.feature}>
              <Icon size={18} color={colors.primary} />
              <AppText variant="caption" color={colors.mutedForeground}>{label}</AppText>
            </View>
          ))}
        </View>
        <View style={[styles.downloads, !isMobile && styles.downloadsWide]}>
          <Card style={styles.downloadCard}>
            <View style={styles.platformRow}>
              <View style={styles.platformIcon}><PlatformMark apple /></View>
              <View style={styles.platformCopy}><AppText variant="cardTitle">苹果下载</AppText><AppText variant="micro" color={colors.mutedForeground}>iPhone · iPad</AppText></View>
              <AppText variant="micro" style={styles.badge}>App Store</AppText>
            </View>
            <Link href={APP_STORE_DOWNLOAD_URL} asChild>
              <Pressable accessibilityRole="link" style={styles.appleButton}>
                <PlatformMark apple color={colors.primaryForeground} />
                <AppText variant="button" color={colors.primaryForeground}>前往 App Store</AppText>
              </Pressable>
            </Link>
            <AppText style={styles.hint}>在 App Store 下载与更新</AppText>
          </Card>
          <Card style={styles.downloadCard}>
            <View style={styles.platformRow}>
              <View style={styles.platformIcon}><PlatformMark /></View>
              <View style={styles.platformCopy}><AppText variant="cardTitle">安卓版</AppText><AppText variant="micro" color={colors.mutedForeground}>Android 手机</AppText></View>
              <AppText variant="micro" style={styles.badge}>{androidUrl ? (release ? `v${release.version}` : '正式版') : loadingDownload ? '查询中' : failedDownload ? '暂不可用' : '筹备中'}</AppText>
            </View>
            {androidUrl ? <Link href={androidUrl as Href} asChild>
              <Pressable accessibilityRole="link" style={styles.appleButton}>
                <PlatformMark color={colors.primaryForeground} />
                <AppText variant="button" color={colors.primaryForeground}>下载安卓 APK</AppText>
              </Pressable>
            </Link> : failedDownload ? <Button onPress={() => setAttempt((value) => value + 1)} variant="secondary" size="lg">重新获取下载链接</Button> : <Button disabled accessibilityState={{ disabled: true }} variant="secondary" size="lg" style={styles.comingSoon}>{loadingDownload ? '正在获取下载链接' : '敬请期待'}</Button>}
            <AppText style={styles.hint}>{androidUrl ? '下载后打开安装包，按系统提示安装' : loadingDownload ? '正在查询已发布版本' : failedDownload ? '下载信息加载失败，请重试' : '安卓版暂未开放下载'}</AppText>
          </Card>
        </View>
        <AppText style={styles.footer}>听你五个 · 航空英语学习助手</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing[5], paddingTop: spacing[10], paddingBottom: spacing[8] },
  hero: { alignItems: 'center' },
  logo: { marginBottom: spacing[5] },
  eyebrow: { color: colors.primary, fontSize: 12, letterSpacing: 2 },
  title: { fontSize: 32, lineHeight: 46, marginTop: spacing[2], marginBottom: spacing[3] },
  intro: { fontSize: 15, lineHeight: 28, textAlign: 'center', color: colors.mutedForeground },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[5], marginTop: spacing[6], marginBottom: spacing[8] },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
  downloads: { gap: spacing[4] },
  downloadsWide: { flexDirection: 'row', gap: spacing[5] },
  downloadCard: { flex: 1, padding: spacing[5], borderRadius: radii.xxl, gap: 0 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[5] },
  platformIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.secondary },
  platformCopy: { flex: 1, gap: spacing[1] },
  badge: { color: colors.mutedForeground, backgroundColor: colors.secondary, paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radii.sm },
  appleButton: { minHeight: 50, backgroundColor: colors.primary, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[4] },
  comingSoon: { opacity: 1 },
  hint: { color: colors.mutedForeground, fontSize: 11, lineHeight: 18, marginTop: spacing[3], textAlign: 'center' },
  footer: { color: colors.mutedForeground, fontSize: 11, textAlign: 'center', marginTop: spacing[8] },
});
