import { useWordLookupUpdates } from '@/features/question-bank/static-word-lookup/use-word-lookup';
import { useAuth } from '@/features/auth/AuthProvider';
import { captureLearningWriteContext } from '@/features/sync/learning-sync.native';
import { useSaveAction } from './use-save-action.native';
import { BookOpen, RefreshCw } from '@/components/ui/icons';
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
import { WordCollectionRow } from './components/WordCollectionRow.native';
import { collectionStyles } from '@/components/learning/CollectionList.native';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';

export function WordFavoritesScreen() {
  const lookupRevision = useWordLookupUpdates();
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
  // The lookup repository is an external snapshot; its revision invalidates this projection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [books, favorites.state, lookupRevision]);

  const loadingVocabulary = !loadResult && !loadError;

  const resourceAction = items.length && (loadError || loadingVocabulary) ? <Pressable
    accessibilityRole="button" accessibilityLabel={loadError ? '词书资源暂时不可用，重试加载；查词收藏仍可查看' : '正在补充词书收藏内容'}
    disabled={!loadError} onPress={retry} style={styles.resourceAction}>
    <RefreshCw size={16} color={loadError ? colors.accent : colors.mutedForeground} />
    <AppText variant="micro" color={loadError ? colors.accent : colors.mutedForeground}>{loadError ? '词书重试' : '加载词书'}</AppText>
  </Pressable> : undefined;

  return save.wrap(
    <Screen contentStyle={styles.screen} header={favorites.error || !favorites.ready || (!items.length && !loadError) ? undefined : <TopBar title="单词收藏" right={resourceAction} actionWidth={resourceAction ? 92 : undefined} />}>
      {favorites.error ? (
        <CenteredState  kind="failure"  actionLabel="重试" onAction={favorites.retry} />
      ) : !favorites.ready ? (
        <GlobalLoadingScreen />
      ) : items.length || loadError ? (
        <FlatList
          style={styles.listContent}
          contentContainerStyle={items.length ? collectionStyles.surface : undefined}
          extraData={expanded}
          data={items}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={(
            <View style={styles.partialEmpty}>
              <BookOpen color={colors.mutedForeground} size={28} />
              <AppText style={styles.center}>暂时没有可显示的收藏</AppText>
              <AppText style={styles.center} variant="caption">词书资源恢复后会自动补齐其中的收藏。</AppText><Button variant="outline" onPress={retry}>重试加载词书</Button>
            </View>
          )}
          renderItem={({ item, index }) => (
            <WordCollectionRow word={item.word} ipa={item.ipa} meaning={item.aviationMeaning || item.meaning} favorite saving={save.saving}
              last={index === items.length - 1} expanded={expanded === item.key}
              onToggleDetails={() => setExpanded(current => current === item.key ? undefined : item.key)}
              onFavoriteChange={value => { const context = captureLearningWriteContext(); void save.run(() => favorites.setFavorite({ word: item.word, wordId: item.wordIds[0] }, value), () => setRemoved({ item, context }), context); }}
              details={item.generalMeaning || item.example || item.exampleTranslation || item.bookNames.length || item.aviationMeaning && item.meaning !== item.aviationMeaning ? <>
                {item.aviationMeaning && item.meaning !== item.aviationMeaning ? <AppText variant="caption">词书释义：{item.meaning}</AppText> : null}
                {item.generalMeaning ? <AppText variant="caption">常用释义：{item.generalMeaning}</AppText> : null}
                {item.example ? <AppText variant="caption">{item.example}</AppText> : null}
                {item.exampleTranslation ? <AppText variant="caption">{item.exampleTranslation}</AppText> : null}
                {item.bookNames.length ? <AppText variant="micro">词书：{item.bookNames.join('、')}</AppText> : null}
              </> : undefined}>
              <AppText variant="micro" color={colors.mutedForeground}>来源：{item.sources.map(source => source === 'lookup' ? '题库查词' : '单词学习').join('、')}</AppText>
            </WordCollectionRow>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : loadingVocabulary ? (
        <GlobalLoadingScreen />
      ) : (
        <CenteredState   kind="empty" />
      )}
      {removed ? <View style={styles.undo}><AppText variant="caption" style={{flex:1}}>已取消收藏 {removed.item.word}</AppText><Button variant="ghost" size="sm" onPress={() => void save.run(() => favorites.setFavorite({word:removed.item.word,wordId:removed.item.wordIds[0]},true),()=>setRemoved(undefined),removed.context)}>撤销</Button><Button variant="ghost" size="sm" onPress={()=>setRemoved(undefined)}>关闭</Button></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  listContent: { marginHorizontal: spacing[5], marginTop: spacing[5], marginBottom: spacing[8] },
  resourceAction: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing[1], minHeight: 44 },
  undo:{flexDirection:'row',alignItems:'center',gap:spacing[2],padding:spacing[3],backgroundColor:colors.card},
  pressed: { backgroundColor: colors.secondary, transform: [{ scale: 0.95 }] },
  partialEmpty: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderStyle: 'dashed', borderWidth: 1, gap: spacing[2], marginTop: spacing[3], padding: spacing[8] },
  center: { textAlign: 'center' },
});
