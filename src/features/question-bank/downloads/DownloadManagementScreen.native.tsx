import { compactDownloadError as compactError } from './download-feedback';
import { audioSessionOrchestrator } from '@/platform/audio/audio-session-orchestrator';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Network from 'expo-network';
import type { OfflineDownloadScope, OfflineManifest } from '@icao/contracts';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Screen } from '@/components/ui';
import { BookOpen, Download, Pause, Play, RefreshCw } from '@/components/ui/icons';
import { colors } from '@/theme';
import { fonts } from '@/theme/font-families';
import { downloadPublicationDate, readDownloadReleaseMetadata, refreshDownloadReleaseMetadata } from './release-metadata';
import { StudyBankIcon } from '@/features/profile/StudyBankIcon';
import { currentVocabularyRelease } from '@/features/vocabulary/live-catalog';
import { DownloadPackageCard } from './DownloadPackageCard.native';
import type { QuestionBankId } from '../types';
import { cancelDownload, checkDownloadUpdates, deleteDownload, downloadSnapshot, loadDownloadManifest,
  remainingDownloadBytes, packageIncludes, startDownload, subscribeDownloads, type DownloadPackage, type DownloadPackageId } from './download-manager.native';

const banks = [
  { id: 'listening', title: '听力' }, { id: 'sentences900', title: '900 句' },
  { id: 'radiotelephony', title: '陆空通话' }, { id: 'opi', title: 'OPI' },
  { id: 'storytelling', title: '故事复诵' }, { id: 'vocabulary', title: '单词' },
] as const;
const size = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const scopeLabel = (scope?: OfflineDownloadScope) => scope === 'icao4' ? '四级' : scope === 'icao5' ? '五级' : scope === 'selected' ? '精选题库' : '最全题库';
const vocabularyScopeLabel = (scope: OfflineDownloadScope) => currentVocabularyRelease()?.dataset.books.find(book => book.id === scope)?.name ?? (scope === 'preview' ? 'ICAO考前预习' : scope === 'icao4' ? 'ICAO 4 必会' : 'ICAO 5 冲刺');
function status(item?: DownloadPackage) {
  if (item?.phase === 'queued') return '等待下载';
  if (item?.phase === 'downloading') return '下载中';
  if (item?.phase === 'verifying') return '校验中';
  if (item?.phase === 'paused' || item?.phase === 'error') return item.error ? compactError(item.error) : '已暂停';
  return item?.outdated ? '有更新' : item?.saved ? '已下载' : '未下载';
}
export function DownloadManagementScreen() {
  const { bank } = useLocalSearchParams<{ bank?: QuestionBankId | 'vocabulary' }>();
  const [expanded, setExpanded] = useState<QuestionBankId | 'vocabulary' | undefined>(bank ?? 'listening');
  const state = useSyncExternalStore(subscribeDownloads, downloadSnapshot, downloadSnapshot);
  const [check, setCheck] = useState('检查更新');
  const [checking, setChecking] = useState(false);
  const [date, setDate] = useState('—');
  useEffect(() => {
    let current = true;
    void readDownloadReleaseMetadata().then(releases => { if (current) setDate(previous => previous === '—' ? downloadPublicationDate(releases) : previous); });
    void inspect(() => current);
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (checking || check === '检查更新') return;
    const timer = setTimeout(() => setCheck('检查更新'), 3000);
    return () => clearTimeout(timer);
  }, [checking, check]);
  async function inspect(current = () => true) {
    setChecking(true); setCheck('检查中');
    const [metadata, downloads] = await Promise.allSettled([refreshDownloadReleaseMetadata(), checkDownloadUpdates()]);
    if (!current()) return;
    if (metadata.status === 'fulfilled') setDate(downloadPublicationDate(metadata.value));
    setCheck(metadata.status === 'rejected' || downloads.status === 'rejected' ? '检查失败' : downloads.value === '暂无下载' ? '已是最新' : downloads.value);
    setChecking(false);
  }
  return <Screen scroll contentStyle={{ paddingHorizontal: 16 }} header={<TopBar title="下载管理" actionSize={44} style={{ minHeight: 60, paddingHorizontal: 8, borderBottomWidth: 1 }} titleStyle={{ fontSize: 20, lineHeight: 26 }} />}>
    <View style={styles.toolbar}><View style={{ gap: 2 }}><AppText variant="micro" style={styles.date}>题库更新时间</AppText><AppText variant="micro" style={styles.date}>{date}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel={check} disabled={checking} onPress={() => { void inspect(); }} style={styles.check}><RefreshCw size={16} color={colors.foreground} /><AppText variant="micro" style={styles.small}>{check}</AppText></Pressable></View>
    {banks.map(bank => <DownloadCard key={bank.id} bank={bank} state={state} open={expanded === bank.id} toggle={() => setExpanded(expanded === bank.id ? undefined : bank.id)} />)}
  </Screen>;
}
function DownloadCard({ bank, state, open, toggle }: { bank: typeof banks[number]; state: Partial<Record<DownloadPackageId, DownloadPackage>>; open: boolean; toggle(): void }) {
  const vocabulary = bank.id === 'vocabulary';
  const scopes: OfflineDownloadScope[] = vocabulary ? ['preview', 'icao4', 'icao5'] : bank.id === 'sentences900' ? ['icao4', 'icao5'] : ['selected', 'all'];
  const [scope, setScope] = useState<OfflineDownloadScope>(bank.id === 'vocabulary' ? 'preview' : state[bank.id]?.target?.scope ?? state[bank.id]?.saved?.scope ?? (bank.id === 'sentences900' ? 'icao4' : 'selected'));
  const packageId = (vocabulary ? `vocabulary:${scope}` : bank.id) as DownloadPackageId;
  const item = state[packageId];
  const selectionTouched = useRef(false);
  useEffect(() => { if (!vocabulary && !selectionTouched.current && (item?.target || item?.saved)) { setScope((item.target ?? item.saved)!.scope); selectionTouched.current = true; } }, [item?.target, item?.saved, vocabulary]);
  const [manifest, setManifest] = useState<OfflineManifest>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = Boolean(item && ['queued', 'downloading', 'verifying'].includes(item.phase));
  const rangeLocked = !vocabulary && (busy || Boolean(item?.target));
  const shown = manifest?.scope === scope ? manifest : [item?.target, item?.saved, item?.latest].find(m => m?.scope === scope);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true); setError('');
    void loadDownloadManifest(bank.id, scope).then(value => { if (current) setManifest(value); })
      .catch(error => { if (current) setError(compactError(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [bank.id, scope, open, attempt]);
  async function begin() {
    const chosen = shown;
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
    Alert.alert(`删除${vocabulary ? vocabularyScopeLabel(actual) : bank.title + scopeLabel(actual)}下载？`, `仅删除本机内容，收藏、笔记和学习记录保留。${['study', 'radio'].includes(audioSessionOrchestrator.getActiveOwner() ?? '') ? '将停止当前题库音频播放。' : ''}`, [
      { text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void deleteDownload(packageId).catch(() => setError('删除失败，请重试')); } },
    ]);
  }
  const included = packageIncludes(item, scope);
  const completed = included && !item?.target && !item?.outdated;
  const progress = completed ? 100 : (item?.target?.scope === scope || item?.saved?.scope === scope) && item?.total ? Math.min(100, Math.floor(item.completed / item.total * 100)) : 0;
  const label = error && !completed ? compactError(error) : item?.target ? status(item) : item?.outdated ? '有更新' : included ? '已下载' : item?.saved ? '可扩展' : '未下载';
  const Action = busy ? Pause : item?.outdated || !shown ? RefreshCw : item?.target ? Play : Download;
  const actionLabel = busy ? '暂停下载' : item?.outdated ? '更新下载' : !shown ? '重试' : item?.target ? '继续下载' : '下载';
  return <DownloadPackageCard title={bank.title} icon={bank.id === 'vocabulary' ? <BookOpen size={23} color={colors.primary} strokeWidth={1.7} /> : <StudyBankIcon bankId={bank.id} size={23} />} open={open} toggle={toggle}
    status={label} completed={completed} progress={progress} size={shown ? size(shown.sizeBytes) : '—'} scope={scope}
    scopes={scopes.map(value => ({ value, label: vocabulary ? vocabularyScopeLabel(value) : scopeLabel(value), shortLabel: vocabulary ? value === 'preview' ? '预习' : value === 'icao4' ? '必会' : '冲刺' : scopeLabel(value).replace('题库', '') }))}
    rangeLocked={rangeLocked} onScope={value => { selectionTouched.current = true; setScope(value as OfflineDownloadScope); }}
    action={Action} actionLabel={actionLabel} actionDisabled={loading && !shown || item?.phase === 'verifying'}
    onAction={() => { if (busy) void cancelDownload(packageId); else if (!shown) setAttempt(value => value + 1); else void begin(); }}
    canDelete={Boolean(item?.saved || item?.target)} onDelete={remove} />;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 14 },
  check: { minHeight: 44, width: 112, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 7 },
  date: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sansRegular, color: colors.foreground },
  small: { fontSize: 13, lineHeight: 19, fontFamily: fonts.sansRegular, color: colors.foreground },
});
