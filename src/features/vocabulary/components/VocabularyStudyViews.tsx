import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { Check, CheckCircle2, ChevronLeft, RotateCcw, Star, Volume2 } from '@/components/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { isWordFavorite } from '../favorites';
import { progressFor } from '../progress-store';
import { speakVocabulary, speakVocabularyWithFeedback, stopVocabularySpeech } from '../speech';
import type { VocabularyState, VocabularyWord, VocabularyWordStatus } from '../types';
import { VocabularyProgress } from './VocabularyProgress';

export type VocabularySessionSummary = Record<'known' | 'vague' | 'forgot' | 'wrong', number>;

export function VocabularyStudyView({
  busy = false,
  savedStatus,
  words,
  index,
  revealed,
  state,
  onExit,
  onChoose,
  onWrong,
  onNext,
  onToggleFavorite,
}: {
  busy?: boolean;
  savedStatus?: VocabularyWordStatus;
  words: VocabularyWord[];
  index: number;
  revealed: boolean;
  state: VocabularyState;
  onExit: () => void;
  onChoose: (status: Exclude<VocabularyWordStatus, 'new' | 'wrong'>) => Promise<unknown> | unknown;
  onWrong: () => Promise<unknown> | unknown;
  onNext: () => void;
  onToggleFavorite: () => Promise<unknown> | unknown;
}) {
  const insets = useSafeAreaInsets();
  const guide = useGuide();
  const word = words[index]!;
  const [speechLoading, setSpeechLoading] = useState(false);
  const speechRequest = useRef(0), speechPending = useRef(false);
  const progress = progressFor(word.id, state);
  const markedWrong = savedStatus === 'wrong';
  const favorite = isWordFavorite({ word: word.word, wordId: word.id }, state);

  useEffect(() => {
    const requests = speechRequest;
    requests.current++; speechPending.current = false; setSpeechLoading(false);
    void speakVocabulary(word.word);
    return () => { requests.current++; speechPending.current = false; void stopVocabularySpeech(); };
  }, [word.id, word.word]);

  const playWord = () => {
    if (speechPending.current) return;
    const request = ++speechRequest.current;
    speechPending.current = true; setSpeechLoading(true);
    const release = () => {
      if (request !== speechRequest.current) return false;
      speechPending.current = false; setSpeechLoading(false); return true;
    };
    void speakVocabularyWithFeedback(word.word, undefined, () => {
      if (release()) guide?.event('vocab-speech');
    }).finally(release);
  };

  const choose = (status: Exclude<VocabularyWordStatus, 'new' | 'wrong'>) => {
    void onChoose(status);
    void speakVocabulary(word.word, word.example);
  };

  return (
    <Screen contentStyle={styles.zero}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="返回上一页" hitSlop={8} disabled={busy} onPress={() => { void stopVocabularySpeech(); onExit(); }} style={styles.iconButton}><ChevronLeft color={colors.foreground} size={21} /></Pressable>
        <AppText variant="button">{index + 1} / {words.length}</AppText>
        <Pressable disabled={busy} accessibilityState={{ busy }} accessibilityLabel={favorite ? '取消收藏' : '收藏'} hitSlop={8} onPress={() => { if (guide?.current === 'vocab' && favorite) guide.event('vocab-favorite'); else void onToggleFavorite(); }} style={styles.iconButton}>
          <GuideAnchor id="vocab-favorite" /><Star color={favorite ? colors.accent : colors.mutedForeground} fill={favorite ? colors.accent : 'transparent'} size={21} />
        </Pressable>
      </View>
      <View style={styles.progressWrap}><VocabularyProgress value={(index + 1) / words.length} /></View>
      <ScrollView contentContainerStyle={styles.studyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.wordCenter}>
          <AppText accessibilityRole="header" style={styles.studyWord} variant="pageTitle">{word.word}</AppText>
          <Pressable accessibilityLabel={`播放${word.word}发音`} accessibilityState={{ busy: speechLoading }} disabled={speechLoading} onPress={playWord} style={styles.sound}><GuideAnchor id="vocab-speech" />{speechLoading ? <AppText variant="micro">加载中</AppText> : <Volume2 color={colors.primary} size={20} />}</Pressable>
          {revealed ? (
            <View style={styles.reveal}><GuideAnchor id="vocab-meaning" />
              <AppText style={styles.meaning} variant="sectionTitle">{word.meaning}</AppText>
              <Card style={styles.exampleCard}>
                <AppText style={styles.exampleEnglish}>{word.example}</AppText>
                <AppText variant="caption">{word.exampleTranslation}</AppText>
                <Pressable accessibilityLabel="播放例句" onPress={() => { void speakVocabularyWithFeedback(word.example); }} style={styles.exampleSound}><Volume2 color={colors.primary} size={16} /><AppText color={colors.primary} variant="button">播放例句</AppText></Pressable>
              </Card>
            </View>
          ) : (
            <View style={styles.prompt}><AppText variant="caption">先回忆中文释义，再选择掌握程度</AppText>{progress.status !== 'new' ? <Tag tone="muted">上次：{statusText[progress.status]}</Tag> : null}</View>
          )}
        </View>
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        {revealed ? (
          <View key={`${word.id}:revealed`} style={styles.actionRow}><GuideAnchor id="vocab-next" />
            <Button accessibilityLabel={markedWrong ? '已标记记错' : '记错了'} accessibilityState={{ busy, disabled: busy || markedWrong }} disabled={busy || markedWrong} leading={markedWrong ? <Check size={16} color={colors.primary} /> : undefined} onPress={() => { void onWrong(); }} size="lg" style={[styles.flexButton, markedWrong ? styles.markedWrong : null]} variant="outline">{markedWrong ? '已标记记错' : '记错了'}</Button>
            <Button disabled={busy} onPress={() => { guide?.event('vocab-next'); onNext(); }} size="lg" style={styles.flexButton}>{index === words.length - 1 ? '完成本轮' : '下一词'}</Button>
          </View>
        ) : (
          <View key={`${word.id}:rating`} style={styles.actionRow}><GuideAnchor id="vocab-rating" />
            <Button disabled={busy} onPress={() => choose('forgot')} size="lg" style={styles.flexButton} variant="outline">忘记</Button>
            <Button disabled={busy} onPress={() => choose('vague')} size="lg" style={styles.flexButton} variant="secondary">模糊</Button>
            <Button disabled={busy} onPress={() => choose('known')} size="lg" style={styles.flexButton}>认识</Button>
          </View>
        )}
      </View>
    </Screen>
  );
}

