import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Info, LogOut, Shield, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { useAuth } from '@/features/auth/AuthProvider';
import { readAnnotationStore } from '@/features/question-bank/annotations/annotation-store';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { loadWebContentRelease } from '@/features/web-content/release';
import { colors, radii, spacing } from '@/theme';

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  if (slug === 'settings') return <SettingsPage />;
  return <ExperienceAccountPage />;
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return <Screen contentStyle={styles.screen}><TopBar title={title} />{children}</Screen>;
}

function ExperienceAccountPage() {
  const auth = useAuth();
  const [counts, setCounts] = useState({ annotations: 0, records: 0 });
  const [contentRelease, setContentRelease] = useState('读取中…');
  useEffect(() => {
    let active = true;
    void Promise.all([sqliteLearningStore.getRecords(), readAnnotationStore(), loadWebContentRelease()])
      .then(([records, annotations, release]) => {
        if (active) setCounts({ records: records.length, annotations: Object.keys(annotations.entries).length });
        if (active) setContentRelease(release.releaseId ?? '已发布');
      })
      .catch(() => { if (active) setContentRelease('暂不可用'); });
    return () => { active = false; };
  }, []);
  return (
    <Page title="Web 体验账号">
      <View style={styles.hero}>
        <View style={styles.avatar}><UserRound color={colors.primary} size={30} /></View>
        <AppText variant="pageTitle">{auth.session?.user.displayName ?? '飞行学员'}</AppText>
        <Tag>Web 体验版</Tag>
      </View>
      <View style={styles.content}>
        <Card style={styles.notice}>
          <AppText variant="button">数据保存在当前浏览器</AppText>
          <AppText variant="caption">不与 iOS、Android 同步；清理浏览器数据或更换设备后记录会丢失。</AppText>
        </Card>
        <Card style={styles.rows}>
          <Row icon={Bookmark} label="本机标注与笔记" value={`${counts.annotations} 项`} />
          <Row icon={Info} label="本机学习记录" value={`${counts.records} 条`} />
          <Row icon={Info} label="内容镜像" value={contentRelease} />
          <Row icon={Shield} label="完整账户与云同步" value="体验版不提供" />
        </Card>
        <AppText variant="caption">App 是正式学习产品；网页用于独立体验核心题库、音频和 AI 能力。</AppText>
      </View>
    </Page>
  );
}

function SettingsPage() {
  const auth = useAuth();
  const router = useRouter();
  async function signOut() {
    await auth.signOut();
    router.replace('/auth/login');
  }
  return (
    <Page title="设置">
      <View style={styles.content}>
        <Card style={styles.notice}>
          <AppText variant="button">Web 体验版</AppText>
          <AppText variant="caption">版本 {APP_DISPLAY_VERSION} · 本机保存 · 不提供云同步和完整账号管理。</AppText>
        </Card>
        <Button leading={<LogOut color={colors.destructive} size={16} />} onPress={() => void signOut()} variant="outline">退出当前浏览器</Button>
      </View>
    </Page>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Info; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Icon color={colors.primary} size={17} />
      <AppText style={styles.flex} variant="button">{label}</AppText>
      <AppText variant="caption">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  hero: { alignItems: 'center', gap: spacing[2], padding: spacing[5] },
  avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 70, justifyContent: 'center', width: 70 },
  content: { gap: spacing[4], padding: spacing[5] },
  notice: { gap: spacing[2] },
  rows: { gap: 0, paddingVertical: 0 },
  row: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], minHeight: 58 },
  flex: { flex: 1 },
});
