import { LocalBackLoadingScreen } from '@/components/states/LocalBackLoadingScreen.native';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { Clock3, ChevronRight, History, Target, Trash2 } from '@/components/ui/icons';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TopBar } from '@/components/navigation/TopBar';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { deleteLearningHistory } from '@/features/sync/learning-sync.native';
import { getLearningRecordPage, loadLearningRecordReview, subscribeLearningRecords } from '../platform/learning-record-storage.native';
import { toStudyReviewPackage } from '../lib/study-review.native';
import type { LearningRecord, QuestionBankStudyPackage } from '../types';

const StudyHistoryScreen = lazy(() => import('./QuestionBankStudyScreen.native').then((module) => ({ default: module.QuestionBankStudyScreen })));
const pageSize = 20;
function dayKey(value: string) { return new Date(value).toLocaleDateString('sv-SE'); }
function dayLabel(value: string) {
  const date = new Date(value); const today = new Date(); const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return '今天';
  if (dayKey(value) === dayKey(yesterday.toISOString())) return '昨天';
  return date.toLocaleDateString('zh-CN', { ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}), month: 'long', day: 'numeric' });
}

export function LearningRecordsScreen() {
  return <NativeScreenBoundary title="学习记录" fallbackHref="/(tabs)/profile"><LearningRecordsContent /></NativeScreenBoundary>;
}

