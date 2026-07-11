import { useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { Check, ChevronLeft, ChevronRight, Flag, Grid3X3, NotebookPen, WifiOff, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomSheet, Button, Card } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { getConnectivity, type Connectivity } from '../platform/network-service';
import { resolveQuestionBankAsset } from '../platform/resource-service';
import { completedCards, sqliteLearningStore } from '../platform/learning-store';
import type { CardLearningState, LearningRecord, QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';
import { AnswerCardSheet } from './AnswerCardSheet';
import { AnnotationToolbar } from './AnnotationToolbar';
import { ChoiceList } from './ChoiceList';
import { InteractiveStudyText } from './InteractiveStudyText';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyReport } from './StudyReport';
import { SpeakingPracticePanel } from './SpeakingPracticePanel';

type Props = { dataset: QuestionBankDataset; category: QuestionBankCategory; topic: QuestionBankTopic; initialCardId?: string };

export function ListeningStudyScreen({ dataset, category, topic, initialCardId }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const startedAt = useRef(Date.now());
  const [states, setStates] = useState<Record<string, CardLearningState>>({});
  const [hydrated, setHydrated] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerCardVisible, setAnswerCardVisible] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');
  const [report, setReport] = useState<LearningRecord | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState<'green' | 'yellow' | 'red'>('green');
  const [dictionaryMode, setDictionaryMode] = useState(false);
  const [lookupWord, setLookupWord] = useState<string>();
  const [revealedCards, setRevealedCards] = useState<Set<string>>(() => new Set());

  usePreventRemove(!report, () => setExitVisible(true));

  const card = topic.cards[currentIndex];
  const cardState = card ? states[card.id] : undefined;

  useEffect(() => {
    let active = true;
    void Promise.all([sqliteLearningStore.getTopicStates(topic), getConnectivity()]).then(([saved, network]) => {
      if (!active) return;
      setStates(saved);
      setConnectivity(network);
      const requestedIndex = initialCardId ? topic.cards.findIndex((item) => item.id === initialCardId) : -1;
      const firstUnvisited = topic.cards.findIndex((item) => !saved[item.id]?.visited);
      setCurrentIndex(requestedIndex >= 0 ? requestedIndex : firstUnvisited >= 0 ? firstUnvisited : 0);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [initialCardId, topic]);

  const persistCard = useCallback(
    (cardId: string, patch: Partial<CardLearningState>) => {
      setStates((current) => {
        const next: CardLearningState = {
          ...current[cardId],
          visited: current[cardId]?.visited ?? false,
          note: current[cardId]?.note ?? '',
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        void sqliteLearningStore.saveCardState(topic.id, cardId, next);
        return { ...current, [cardId]: next };
      });
    },
    [topic.id],
  );

  useEffect(() => {
    if (hydrated && card && !states[card.id]?.visited) persistCard(card.id, { visited: true });
  }, [card, hydrated, persistCard, states]);

  const visitedIndexes = useMemo(
    () => new Set(topic.cards.flatMap((item, index) => (states[item.id]?.visited ? [index] : []))),
    [states, topic.cards],
  );

  const completedCount = completedCards(topic.cards, states);
  const correctCount = topic.cards.reduce(
    (sum, item) => sum + (states[item.id]?.selectedChoiceIndex === item.correctChoiceIndex ? 1 : 0),
    0,
  );
  const noteCount = Object.values(states).filter((state) => state.note.trim()).length;

  async function finish(reason: 'abort' | 'complete') {
    const nextReport: LearningRecord = {
      id: `learning-${Date.now()}`,
      bankId: dataset.id,
      bankTitle: dataset.title,
      categoryTitle: category.name,
      topicTitle: topic.name,
      completedCount,
      totalCount: topic.cards.length,
      correctCount,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
      reason,
      createdAt: new Date().toISOString(),
    };
    await sqliteLearningStore.addRecord(nextReport);
    setExitVisible(false);
    setReport(nextReport);
  }

  if (report) {
    return (
      <StudyReport
        interaction={dataset.study.interaction}
        noteCount={noteCount}
        onReturn={() => router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } })}
        record={report}
      />
    );
  }

  if (!hydrated || !card) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption">正在恢复学习进度…</AppText>
      </SafeAreaView>
    );
  }

  const revealed = revealedCards.has(card.id);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="结束学习" onPress={() => setExitVisible(true)} style={styles.circleButton}>
          <ChevronLeft color={colors.foreground} size={22} />
        </Pressable>
        <View style={styles.topCopy} />
        <Pressable accessibilityLabel="打开答题卡" onPress={() => setAnswerCardVisible(true)} style={styles.counterButton}>
          <Grid3X3 color={colors.mutedForeground} size={16} />
          <AppText style={styles.counter} variant="button">{currentIndex + 1} / {topic.cards.length}</AppText>
        </Pressable>
      </View>

      {connectivity === 'offline' ? (
        <View style={styles.offlineBanner}>
          <WifiOff color={colors.accent} size={16} />
          <AppText color={colors.accent} variant="caption">当前无网络，音频可能无法加载，文字学习和笔记仍可使用。</AppText>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 116 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.toolsRow}>
          <Pressable accessibilityLabel={revealed ? '收起答案' : '显示答案'} onPress={() => setRevealedCards((current) => { const next = new Set(current); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next; })} style={[styles.answerTool, revealed ? styles.answerToolActive : null]}>
            <Check color={revealed ? colors.primary : colors.mutedForeground} size={14} />
            <AppText color={revealed ? colors.primary : colors.mutedForeground} variant="caption">答案</AppText>
          </Pressable>
          {dataset.study.tools.tags || dataset.study.tools.highlights ? (
            <AnnotationToolbar
              activeColor={highlightColor}
              dictionaryMode={dictionaryMode}
              highlightMode={highlightMode}
              onColorChange={setHighlightColor}
              onDictionaryModeChange={(value) => { setDictionaryMode(value); if (value) setHighlightMode(false); }}
              onHighlightModeChange={(value) => { setHighlightMode(value); if (value) setDictionaryMode(false); }}
              onTagsChange={(tagIds) => persistCard(card.id, { tagIds, visited: true })}
              selectedTags={cardState?.tagIds ?? []}
            />
          ) : null}
        </View>

        <Card elevated style={styles.studyCard}>
          <View style={styles.cardHeader}>
            <AppText numberOfLines={1} style={styles.taskTitle} variant="caption">♧ {card.taskTitle}</AppText>
            <View style={styles.onlineDot} />
          </View>
          <StudyAudioPlayer generatedAudio={dataset.id === 'opi' && !card.audio} label={card.taskTitle} uri={resolveQuestionBankAsset(card.audio)} />

          {dataset.study.tools.recorder ? (
            <SpeakingPracticePanel
              mode={dataset.study.interaction === 'retell' ? 'retell' : 'speaking'}
              onRecorded={(recordingDurationMillis) => persistCard(card.id, { recorded: true, recordingDurationMillis, visited: true })}
            />
          ) : null}

          {card.choices?.length ? (
            <View style={styles.section}>
              <ChoiceList
                choices={card.choices}
                correctChoiceIndex={card.correctChoiceIndex}
                onSelect={(index) => persistCard(card.id, { selectedChoiceIndex: index, visited: true })}
                selectedChoiceIndex={cardState?.selectedChoiceIndex}
                showResult={revealed}
              />
            </View>
          ) : null}

        </Card>

        {revealed ? <Card style={styles.transcriptCard}>
            <AppText variant="cardTitle">{dataset.study.copy.transcriptLabel}</AppText>
            <InteractiveStudyText
              blockId="question"
              dictionaryMode={dictionaryMode}
              highlightColor={highlightColor}
              highlightMode={highlightMode}
              highlights={cardState?.highlights ?? []}
              onHighlightsChange={(highlights) => persistCard(card.id, { highlights, visited: true })}
              onLookup={setLookupWord}
              text={card.audioText}
            />
            {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}


          {card.referenceText ? (
            <View style={styles.reference}>
              <AppText color={colors.primary} variant="button">{dataset.study.copy.referenceLabel}</AppText>
              <InteractiveStudyText
                blockId="reference"
                dictionaryMode={dictionaryMode}
                highlightColor={highlightColor}
                highlightMode={highlightMode}
                highlights={cardState?.highlights ?? []}
                onHighlightsChange={(highlights) => persistCard(card.id, { highlights, visited: true })}
                onLookup={setLookupWord}
                text={card.referenceText}
              />
              {card.referenceTextZh ? <AppText>{card.referenceTextZh}</AppText> : null}
            </View>
          ) : null}
        </Card> : null}

        {revealed && dataset.study.tools.notes ? <Card style={styles.notesCard}>
          <View style={styles.notesHeader}>
            <NotebookPen color={colors.primary} size={18} />
            <AppText variant="cardTitle">学习笔记</AppText>
          </View>
          <TextInput
            accessibilityLabel="学习笔记"
            multiline
            onChangeText={(note) => persistCard(card.id, { note, visited: true })}
            placeholder="记录易错点、关键词或复习提醒…"
            placeholderTextColor={colors.mutedForeground}
            style={styles.notesInput}
            textAlignVertical="top"
            value={cardState?.note ?? ''}
          />
          <AppText variant="micro">内容会自动保存在当前设备</AppText>
        </Card> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
        <Button leading={<Flag color={colors.foreground} size={17} />} onPress={() => setExitVisible(true)} variant="outline">结束</Button>
        <Button
          disabled={currentIndex === 0}
          leading={<ChevronLeft color={colors.foreground} size={18} />}
          onPress={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          variant="outline"
        >
          上一题
        </Button>
        <Button
          leading={currentIndex < topic.cards.length - 1 ? undefined : <ChevronRight color={colors.primaryForeground} size={18} />}
          onPress={() => {
            if (currentIndex < topic.cards.length - 1) setCurrentIndex((value) => value + 1);
            else void finish('complete');
          }}
        >
          {currentIndex < topic.cards.length - 1 ? '下一题' : '完成'}
        </Button>
      </View>

      <AnswerCardSheet
        current={currentIndex}
        onClose={() => setAnswerCardVisible(false)}
        onSelect={(index) => {
          setCurrentIndex(index);
          setAnswerCardVisible(false);
        }}
        total={topic.cards.length}
        visible={answerCardVisible}
        visited={visitedIndexes}
      />

      <BottomSheet accessibilityLabel="结束本次学习" onClose={() => setExitVisible(false)} visible={exitVisible}>
        <View style={styles.exitContent}>
          <View style={styles.exitIcon}><X color={colors.primary} size={24} /></View>
          <AppText variant="sectionTitle">结束本次学习？</AppText>
          <AppText style={styles.exitDescription}>结束后将生成学习报告，你的作答和笔记会继续保留。</AppText>
          <View style={styles.exitProgress}>
            <AppText variant="caption">当前完成</AppText>
            <AppText style={styles.exitCount} variant="button">{completedCount} / {topic.cards.length}</AppText>
          </View>
          <Button onPress={() => setExitVisible(false)} size="lg">继续学习</Button>
          <Button onPress={() => void finish('abort')} size="lg" variant="outline">结束并查看报告</Button>
        </View>
      </BottomSheet>

      <BottomSheet accessibilityLabel="上下文查词" onClose={() => setLookupWord(undefined)} visible={Boolean(lookupWord)}>
        <View style={styles.lookupContent}>
          <AppText color={colors.primary} variant="micro">CONTEXT WORD LOOKUP</AppText>
          <AppText variant="pageTitle">{lookupWord}</AppText>
          <AppText>查词入口、上下文和失败承载已复刻。当前阶段不接真实 AI 释义，后续服务接入时可替换此内容层。</AppText>
          <Button onPress={() => setLookupWord(undefined)} size="lg">返回学习</Button>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: spacing[3], justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing[3] },
  circleButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  topCopy: { flex: 1 },
  counter: { color: colors.mutedForeground, fontFamily: fonts.monoRegular },
  counterButton: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], minHeight: 38, paddingHorizontal: spacing[3] },
  offlineBanner: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.08)', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[2] },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[1] },
  toolsRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  answerTool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] },
  answerToolActive: { backgroundColor: colors.primary06, borderColor: colors.primary },
  studyCard: { gap: spacing[3] },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  taskTitle: { flex: 1 },
  onlineDot: { backgroundColor: '#42BF8A', borderRadius: radii.full, height: 9, width: 9 },
  section: { gap: spacing[2] },
  transcriptCard: { gap: spacing[3], marginTop: spacing[4] },
  translation: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[3] },
  reference: { backgroundColor: colors.primary06, borderRadius: radii.xl, gap: spacing[1.5], marginTop: spacing[2], padding: spacing[3] },
  notesCard: { gap: spacing[3], marginTop: spacing[3] },
  notesHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  notesInput: { backgroundColor: colors.secondary, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 22, minHeight: 108, padding: spacing[3] },
  footer: { alignItems: 'center', backgroundColor: colors.background72, bottom: 0, flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between', left: 0, paddingHorizontal: spacing[5], paddingTop: spacing[3], position: 'absolute', right: 0 },
  exitContent: { gap: spacing[3], paddingBottom: spacing[2] },
  lookupContent: { gap: spacing[3], paddingBottom: spacing[4] },
  exitIcon: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 56, justifyContent: 'center', width: 56 },
  exitDescription: { textAlign: 'center' },
  exitProgress: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.xl, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  exitCount: { fontFamily: fonts.monoRegular },
});
