import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  List,
  Play,
  RotateCcw,
  Search,
  Star,
  Volume2,
  WifiOff,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { speakVocabularyWithFeedback } from '../speech';
import type {
  VocabularyBook,
  VocabularyBookStats,
  VocabularyState,
  VocabularyTestResult,
  VocabularyWord,
  VocabularyWordStatus,
} from '../types';
import { progressFor } from '../progress-store';
import { VocabularyProgress } from './VocabularyProgress';

const statusLabels: Record<VocabularyWordStatus, string> = {
  new: '未学',
  known: '认识',
  vague: '模糊',
  forgot: '忘记',
  wrong: '记错',
};

const statusTones: Record<VocabularyWordStatus, 'muted' | 'primary' | 'accent' | 'destructive'> = {
  new: 'muted',
  known: 'primary',
  vague: 'accent',
  forgot: 'accent',
  wrong: 'destructive',
};

export function VocabularyBooksView({
  books,
  selected,
  state,
  statsByBook,
  warning,
  lastTest,
  onToggle,
  onDetail,
  onStart,
  onTest,
}: {
  books: VocabularyBook[];
  selected: Set<string>;
  state: VocabularyState;
  statsByBook: Record<string, VocabularyBookStats>;
  warning?: string;
  lastTest?: VocabularyTestResult;
  onToggle: (id: VocabularyBook['id']) => void;
  onDetail: (id: VocabularyBook['id']) => void;
  onStart: () => void;
  onTest: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Screen contentStyle={styles.zero}>
      <TopBar title="单词学习" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} style={styles.grow}>
        <AppText style={styles.center}>从 838 条 ICAO 词汇中选择词书，按自己的节奏学习。</AppText>

        {warning ? (
          <View style={styles.warning}>
            <WifiOff color={colors.accent} size={17} />
            <AppText style={styles.warningText} variant="caption">当前使用设备缓存，联网后会自动获取最新词汇资源。</AppText>
          </View>
        ) : null}

        <Pressable accessibilityLabel="开始30题词汇测评" onPress={onTest}>
          <Card elevated style={styles.assessmentCard}>
            <View style={styles.assessmentIcon}><BarChart3 color={colors.primary} size={24} /></View>
            <View style={styles.grow}>
              <View style={styles.rowBetween}>
                <AppText variant="sectionTitle">30 题词汇测评</AppText>
                <ChevronRight color={colors.primary} size={18} />
              </View>
              <AppText style={styles.description}>每题 10 秒，根据作答情况动态调整难度，给出分级学习建议。</AppText>
              {lastTest ? <AppText color={colors.primary} variant="caption">上次结果：{lastTest.verdict} · {lastTest.totalRate}%</AppText> : <AppText variant="caption">约 5 分钟 · 非官方等级结论</AppText>}
            </View>
          </Card>
        </Pressable>

        <View style={styles.stack}>
          {books.map((book) => {
            const active = selected.has(book.id);
            const stats = statsByBook[book.id] ?? { total: book.words.length, learned: 0, known: 0, vague: 0, forgot: 0, wrong: 0, favorite: 0 };
            return (
              <Pressable accessibilityLabel={`${active ? '取消选择' : '选择'}${book.name}`} key={book.id} onPress={() => onToggle(book.id)}>
                <Card elevated style={[styles.bookCard, active ? styles.selectedCard : null]}>
                  <View style={[styles.bookIcon, active ? styles.selectedIcon : null]}>
                    {active ? <Check color={colors.primaryForeground} size={20} /> : <BookOpen color={colors.primary} size={20} />}
                  </View>
                  <View style={styles.grow}>
                    <View style={styles.rowBetween}>
                      <AppText variant="sectionTitle">{book.name}</AppText>
                      <AppText variant="caption">{book.words.length} 词</AppText>
                    </View>
                    <AppText style={styles.description}>{book.description}</AppText>
                    <AppText variant="micro">已学习 {stats.learned} / {stats.total}</AppText>
                    <VocabularyProgress value={stats.total ? stats.learned / stats.total : 0} />
                    <Pressable accessibilityLabel={`查看${book.name}详情`} onPress={(event) => { event.stopPropagation(); onDetail(book.id); }} style={styles.link}>
                      <AppText color={colors.primary} variant="button">查看详情</AppText>
                      <ChevronRight color={colors.primary} size={15} />
                    </Pressable>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
        {Object.keys(state.words).length ? <AppText style={styles.center} variant="caption">学习状态已保存在当前账号，并纳入学习数据同步。</AppText> : null}
      </ScrollView>
      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <AppText style={styles.center}>{selected.size ? `已选择 ${selected.size} 本词书` : '请选择至少一本词书'}</AppText>
        <Button disabled={!selected.size} leading={<Play color={colors.primaryForeground} size={16} />} onPress={onStart} size="lg">开始学习</Button>
      </View>
    </Screen>
  );
}

export function VocabularyBookDetailView({
  book,
  stats,
  onBack,
  onStudy,
  onReset,
  onList,
}: {
  book: VocabularyBook;
  stats: VocabularyBookStats;
  onBack: () => void;
  onStudy: () => void;
  onReset: () => Promise<unknown> | unknown;
  onList: () => void;
}) {
  const items = [
    ['单词总数', stats.total, colors.foreground],
    ['认识', stats.known, colors.primary],
    ['模糊', stats.vague, colors.accent],
    ['忘记', stats.forgot, colors.accent],
    ['记错', stats.wrong, colors.destructive],
    ['收藏', stats.favorite, colors.foreground],
  ] as const;
  const confirmReset = () => Alert.alert('重新学习这本词书？', '会把本词书的学习状态恢复为“未学”，收藏不会删除。', [
    { text: '取消', style: 'cancel' },
    { text: '确认重置', style: 'destructive', onPress: () => { void onReset(); } },
  ]);
  return (
    <Screen scroll contentStyle={styles.zero}>
      <TopBar title="单词学习" onBack={onBack} />
      <View style={styles.page}>
        <Card style={styles.detailCard}>
          <AppText variant="pageTitle">{book.name}</AppText>
          <AppText style={styles.description}>{book.description}</AppText>
          <View style={styles.rowBetween}><AppText variant="caption">学习进度</AppText><AppText variant="caption">{stats.learned} / {stats.total}</AppText></View>
          <VocabularyProgress value={stats.total ? stats.learned / stats.total : 0} />
        </Card>
        <View style={styles.stats}>
          {items.map(([label, value, color]) => <Card key={label} style={styles.stat}><AppText variant="caption">{label}</AppText><AppText color={color} style={styles.statValue} variant="pageTitle">{value}</AppText></Card>)}
        </View>
        <Button leading={<Play color={colors.primaryForeground} size={16} />} onPress={onStudy} size="lg">{stats.learned ? '继续学习' : '开始学习'}</Button>
        <Button leading={<List color={colors.foreground} size={16} />} onPress={onList} size="lg" variant="outline">查看单词列表</Button>
        <Button leading={<RotateCcw color={colors.destructive} size={16} />} onPress={confirmReset} size="lg" variant="ghost">重新学习</Button>
      </View>
    </Screen>
  );
}

type WordFilter = 'all' | VocabularyWordStatus | 'favorite';

export function VocabularyWordListView({
  book,
  state,
  onBack,
  onToggleFavorite,
  onStart,
}: {
  book: VocabularyBook;
  state: VocabularyState;
  onBack: () => void;
  onToggleFavorite: (wordId: string) => Promise<unknown> | unknown;
  onStart: (words: VocabularyWord[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WordFilter>('all');
  const [expanded, setExpanded] = useState<string>();
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return book.words.filter((word) => {
      const progress = progressFor(word.id, state);
      const filterMatches = filter === 'all' || (filter === 'favorite' ? progress.favorite : progress.status === filter);
      if (!filterMatches) return false;
      if (!needle) return true;
      return `${word.word} ${word.meaning} ${word.example} ${word.exampleTranslation}`.toLocaleLowerCase().includes(needle);
    });
  }, [book.words, filter, query, state]);
  const filters = [['all', '全部'], ['new', '未学'], ['known', '认识'], ['vague', '模糊'], ['forgot', '忘记'], ['wrong', '记错'], ['favorite', '收藏']] as const;

  return (
    <Screen keyboard contentStyle={styles.zero}>
      <TopBar title={book.name} onBack={onBack} />
      <View style={styles.listHeader}>
        <View style={styles.search}>
          <Search color={colors.mutedForeground} size={17} />
          <TextInput accessibilityLabel="搜索单词、释义或例句" autoCapitalize="none" onChangeText={setQuery} placeholder="搜索单词、释义或例句" placeholderTextColor={colors.mutedForeground} style={styles.input} value={query} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>{filters.map(([key, label]) => <Pressable accessibilityLabel={`筛选${label}`} key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key ? styles.filterActive : null]}><AppText color={filter === key ? colors.primaryForeground : colors.mutedForeground} variant="button">{label}</AppText></Pressable>)}</View>
        </ScrollView>
        <AppText variant="caption">共 {visible.length} 条</AppText>
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(word) => word.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={styles.empty}><Search color={colors.mutedForeground} size={24} /><AppText style={styles.center}>没有符合条件的单词</AppText></View>}
        renderItem={({ item: word }) => {
          const open = expanded === word.id;
          const progress = progressFor(word.id, state);
          return (
            <Card style={styles.wordRow}>
              <Pressable accessibilityLabel={`${open ? '收起' : '展开'}${word.word}`} onPress={() => setExpanded(open ? undefined : word.id)} style={styles.wordMain}>
                <View style={styles.grow}>
                  <View style={styles.inline}><AppText variant="sectionTitle">{word.word}</AppText><Tag tone={statusTones[progress.status]}>{statusLabels[progress.status]}</Tag></View>
                  {!open ? <AppText numberOfLines={2} variant="caption">{word.meaning}</AppText> : null}
                </View>
                <Pressable accessibilityLabel={progress.favorite ? '取消收藏' : '收藏'} hitSlop={8} onPress={(event) => { event.stopPropagation(); void onToggleFavorite(word.id); }}>
                  <Star color={progress.favorite ? colors.accent : colors.mutedForeground} fill={progress.favorite ? colors.accent : 'transparent'} size={19} />
                </Pressable>
                <ChevronDown color={colors.mutedForeground} size={17} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
              </Pressable>
              {open ? (
                <View style={styles.wordDetail}>
                  <View style={styles.rowBetween}><AppText style={styles.wordMeaning} variant="cardTitle">{word.meaning}</AppText><Pressable accessibilityLabel={`播放${word.word}及例句`} onPress={() => { void speakVocabularyWithFeedback(word.word, word.example); }} style={styles.sound}><Volume2 color={colors.primary} size={18} /></Pressable></View>
                  <View style={styles.exampleBox}><AppText>{word.example}</AppText><AppText variant="caption">{word.exampleTranslation}</AppText></View>
                </View>
              ) : null}
            </Card>
          );
        }}
      />
      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <Button disabled={!visible.length} leading={<Play color={colors.primaryForeground} size={16} />} onPress={() => onStart(visible)} size="lg">学习当前 {visible.length} 词</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0 },
  grow: { flex: 1 },
  page: { gap: spacing[4], padding: spacing[5], paddingBottom: spacing[6] },
  center: { textAlign: 'center' },
  stack: { gap: spacing[3] },
  warning: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.10)', borderRadius: radii.lg, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  warningText: { flex: 1 },
  assessmentCard: { alignItems: 'center', borderColor: colors.primary20, flexDirection: 'row', gap: spacing[3], padding: spacing[5] },
  assessmentIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 50, justifyContent: 'center', width: 50 },
  bookCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], padding: spacing[5] },
  selectedCard: { borderColor: colors.primary },
  bookIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 44, justifyContent: 'center', width: 44 },
  selectedIcon: { backgroundColor: colors.primary },
  rowBetween: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  description: { color: colors.mutedForeground, lineHeight: 22 },
  link: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[1], paddingTop: spacing[1] },
  sticky: { backgroundColor: colors.background72, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  detailCard: { gap: spacing[3], padding: spacing[5] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  stat: { gap: spacing[1], width: '48%' },
  statValue: { fontSize: 26 },
  listHeader: { gap: spacing[3], padding: spacing[5], paddingBottom: spacing[3] },
  search: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4] },
  input: { color: colors.foreground, flex: 1, fontSize: 14, height: 46 },
  filters: { flexDirection: 'row', gap: spacing[2] },
  filter: { borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  listContent: { gap: spacing[3], paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
  wordRow: { overflow: 'hidden', padding: 0 },
  wordMain: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], padding: spacing[4] },
  inline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  wordDetail: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[3], padding: spacing[4] },
  wordMeaning: { flex: 1 },
  exampleBox: { backgroundColor: colors.secondary, borderRadius: radii.lg, gap: spacing[1], padding: spacing[3] },
  sound: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 },
  empty: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderStyle: 'dashed', borderWidth: 1, gap: spacing[3], padding: spacing[8] },
});
