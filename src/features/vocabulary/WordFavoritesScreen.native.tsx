import { useAuth } from '@/features/auth/AuthProvider';
import { captureLearningWriteContext } from '@/features/sync/learning-sync.native';
import { useSaveAction } from './use-save-action.native';
import { BookOpen, ChevronDown, RefreshCw, Star, WifiOff } from '@/components/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Button, Screen } from '@/components/ui';
import { getStaticWordLookupEntries } from '@/features/question-bank/static-word-lookup/repository';
import { colors, radii, spacing } from '@/theme';

import { buildWordFavoriteItems, type WordFavoriteItem } from './favorites';
import { migrateLegacyVocabularyFavorites, useWordFavorites } from './progress-store.native';
import { useVocabularyCatalog } from './use-vocabulary-catalog';

export function WordFavoritesScreen() {
  const favorites = useWordFavorites();
  const auth = useAuth();
  const [expanded, setExpanded] = useState<string>();
  const [removed, setRemoved] = useState<{ item: WordFavoriteItem; context: ReturnType<typeof captureLearningWriteContext> }>();
  useEffect(() => { setRemoved(undefined); setExpanded(undefined); }, [auth.account?.accountId]);
  const save = useSaveAction();
  const { loadResult, loadError, retry } = useVocabularyCatalog();
  const books = useMemo(() => loadResult?.dataset.books ?? [], [loadResult]);

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
    <Screen contentStyle={styles.screen} header={<TopBar title="单词收藏" />}>
      {favorites.error ? (
        <CenteredState icon={Star} title="收藏读取失败" description="本机收藏暂时无法读取，记录未被清除。请检查设备可用空间后重试。" actionLabel="重试读取" onAction={favorites.retry} />
      ) : !favorites.ready ? (
        <CenteredState description="正在读取你收藏的单词。" icon={Star} title="正在准备单词收藏" />
      ) : items.length || loadError ? (
        <FlatList
          contentContainerStyle={styles.listContent}
          extraData={expanded}
          data={items}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={loadError || loadingVocabulary ? (
            <View style={styles.header}>
              {loadError ? (
                <View style={styles.warning}>
                  <WifiOff color={colors.accent} size={18} />
                  <View style={styles.warningCopy}>
                    <AppText variant="button">词书资源暂时不可用</AppText>
                    <AppText variant="caption">查词收藏仍可查看；联网后重试可恢复词书收藏释义。</AppText>
                  </View>
                  <Pressable accessibilityLabel="重新加载词书收藏" onPress={retry} style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}>
                    <RefreshCw color={colors.accent} size={18} />
                  </Pressable>
                </View>
              ) : loadingVocabulary ? <AppText variant="micro">正在补充词书收藏内容…</AppText> : null}
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.partialEmpty}>
              <BookOpen color={colors.mutedForeground} size={28} />
              <AppText style={styles.center}>暂时没有可显示的查词收藏</AppText>
              <AppText style={styles.center} variant="caption">词书资源恢复后会自动补齐其中的收藏。</AppText>
            </View>
          )}
          renderItem={({ item, index }) => (
            <FavoriteWordCard
              item={item} expanded={expanded === item.key} first={index === 0} last={index === items.length - 1}
              onToggle={() => setExpanded(current => current === item.key ? undefined : item.key)}
              onRemove={() => { const context = captureLearningWriteContext(); return save.run(() => favorites.setFavorite({ word: item.word, wordId: item.wordIds[0] }, false), () => setRemoved({ item, context }), context); }}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : loadingVocabulary ? (
        <CenteredState description="正在合并单词学习和题库查词中的收藏。" icon={Star} title="正在准备单词收藏" />
      ) : (
        <CenteredState description="在单词学习或题库查词中点亮收藏星标后，会统一显示在这里。" icon={Star} title="还没有收藏单词" />
      )}
      {removed ? <View style={styles.undo}><AppText variant="caption" style={{flex:1}}>已取消收藏 {removed.item.word}</AppText><Button variant="ghost" size="sm" onPress={() => void save.run(() => favorites.setFavorite({word:removed.item.word,wordId:removed.item.wordIds[0]},true),()=>setRemoved(undefined),removed.context)}>撤销</Button><Button variant="ghost" size="sm" onPress={()=>setRemoved(undefined)}>关闭</Button></View> : null}
    </Screen>
  );
}

function FavoriteWordCard({ item, expanded, first, last, onToggle, onRemove }: { item: WordFavoriteItem; expanded: boolean; first: boolean; last: boolean; onToggle: () => void; onRemove: () => Promise<unknown> | unknown }) {
  return <View style={[styles.card, first && styles.first, last && styles.last]}>
    <View style={styles.titleRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${item.word} 释义`} accessibilityState={{expanded}} onPress={onToggle} style={styles.expand}>
        <View style={styles.titleCopy}><AppText variant="cardTitle">{item.word}</AppText><AppText variant="caption">{item.meaning}</AppText></View>
        {expanded ? <ChevronDown size={16} color={colors.mutedForeground} style={{transform:[{rotate:'180deg'}]}}/> : <ChevronDown size={16} color={colors.mutedForeground}/>}
      </Pressable>
      <Pressable accessibilityLabel={`取消收藏${item.word}`} onPress={() => { void onRemove(); }} style={styles.favoriteButton}><Star color={colors.accent} fill={colors.accent} size={20}/></Pressable>
    </View>
    {expanded ? <View style={styles.detail}>
      {item.aviationMeaning ? <AppText variant="caption">航空释义：{item.aviationMeaning}</AppText> : null}
      {item.generalMeaning ? <AppText variant="caption">常用释义：{item.generalMeaning}</AppText> : null}
      <AppText variant="micro">来源：{item.sources.map(source => source === 'lookup' ? '题库查词' : '单词学习').join('、')}</AppText>
      {item.bookNames.length ? <AppText variant="micro">词书：{item.bookNames.join('、')}</AppText> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  listContent: { padding: spacing[5], paddingBottom: spacing[8] },
  header: { gap: spacing[2], paddingBottom: spacing[2] },
  warning: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.10)', borderRadius: radii.lg, flexDirection: 'row', gap: spacing[3], marginTop: spacing[2], padding: spacing[3] },
  warningCopy: { flex: 1 },
  retry: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 },
  card: { gap: spacing[2], padding: spacing[4], backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
  first: {borderTopLeftRadius:radii.xl,borderTopRightRadius:radii.xl},last:{borderBottomLeftRadius:radii.xl,borderBottomRightRadius:radii.xl},
  expand:{flex:1,flexDirection:'row',alignItems:'center',gap:spacing[2],minHeight:44},detail:{gap:spacing[2],borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing[3]},
  undo:{flexDirection:'row',alignItems:'center',gap:spacing[2],padding:spacing[3],backgroundColor:colors.card},
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  titleCopy: { flex: 1, gap: spacing[2] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  favoriteButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  pressed: { backgroundColor: colors.secondary, transform: [{ scale: 0.95 }] },
  partialEmpty: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderStyle: 'dashed', borderWidth: 1, gap: spacing[2], marginTop: spacing[3], padding: spacing[8] },
  center: { textAlign: 'center' },
});