function LearningRecordsContent() {
  const guide = useGuide();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [reviewPackage, setReviewPackage] = useState<QuestionBankStudyPackage>();
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [openingId, setOpeningId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const openingRef = useRef(false);
  const mounted = useRef(true);
  const refreshPending = useRef(false);
  const loadedCount = useRef(pageSize);
  const failedRecord = useRef<LearningRecord | undefined>(undefined);
  const failedDelete = useRef<LearningRecord | undefined>(undefined);
  const listRef = useRef<FlatList<LearningRecord>>(null);
  const scrollOffset = useRef(0);
  const restoreOffset = useRef(false);
  const refresh = useRef<() => void>(() => {});
  const loadPage = useCallback(async (offset = 0) => {
    if (loadingRef.current) { if (offset === 0) refreshPending.current = true; return; }
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await getLearningRecordPage(offset, offset === 0 ? Math.max(pageSize, loadedCount.current) : pageSize);
      if (!mounted.current) return;
      setRecords((current) => offset === 0 ? page.records : [...current, ...page.records.filter((record) => !current.some((item) => item.id === record.id))]);
      loadedCount.current = Math.max(pageSize, offset + page.records.length);
      setHasMore(page.hasMore);
      if (!failedRecord.current && !failedDelete.current) setError('');
    } catch { if (mounted.current) setError('学习记录暂时无法读取，请重试。'); }
    finally {
      loadingRef.current = false;
      if (mounted.current) {
        setLoading(false);
        if (refreshPending.current) { refreshPending.current = false; refresh.current(); }
      }
    }
  }, []);
  refresh.current = () => { void loadPage(); };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeLearningRecords(() => refresh.current());
    void loadPage();
    return () => { mounted.current = false; unsubscribe(); };
  }, [loadPage]);

  async function open(record: LearningRecord) {
    if (openingRef.current || deletingId) return;
    openingRef.current = true;
    setOpeningId(record.id);
    setError('');
    failedRecord.current = undefined;
    failedDelete.current = undefined;
    try {
      const saved = await loadLearningRecordReview(record);
      const next = toStudyReviewPackage(saved);
      if (!next) throw new Error('study_review_invalid');
      if (mounted.current) { setReviewPackage(next); guide?.event('recap-record'); }
    } catch { if (mounted.current) { failedRecord.current = record; setError('这次学习的记录暂时无法打开，请重试。'); } }
    finally { openingRef.current = false; if (mounted.current) setOpeningId(undefined); }
  }
  function remove(record: LearningRecord) {
    setDeletingId(record.id); setError(''); failedRecord.current = undefined; failedDelete.current = undefined;
    void deleteLearningHistory(record.id).then(() => loadPage()).catch(() => {
      if (mounted.current) { failedDelete.current = record; setError('删除失败，请重试。'); }
    }).finally(() => { if (mounted.current) setDeletingId(undefined); });
  }
  function confirmDelete(record: LearningRecord) {
    if (openingRef.current || deletingId) return;
    Alert.alert('删除这次学习记录？', '将删除本次作答和 AI 反馈，保留题目笔记、标签和学习进度。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => remove(record) },
    ]);
  }
  const returnToList = () => { restoreOffset.current = true; setReviewPackage(undefined); };
  if (reviewPackage) return <NativeScreenBoundary title="学习记录" onExit={returnToList} resetKey={reviewPackage.id}>
    <Suspense fallback={<LocalBackLoadingScreen title="学习记录" onBack={returnToList} />}>
      <StudyHistoryScreen key={reviewPackage.id} onReturn={returnToList} returnLabel="返回学习记录" sourceRoute="/learning-records" studyPackage={reviewPackage} />
    </Suspense>
  </NativeScreenBoundary>;

  const busy = Boolean(openingId || deletingId);
  return <Screen contentStyle={styles.screen}>
    <TopBar title="学习记录" />
    <FlatList
      ref={listRef}
      onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={100}
      onContentSizeChange={() => { if (restoreOffset.current) { restoreOffset.current = false; listRef.current?.scrollToOffset({ offset: scrollOffset.current, animated: false }); } }}
      data={records}
      keyExtractor={(record) => record.id}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (hasMore && !loading) void loadPage(records.length); }}
      ListHeaderComponent={error ? <View style={styles.error}><AppText color={colors.destructive}>{error}</AppText><Button variant="secondary" onPress={() => { if (failedRecord.current) void open(failedRecord.current); else if (failedDelete.current) remove(failedDelete.current); else void loadPage(); }}>重试</Button></View> : null}
      ListEmptyComponent={loading ? <AppText>正在读取记录…</AppText> : !error ? <Card style={styles.empty}><History color={colors.mutedForeground} size={28} /><AppText variant="cardTitle">还没有学习记录</AppText><AppText variant="caption">完成或结束一次练习后会显示在这里。</AppText></Card> : null}
      ListFooterComponent={loading && records.length ? <AppText variant="caption">正在读取…</AppText> : null}
      renderItem={({ item: record, index }) => <View style={styles.group}>
        {index === 0 || dayKey(records[index - 1].createdAt) !== dayKey(record.createdAt) ? <AppText variant="caption" style={styles.day}>{dayLabel(record.createdAt)}</AppText> : null}
        <Swipeable testID={`history-swipe-${record.id}`} enabled={!busy} overshootRight={false} containerStyle={styles.swipe} renderRightActions={(_progress, _translation, actions) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除${record.bankTitle} ${record.topicTitle}的学习记录`} disabled={busy} onPress={() => { actions.close(); confirmDelete(record); }} style={styles.delete}>
            <Trash2 color={colors.destructiveForeground} size={20} /><AppText color={colors.destructiveForeground} variant="button">删除</AppText>
          </Pressable>
        )}>
          <Card style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={`查看${record.bankTitle} ${record.topicTitle}`} accessibilityActions={[{ name: 'delete', label: '删除这次学习记录' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'delete') confirmDelete(record); }} disabled={busy} onPress={() => { void open(record); }} style={styles.content}>
              <GuideAnchor id="recap-record" /><View style={styles.titleRow}>
                <View style={styles.icon}><History color={colors.primary} size={18} /></View>
                <View style={styles.copy}><AppText variant="cardTitle">{record.source === 'hotspot' ? 'OPI 热点' : record.recordType === 'mock_exam' ? '模拟考试' : record.bankTitle}</AppText><AppText variant="caption">{record.source === 'hotspot' ? record.hotspot?.title : record.recordType === 'mock_exam' ? record.categoryTitle : record.topicTitle}</AppText></View>
                {record.recordType === 'mock_exam' && record.reason !== 'complete' ? <Tag tone="accent">未完成</Tag> : null}
                <ChevronRight color={colors.mutedForeground} size={18} />
              </View>
              <View style={styles.metrics}>
                <View style={styles.metric}><Target color={colors.primary} size={14} /><AppText variant="micro">{record.recordType === 'mock_exam' ? `已答 ${record.answeredCount ?? record.completedCount}/${record.totalCount} 题` : `本次学习 ${record.studiedCount ?? record.totalCount} 题`}</AppText></View>
                <View style={styles.metric}><Clock3 color={colors.primary} size={14} /><AppText variant="micro">{record.durationSeconds < 60 ? `${record.durationSeconds} 秒` : `${Math.floor(record.durationSeconds / 60)} 分`}</AppText></View>
                <AppText style={styles.date} variant="micro">{new Date(record.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</AppText>
              </View>
              {openingId === record.id ? <AppText variant="caption">正在打开…</AppText> : deletingId === record.id ? <AppText variant="caption">正在删除…</AppText> : null}
            </Pressable>
          </Card>
        </Swipeable>
      </View>}
    />
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, list: { paddingHorizontal: spacing[5], paddingBottom: spacing[6], gap: spacing[3] },
  group: { gap: spacing[2] }, day: { paddingHorizontal: spacing[1], paddingTop: spacing[2] },
  error: { gap: spacing[2] }, empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
  swipe: { borderRadius: radii.xxl }, card: { gap: spacing[2] }, content: { gap: spacing[3] }, titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  icon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.lg, height: 40, justifyContent: 'center', width: 40 }, copy: { flex: 1 },
  metrics: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], paddingTop: spacing[3] },
  metric: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] }, date: { color: colors.mutedForeground, flex: 1, textAlign: 'right' },
  delete: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.destructive, gap: spacing[1], paddingHorizontal: spacing[5] },
});
