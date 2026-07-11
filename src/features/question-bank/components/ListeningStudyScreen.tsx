import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Grid3X3, NotebookPen, WifiOff, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomSheet, Button, Card, Tag } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { getConnectivity, type Connectivity } from '../platform/network-service';
import { resolveQuestionBankAsset } from '../platform/resource-service';
import { completedCards, sqliteLearningStore } from '../platform/learning-store';
import type { CardLearningState, LearningRecord, QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';
import { AnswerCardSheet } from './AnswerCardSheet';
import { ChoiceList } from './ChoiceList';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyReport } from './StudyReport';

type Props = { dataset: QuestionBankDataset; category: QuestionBankCategory; topic: QuestionBankTopic };

export function ListeningStudyScreen({ dataset, category, topic }: Props) {
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

  const card = topic.cards[currentIndex];
  const cardState = card ? states[card.id] : undefined;

  useEffect(() => {
    let active = true;
    void Promise.all([sqliteLearningStore.getTopicStates(topic), getConnectivity()]).then(([saved, network]) => {
      if (!active) return;
      setStates(saved);
      setConnectivity(network);
      const firstUnvisited = topic.cards.findIndex((item) => !saved[item.id]?.visited);
      setCurrentIndex(firstUnvisited >= 0 ? firstUnvisited : 0);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [topic]);

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

  const progress = ((currentIndex + 1) / topic.cards.length) * 100;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="结束学习" onPress={() => setExitVisible(true)} style={styles.circleButton}>
          <X color={colors.foreground} size={20} />
        </Pressable>
        <View style={styles.topCopy}>
          <AppText numberOfLines={1} style={styles.topTitle} variant="cardTitle">{dataset.title}</AppText>
          <AppText style={styles.counter} variant="micro">{currentIndex + 1} / {topic.cards.length}</AppText>
        </View>
        <Pressable accessibilityLabel="打开答题卡" onPress={() => setAnswerCardVisible(true)} style={styles.circleButton}>
          <Grid3X3 color={colors.foreground} size={19} />
        </Pressable>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

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
        <View style={styles.contextRow}>
          <Tag>{category.name}</Tag>
          <AppText numberOfLines={1} style={styles.topicLabel} variant="caption">{topic.name}</AppText>
        </View>

        <Card elevated style={styles.studyCard}>
          <AppText color={colors.primary} variant="micro">LISTENING · {currentIndex + 1}</AppText>
          <AppText style={styles.taskTitle} variant="sectionTitle">{card.taskTitle}</AppText>
          <StudyAudioPlayer label={card.taskTitle} uri={resolveQuestionBankAsset(card.audio)} />

          {card.choices?.length ? (
            <View style={styles.section}>
              <AppText variant="cardTitle">选择正确答案</AppText>
              <ChoiceList
                choices={card.choices}
                correctChoiceIndex={card.correctChoiceIndex}
                onSelect={(index) => persistCard(card.id, { selectedChoiceIndex: index, visited: true })}
                selectedChoiceIndex={cardState?.selectedChoiceIndex}
              />
            </View>
          ) : null}

          <View style={styles.section}>
            <AppText variant="cardTitle">{dataset.study.copy.transcriptLabel}</AppText>
            <AppText color={colors.foreground} style={styles.transcript}>{card.audioText}</AppText>
            {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}
          </View>

          {cardState?.selectedChoiceIndex !== undefined && card.referenceText ? (
            <View style={styles.reference}>
              <AppText color={colors.primary} variant="button">{dataset.study.copy.referenceLabel}</AppText>
              <AppText color={colors.foreground}>{card.referenceText}</AppText>
            </View>
          ) : null}
        </Card>

        <Card style={styles.notesCard}>
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
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
        <Button
          disabled={currentIndex === 0}
          leading={<ChevronLeft color={colors.foreground} size={18} />}
          onPress={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          variant="outline"
        >
          上一题
        </Button>
        <Pressable accessibilityLabel="答题卡" onPress={() => setAnswerCardVisible(true)} style={styles.answerButton}>
          <Grid3X3 color={colors.primary} size={19} />
          <AppText color={colors.primary} variant="caption">{completedCount}/{topic.cards.length}</AppText>
        </Pressable>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: spacing[3], justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 54, paddingHorizontal: spacing[3] },
  circleButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  topCopy: { alignItems: 'center', flex: 1 },
  topTitle: { fontSize: 16 },
  counter: { color: colors.mutedForeground, fontFamily: fonts.monoRegular },
  progressTrack: { backgroundColor: colors.secondary, height: 3 },
  progressFill: { backgroundColor: colors.primary, height: '100%' },
  offlineBanner: { alignItems: 'center', backgroundColor: 'rgba(183,118,16,0.08)', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[2] },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  contextRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  topicLabel: { flex: 1 },
  studyCard: { gap: spacing[3] },
  taskTitle: { marginBottom: spacing[1] },
  section: { gap: spacing[3], marginTop: spacing[3] },
  transcript: { fontSize: 15, lineHeight: 25 },
  translation: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[3] },
  reference: { backgroundColor: colors.primary06, borderRadius: radii.xl, gap: spacing[1.5], marginTop: spacing[2], padding: spacing[3] },
  notesCard: { gap: spacing[3], marginTop: spacing[3] },
  notesHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  notesInput: { backgroundColor: colors.secondary, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 22, minHeight: 108, padding: spacing[3] },
  footer: { alignItems: 'center', backgroundColor: colors.background72, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between', left: 0, paddingHorizontal: spacing[4], paddingTop: spacing[3], position: 'absolute', right: 0, ...shadows.floating },
  answerButton: { alignItems: 'center', gap: 2, minWidth: 54 },
  exitContent: { gap: spacing[3], paddingBottom: spacing[2] },
  exitIcon: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 56, justifyContent: 'center', width: 56 },
  exitDescription: { textAlign: 'center' },
  exitProgress: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.xl, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  exitCount: { fontFamily: fonts.monoRegular },
});
