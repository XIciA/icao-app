import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, ChevronRight, Construction, LoaderCircle, Mic, RefreshCw, WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, spacing } from '@/theme';

type StateSlug = 'gallery' | 'microphone' | 'notifications' | 'offline' | 'load-failed' | 'maintenance' | 'loading';
const titles: Record<StateSlug, string> = { gallery: '权限与系统状态', microphone: '麦克风权限', notifications: '通知权限', offline: '无网络状态', 'load-failed': '加载失败', maintenance: '系统维护', loading: '全局加载' };

export function SystemStateScreen() {
  const { slug } = useLocalSearchParams<{ slug: StateSlug }>(); const page = titles[slug] ? slug : 'gallery';
  if (page === 'gallery') return <Gallery />;
  if (page === 'microphone') return <MicrophoneState />;
  if (page === 'notifications') return <NotificationState />;
  return <Preview page={page} />;
}

function Gallery() {
  const router = useRouter(); const items: { slug: StateSlug; label: string; note: string }[] = [{ slug: 'microphone', label: '麦克风权限', note: '真实读取与请求系统权限' }, { slug: 'notifications', label: '通知权限', note: '系统设置入口演示' }, { slug: 'offline', label: '无网络状态', note: '离线提示与重试' }, { slug: 'load-failed', label: '加载失败', note: '错误恢复交互' }, { slug: 'maintenance', label: '系统维护', note: '维护窗口提示' }, { slug: 'loading', label: '全局加载', note: '统一加载反馈' }];
  return <Screen scroll contentStyle={styles.screen}><TopBar title="权限与系统状态" /><View style={styles.intro}><AppText variant="pageTitle">状态覆盖</AppText><AppText>逐项验证权限、错误、离线、维护和加载体验。</AppText></View><Card style={styles.list}>{items.map((item, index) => <Pressable key={item.slug} onPress={() => router.push(`/state/${item.slug}`)} style={[styles.row, index > 0 ? styles.border : null]}><View style={styles.flex}><AppText variant="button">{item.label}</AppText><AppText variant="caption">{item.note}</AppText></View><ChevronRight color={colors.mutedForeground} size={18} /></Pressable>)}</Card></Screen>;
}

function MicrophoneState() {
  const [status, setStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  async function check() { const result = await getRecordingPermissionsAsync(); setStatus(result.granted ? 'granted' : 'denied'); }
  async function request() { const result = await requestRecordingPermissionsAsync(); setStatus(result.granted ? 'granted' : 'denied'); }
  useEffect(() => { void check(); }, []);
  return <Screen contentStyle={styles.screen}><TopBar title="麦克风权限" />{status === 'checking' ? <CenteredState description="正在读取操作系统权限…" icon={LoaderCircle} title="检查权限" /> : status === 'granted' ? <CenteredState description="已获得系统麦克风权限，可以进行本地口语录音练习。" icon={Mic} title="麦克风已开启" secondary={<Button onPress={() => void Linking.openSettings()} variant="ghost">打开系统设置</Button>} /> : <CenteredState actionLabel="请求麦克风权限" description="录音练习需要麦克风。若系统不再弹窗，请前往系统设置开启。" icon={Mic} onAction={() => void request()} title="需要麦克风权限" tone="accent" secondary={<Button onPress={() => void Linking.openSettings()} variant="ghost">前往系统设置</Button>} />}</Screen>;
}

function NotificationState() {
  return <Screen contentStyle={styles.screen}><TopBar title="通知权限" /><CenteredState actionLabel="打开系统设置" description="当前版本未接入通知模块，不会主动申请或发送通知；这里只验证未来权限入口。" icon={Bell} onAction={() => void Linking.openSettings()} title="通知能力尚未接入" tone="accent" secondary={<Tag>演示入口 · 无通知发送</Tag>} /></Screen>;
}

function Preview({ page }: { page: Exclude<StateSlug, 'gallery' | 'microphone' | 'notifications'> }) {
  const router = useRouter(); const [recovered, setRecovered] = useState(false);
  if (page === 'loading') return <Screen contentStyle={styles.screen}><TopBar title="全局加载" /><View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><AppText variant="sectionTitle">正在同步学习空间…</AppText><AppText style={styles.center}>统一加载状态会阻止重复操作，并保留明确的进度反馈。</AppText><Button onPress={router.back} variant="ghost">结束演示</Button></View></Screen>;
  if (page === 'load-failed' && recovered) return <Screen contentStyle={styles.screen}><TopBar title="加载失败" /><CenteredState description="本次本地重试已恢复，未发起网络请求。" title="重新加载成功" secondary={<Button onPress={() => setRecovered(false)} variant="ghost">再次查看失败态</Button>} /></Screen>;
  const state = { offline: { icon: WifiOff, title: '当前网络不可用', description: '已保留本机学习数据。恢复网络后可重试需要在线资源的操作。', action: '重新检测' }, 'load-failed': { icon: RefreshCw, title: '内容加载失败', description: '没有丢失本机数据，请检查网络后重试。', action: '重新加载' }, maintenance: { icon: Construction, title: '服务维护中', description: '本机题库仍可继续学习；认证与同步服务恢复时间以后续公告为准。', action: '返回上一页' } }[page];
  function act() { if (page === 'load-failed') setRecovered(true); else if (page === 'maintenance') router.back(); }
  return <Screen contentStyle={styles.screen}><TopBar title={titles[page]} /><CenteredState actionLabel={state.action} description={state.description} icon={state.icon} onAction={act} title={state.title} tone={page === 'load-failed' ? 'destructive' : 'accent'} secondary={page === 'offline' ? <Tag>离线演示 · 未断开真实网络</Tag> : undefined} /></Screen>;
}

const styles = StyleSheet.create({ screen: { paddingHorizontal: 0 }, intro: { gap: spacing[2], padding: spacing[5] }, list: { marginHorizontal: spacing[5], padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', minHeight: 68, paddingHorizontal: spacing[4] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, flex: { flex: 1 }, loading: { alignItems: 'center', flex: 1, gap: spacing[4], justifyContent: 'center', padding: spacing[8] }, center: { textAlign: 'center' } });
