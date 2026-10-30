import { audioSessionOrchestrator } from '@/platform/audio/audio-session-orchestrator';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Network from 'expo-network';
import type { OfflineDownloadScope, OfflineManifest } from '@icao/contracts';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Screen } from '@/components/ui';
import { ChevronDown, ChevronUp, Headphones, RadioTower, Mic, BookOpen, ListOrdered } from '@/components/ui/icons';
import { colors, radii, spacing } from '@/theme';
import { useProfile } from '@/features/account/profile-store.native';
import type { QuestionBankId } from '../types';
import { cancelDownload, checkDownloadUpdates, deleteDownload, downloadSnapshot, loadDownloadManifest,
  remainingDownloadBytes, packageIncludes, prepareDownloads, startDownload, subscribeDownloads, type DownloadPackage } from './download-manager.native';

const banks = [
  { id: 'listening', title: '听力', Icon: Headphones }, { id: 'sentences900', title: '900 句', Icon: ListOrdered },
  { id: 'radiotelephony', title: '陆空通话', Icon: RadioTower }, { id: 'opi', title: 'OPI', Icon: Mic },
  { id: 'storytelling', title: '故事复诵', Icon: BookOpen },
] as const;
const size = (bytes: number) => `约 ${(bytes / 1_000_000).toFixed(1)} MB`;
const scopeLabel = (scope?: OfflineDownloadScope) => scope === 'icao4' ? '四级' : scope === 'icao5' ? '五级' : scope === 'selected' ? '精选题库' : '最全题库';
function status(item?: DownloadPackage) {
  if (item?.phase === 'queued') return '等待下载';
  if (item?.phase === 'downloading') return '下载中';
  if (item?.phase === 'verifying') return '校验中';
  if (item?.phase === 'paused' || item?.phase === 'error') return '下载未完成';
  return item?.outdated ? '有更新' : item?.saved ? '已下载' : '未下载';
}
export function DownloadManagementScreen() {
  const { bank } = useLocalSearchParams<{ bank?: QuestionBankId }>();
  const [expanded, setExpanded] = useState<QuestionBankId | undefined>(bank ?? 'listening');
  const state = useSyncExternalStore(subscribeDownloads, downloadSnapshot, downloadSnapshot);
  const [check, setCheck] = useState('检查更新');
  const [checking, setChecking] = useState(false);
  useEffect(() => { void prepareDownloads().then(() => checkDownloadUpdates()).catch(() => undefined); }, []);
  useEffect(() => {
    if (checking || check === '检查更新') return;
    const timer = setTimeout(() => setCheck('检查更新'), 3000);
    return () => clearTimeout(timer);
  }, [checking, check]);
  async function inspect() {
    setChecking(true); setCheck('检查中');
    try { setCheck(await checkDownloadUpdates()); } catch { setCheck('检查失败'); }
    finally { setChecking(false); }
  }
  return <Screen scroll header={<TopBar title="下载管理" actionWidth={86} right={<Pressable accessibilityRole="button" accessibilityLabel={check} disabled={checking} onPress={() => { void inspect(); }} style={styles.check}><AppText variant="micro" color={colors.primary}>{check}</AppText></Pressable>} />}>
    {banks.map(bank => <DownloadCard key={bank.id} bank={bank} item={state[bank.id]} open={expanded === bank.id} toggle={() => setExpanded(expanded === bank.id ? undefined : bank.id)} />)}
  </Screen>;
}
function DownloadCard({ bank, item, open, toggle }: { bank: typeof banks[number]; item?: DownloadPackage; open: boolean; toggle(): void }) {
  const profile = useProfile();
  const scopes: OfflineDownloadScope[] = bank.id === 'sentences900' ? ['icao4', 'icao5'] : ['selected', 'all'];
  const [scope, setScope] = useState<OfflineDownloadScope>(item?.target?.scope ?? item?.saved?.scope ?? (bank.id === 'sentences900' ? profile.target.startsWith('icao4') ? 'icao4' : 'icao5' : 'selected'));
  const selectionTouched = useRef(false);
  useEffect(() => { if (!selectionTouched.current && (item?.target || item?.saved)) { setScope((item.target ?? item.saved)!.scope); selectionTouched.current = true; } }, [item?.target, item?.saved]);
  const [manifest, setManifest] = useState<OfflineManifest>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = Boolean(item && ['queued', 'downloading', 'verifying'].includes(item.phase));
  const rangeLocked = busy || Boolean(item?.target);
  const shown = manifest?.scope === scope ? manifest : [item?.target, item?.saved, item?.latest].find(m => m?.scope === scope);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true); setError('');
    void loadDownloadManifest(bank.id, scope).then(value => { if (current) setManifest(value); })
      .catch(() => { if (current) setError('暂无法获取，请联网重试'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [bank.id, scope, open, attempt]);
  async function begin() {
    const chosen = item?.outdated && item.saved ? item.latest ?? item.saved : shown;
    if (!chosen) return;
    setError('');
    try {
      const network = await Network.getNetworkStateAsync();
      if (network.type === Network.NetworkStateType.CELLULAR) {
        Alert.alert('使用移动网络下载？', `本次需下载 ${size(await remainingDownloadBytes(chosen))}`, [
          { text: '取消', style: 'cancel' }, { text: '继续下载', onPress: () => { void startDownload(chosen, true).catch(() => setError('下载未开始，请重试')); } },
        ]);
      } else await startDownload(chosen);
    } catch { setError('下载未开始，请重试'); }
  }
  function remove() {
    const actual = item?.saved?.scope ?? item?.target?.scope ?? scope;
    Alert.alert(`删除${bank.title}${scopeLabel(actual)}下载？`, `仅删除本机内容，收藏、笔记和学习记录保留。${['study', 'radio'].includes(audioSessionOrchestrator.getActiveOwner() ?? '') ? '将停止当前题库音频播放。' : ''}`, [
      { text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void deleteDownload(bank.id).catch(() => setError('删除失败，请重试')); } },
    ]);
  }
  const included = packageIncludes(item, scope);
  const progress = item?.total ? Math.min(100, Math.floor(item.completed / item.total * 100)) : 0;
  const Icon = bank.Icon;
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={toggle} style={styles.heading}>
      <View style={styles.icon}>{bank.id === 'sentences900' ? <AppText variant="cardTitle" color={colors.primary}>9</AppText> : <Icon size={22} color={colors.primary} />}</View><AppText variant="cardTitle" style={styles.title}>{bank.title}</AppText>
      <AppText variant="micro" color={colors.mutedForeground} accessibilityLiveRegion="polite">{status(item)}</AppText>
      {open ? <ChevronUp size={18} color={colors.mutedForeground} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
    </Pressable>
    {open ? <View style={styles.body}>
      <View style={styles.row}>{scopes.map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: scope === value, disabled: rangeLocked }} key={value} disabled={rangeLocked} onPress={() => { selectionTouched.current = true; setScope(value); }} style={[styles.scope, scope === value && styles.selected]}><AppText variant="button" color={scope === value ? colors.primary : colors.mutedForeground}>{scopeLabel(value)}</AppText></Pressable>)}</View>
      <View style={styles.data}><AppText variant="micro" color={colors.mutedForeground}>下载大小</AppText><AppText variant="micro" color={colors.mutedForeground}>{shown ? size(shown.sizeBytes) : loading ? '加载中' : '暂无法获取'}</AppText></View>
      {item?.target ? <View><View style={styles.data}><AppText variant="micro" color={colors.mutedForeground}>下载进度</AppText><AppText variant="micro" color={colors.mutedForeground}>{progress}%</AppText></View><View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View></View> : null}
      {item?.saved && item.target && item.saved.scope !== item.target.scope ? <AppText variant="micro" color={colors.mutedForeground}>{scopeLabel(item.saved.scope)}已下载</AppText> : null}
      {error || item?.error ? <AppText variant="micro" color={colors.mutedForeground}>{error || item?.error}</AppText> : null}
      <View style={styles.actions}>
        {item?.saved || item?.target ? <Pressable accessibilityRole="button" onPress={remove} style={styles.remove}><AppText variant="button" color={colors.destructive}>删除下载</AppText></Pressable> : <View />}
        {busy ? <Button variant="outline" onPress={() => { void cancelDownload(bank.id); }}>取消下载</Button>
          : item?.outdated ? <Button onPress={() => { void begin(); }}>更新下载</Button>
          : included && !item?.target ? item?.saved?.scope === scope ? <View /> : <AppText variant="micro" color={colors.mutedForeground}>已包含</AppText>
          : !shown ? <Button variant="outline" disabled={loading} onPress={() => setAttempt(value => value + 1)}>重试</Button>
          : <Button onPress={() => { void begin(); }}>{item?.target ? '继续下载' : '下载'}</Button>}
      </View>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  check: { minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, overflow: 'hidden', marginBottom: spacing[4] },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], minHeight: 80 },
  icon: { padding: spacing[3], backgroundColor: colors.secondary, borderRadius: radii.lg }, title: { flex: 1 },
  body: { padding: spacing[4], gap: spacing[4], borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', gap: spacing[3] }, scope: { flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  selected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  data: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  track: { height: 4, backgroundColor: colors.secondary, borderRadius: radii.full }, fill: { height: 4, backgroundColor: colors.primary, borderRadius: radii.full },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[3] },
  remove: { minHeight: 44, borderRadius: radii.lg, borderColor: colors.destructive, borderWidth: 1, justifyContent: 'center', paddingHorizontal: spacing[3] },
});
