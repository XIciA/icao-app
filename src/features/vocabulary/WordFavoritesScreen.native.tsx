import { useSaveAction } from './use-save-action.native';
import { BookOpen, RefreshCw, Star, WifiOff } from '@/components/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { getStaticWordLookupEntries } from '@/features/question-bank/static-word-lookup/repository';
import { colors, radii, spacing } from '@/theme';

import { buildWordFavoriteItems, type WordFavoriteItem } from './favorites';
import { migrateLegacyVocabularyFavorites, useWordFavorites } from './progress-store.native';
import { loadVocabulary, type VocabularyLoadResult } from './repository.native';

export function WordFavoritesScreen() {
  const favorites = useWordFavorites();
  const save = useSaveAction();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<VocabularyLoadResult>();
  const [loadError, setLoadError] = useState(false);
  const books = useMemo(() => loadResult?.dataset.books ?? [], [loadResult]);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    void loadVocabulary()
      .then((result) => { if (active) setLoadResult(result); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (favorites.ready && books.length) void migrateLegacyVocabularyFavorites(books).catch(() => undefined);
  }, [books, favorites.ready, favorites.state.updatedAt]);

  const items = useMemo(() => buildWordFavoriteItems({
    books,
    lookupEntries: getStaticWordLookupEntries(),
    state: favorites.state,
  }), [books, favorites.state]);

  const loadingVocabulary = !loadResult && !loadError;

  return save.wrap(
    <Screen contentStyle={styles.screen}>
      <TopBar title="单词收藏" />
      {favorites.error ? (
        <CenteredState icon={Star} title="收藏读取失败" description="本机收藏暂时无法读取，记录未被清除。请检查设备可用空间后重试。" actionLabel="重试读取" onAction={favorites.retry} />
      ) : !favorites.ready ? (
        <CenteredState description="正在读取你收藏的单词。" icon={Star} title="正在准备单词收藏" />
      ) : items.length || loadError ? (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={items}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={(
            <View style={styles.header}>
              <AppText variant="pageTitle">单词收藏</AppText>
              <AppText variant="caption">集中查看你在单词学习和题库查词中收藏的词汇。</AppText>
              {loadError ? (
                <View style={styles.warning}>
                  <WifiOff color={colors.accent} size={18} />
                  <View style={styles.warningCopy}>
                    <AppText variant="button">词书资源暂时不可用</AppText>
                    <AppText variant="caption">查词收藏仍可查看；联网后重试可恢复词书收藏释义。</AppText>
                  </View>
                  <Pressable accessibilityLabel="重新加载词书收藏" onPress={() => setLoadAttempt((value) => value + 1)} style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}>
                    <RefreshCw color={colors.accent} size={18} />
                  </Pressable>
                </View>
              ) : loadingVocabulary ? <AppText variant="micro">正在补充词书收藏内容…</AppText> : null}
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.partialEmpty}>
              <BookOpen color={colors.mutedForeground} size={28} />
              <AppText style={styles.center}>暂时没有可显示的查词收藏</AppText>
              <AppText style={styles.center} variant="caption">词书资源恢复后会自动补齐其中的收藏。</AppText>
            </View>
          )}
          renderItem={({ item }) => (
            <FavoriteWordCard
              item={item}
              onRemove={() => save.run(() => favorites.setFavorite({ word: item.word, wordId: item.wordIds[0] }, false))}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : loadingVocabulary ? (
        <CenteredState description="正在合并单词学习和题库查词中的收藏。" icon={Star} title="正在准备单词收藏" />
      ) : (
        <CenteredState description="在单词学习或题库查词中点亮收藏星标后，会统一显示在这里。" icon={Star} title="还没有收藏单词" />
      )}
    </Screen>
  );
}

function FavoriteWordCard({ item, onRemove }: { item: WordFavoriteItem; onRemove: () => Promise<unknown> | unknown }) {
  return (
    <Card elevated style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <AppText variant="sectionTitle">{item.word}</AppText>
          <View style={styles.tags}>
            {item.sources.includes('vocabulary') ? <Tag tone="primary">单词学习</Tag> : null}
            {item.sources.includes('lookup') ? <Tag tone="accent">题库查词</Tag> : null}
          </View>
        </View>
        <Pressable accessibilityLabel={`取消收藏${item.word}`} hitSlop={8} onPress={() => { void onRemove(); }} style={({ pressed }) => [styles.favoriteButton, pressed ? styles.pressed : null]}>
          <Star color={colors.accent} fill={colors.accent} size={21} />
        </Pressable>
      </View>
      <AppText color={colors.foreground}>{item.meaning}</AppText>
      {item.sources.includes('lookup') && item.aviationMeaning !== item.meaning ? <AppText variant="caption">航空释义：{item.aviationMeaning}</AppText> : null}
      {item.generalMeaning ? <AppText variant="caption">常用释义：{item.generalMeaning}</AppText> : null}
      {item.bookNames.length ? <AppText variant="micro">词书：{item.bookNames.join('、')}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  listContent: { gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] },
  header: { gap: spacing[2], paddingBottom: spacing[2] },
  warning: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.10)', borderRadius: radii.lg, flexDirection: 'row', gap: spacing[3], marginTop: spacing[2], padding: spacing[3] },
  warningCopy: { flex: 1 },
  retry: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 },
  card: { gap: spacing[2], padding: spacing[4] },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  titleCopy: { flex: 1, gap: spacing[2] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  favoriteButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  pressed: { backgroundColor: colors.secondary, transform: [{ scale: 0.95 }] },
  partialEmpty: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderStyle: 'dashed', borderWidth: 1, gap: spacing[2], marginTop: spacing[3], padding: spacing[8] },
  center: { textAlign: 'center' },
});