const statusText: Record<VocabularyWordStatus, string> = { new: '未学', known: '认识', vague: '模糊', forgot: '忘记', wrong: '记错' };

export function VocabularyCompletionView({
  returnLabel = '返回词书',
  total,
  summary,
  onBack,
  onRestart,
  onReview,
  onViewWords,
}: {
  total: number;
  summary: VocabularySessionSummary;
  returnLabel?: string;
  onBack: () => void;
  onRestart: () => void;
  onReview: () => void;
  onViewWords: () => void;
}) {
  const needsReview = summary.vague + summary.forgot + summary.wrong;
  return (
    <Screen scroll contentStyle={styles.zero} header={<TopBar title="本轮完成" onBack={onBack} />}>
      <View style={styles.completionPage}>
        <View style={styles.completionHero}><CheckCircle2 color={colors.primary} size={36} /></View>
        <View style={styles.completionHeading}><AppText variant="pageTitle">完成 {total} 词</AppText><AppText style={styles.center}>学习状态已经保存。优先回看不稳定词汇，效果会更好。</AppText></View>
        <View style={styles.summaryGrid}>
          <SummaryCard color={colors.primary} label="认识" value={summary.known} />
          <SummaryCard color={colors.accent} label="模糊" value={summary.vague} />
          <SummaryCard color={colors.accent} label="忘记" value={summary.forgot} />
          <SummaryCard color={colors.destructive} label="记错" value={summary.wrong} />
        </View>
        <Card style={styles.reviewCard}><AppText variant="cardTitle">建议复习</AppText><AppText>{needsReview ? `本轮有 ${needsReview} 词需要继续巩固。` : '本轮全部认识，可以进入下一本词书或做词汇测评。'}</AppText></Card>
        <Button disabled={!needsReview} onPress={onReview} size="lg">复习本轮薄弱词</Button>
        <Button onPress={onViewWords} size="lg" variant="outline">查看本轮单词</Button>
        <Button leading={<RotateCcw color={colors.foreground} size={17} />} onPress={onRestart} size="lg" variant="outline">再学一遍</Button>
        <Button onPress={onBack} size="lg" variant="ghost">{returnLabel}</Button>
      </View>
    </Screen>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return <Card style={styles.summaryCard}><AppText variant="caption">{label}</AppText><AppText color={color} style={styles.summaryValue} variant="pageTitle">{value}</AppText></Card>;
}

const styles = StyleSheet.create({
  markedWrong: { backgroundColor: colors.primary06, borderColor: colors.primary20, opacity: 1 },
  zero: { paddingHorizontal: 0 },
  topBar: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: spacing[3] },
  iconButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  progressWrap: { paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  studyContent: { flexGrow: 1, padding: spacing[5] },
  wordCenter: { alignItems: 'center', flex: 1, gap: spacing[4], justifyContent: 'center', minHeight: 430 },
  studyWord: { fontSize: 36, lineHeight: 46, textAlign: 'center' },
  sound: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  reveal: { alignItems: 'center', gap: spacing[5], width: '100%' },
  meaning: { fontSize: 20, lineHeight: 30, textAlign: 'center' },
  exampleCard: { gap: spacing[2], maxWidth: 520, padding: spacing[5], width: '100%' },
  exampleEnglish: { color: colors.foreground },
  exampleSound: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  prompt: { alignItems: 'center', gap: spacing[3] },
  actions: { backgroundColor: colors.background72, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  actionRow: { flexDirection: 'row', gap: spacing[2] },
  flexButton: { flex: 1, paddingHorizontal: spacing[2] },
  completionPage: { gap: spacing[4], padding: spacing[5] },
  completionHero: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary10, borderRadius: radii.xxl, height: 72, justifyContent: 'center', marginTop: spacing[4], width: 72 },
  completionHeading: { alignItems: 'center', gap: spacing[2] },
  center: { textAlign: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  summaryCard: { gap: spacing[1], width: '48%' },
  summaryValue: { fontSize: 27 },
  reviewCard: { gap: spacing[2] },
});
