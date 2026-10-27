import { ArrowLeft, BarChart3, Check, Clock3, RotateCcw, Volume2, X } from '@/components/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { speakVocabulary, speakVocabularyWithFeedback, stopVocabularySpeech } from '../speech';
import {
  buildVocabularyTestResult,
  selectVocabularyQuestion,
  toVocabularyTestWords,
  VOCABULARY_TEST_SECONDS,
  VOCABULARY_TEST_TOTAL,
  type VocabularyTestQuestion,
} from '../test-engine';
import type { VocabularyBook, VocabularyTestAnswer, VocabularyTestResult } from '../types';
import { VocabularyProgress } from './VocabularyProgress';

export function VocabularyTestIntroView({ lastTest, onBack, onStart }: { lastTest?: VocabularyTestResult; onBack: () => void; onStart: () => void }) {
  return (
    <Screen scroll contentStyle={styles.zero} header={<TopBar title="词汇测评" onBack={onBack} />}>
      <View style={styles.page}>
        <View style={styles.hero}><BarChart3 color={colors.primary} size={34} /></View>
        <View style={styles.heading}><AppText variant="pageTitle">30 题词汇测评</AppText><AppText style={styles.center}>快速了解当前词汇识别情况，并得到下一步学习建议。</AppText></View>
        <Card style={styles.rulesCard}>
          <Rule number="1" title="每题 10 秒" description="凭第一反应选择“认识”或“不认识”，超时按不认识计。" />
          <Rule number="2" title="题目动态调整" description="前 5 题校准，随后根据最近作答表现调整词汇难度。" />
          <Rule number="3" title="答后立即确认" description="选择后显示释义；如果误点“认识”，可在进入下一题前改正。" />
        </Card>
        <View style={styles.notice}><AppText variant="caption">测评只反映当前词汇识别情况，不等同于正式 ICAO 英语等级考试或官方评级。</AppText></View>
        {lastTest ? <Card style={styles.lastResult}><AppText variant="caption">上次测评</AppText><View style={styles.rowBetween}><AppText variant="sectionTitle">{lastTest.verdict}</AppText><AppText color={colors.primary} variant="sectionTitle">{lastTest.totalRate}%</AppText></View><AppText variant="caption">{new Date(lastTest.completedAt).toLocaleString('zh-CN')}</AppText></Card> : null}
        <Button onPress={onStart} size="lg">开始 30 题测评</Button>
        <Button onPress={onBack} size="lg" variant="ghost">稍后再测</Button>
      </View>
    </Screen>
  );
}

function Rule({ number, title, description }: { number: string; title: string; description: string }) {
  return <View style={styles.rule}><View style={styles.ruleNumber}><AppText color={colors.primary} variant="button">{number}</AppText></View><View style={styles.grow}><AppText variant="cardTitle">{title}</AppText><AppText variant="caption">{description}</AppText></View></View>;
}

export function VocabularyTestRunner({ books, onExit, onFinish }: { books: VocabularyBook[]; onExit: () => void; onFinish: (result: VocabularyTestResult) => void }) {
  const insets = useSafeAreaInsets();
  const [words] = useState(() => toVocabularyTestWords(books));
  const [answers, setAnswers] = useState<VocabularyTestAnswer[]>([]);
  const [question, setQuestion] = useState<VocabularyTestQuestion | undefined>(() => selectVocabularyQuestion({ words, answers: [], usedIds: new Set(), mode: 'normal', questionNo: 1 }));
  const [seconds, setSeconds] = useState(VOCABULARY_TEST_SECONDS);
  const [deadline, setDeadline] = useState(() => Date.now() + VOCABULARY_TEST_SECONDS * 1000);
  const [revealed, setRevealed] = useState(false);
  const [chosenCorrect, setChosenCorrect] = useState<boolean>();

  useEffect(() => {
    if (!question) return;
    void speakVocabulary(question.word.word);
    return () => { void stopVocabularySpeech(); };
  }, [question]);

  const submit = useCallback((correct: boolean) => {
    if (!question || revealed) return;
    const answer: VocabularyTestAnswer = {
      wordId: question.word.id,
      word: question.word.word,
      meaning: question.word.meaning,
      bookId: question.word.bookId,
      bookName: question.word.bookName,
      level: question.word.level,
      questionNo: answers.length + 1,
      mode: question.mode,
      phase: question.phase,
      correct,
    };
    setAnswers((current) => [...current, answer]);
    setChosenCorrect(correct);
    setRevealed(true);
  }, [answers.length, question, revealed]);

  useEffect(() => {
    if (revealed) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) submit(false);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, revealed, submit]);

  if (!question) return null;
  const questionNo = answers.length + (revealed ? 0 : 1);
  const phaseLabel = question.phase === 'calibration' ? '校准' : question.phase === 'adaptive' ? '动态调整' : '结果验证';

  const next = () => {
    if (answers.length >= VOCABULARY_TEST_TOTAL) {
      void stopVocabularySpeech();
      onFinish(buildVocabularyTestResult(answers));
      return;
    }
    const nextNo = answers.length + 1;
    const nextQuestion = selectVocabularyQuestion({
      words,
      answers,
      usedIds: new Set(answers.map((answer) => answer.wordId)),
      mode: question.mode,
      questionNo: nextNo,
    });
    if (!nextQuestion) {
      onFinish(buildVocabularyTestResult(answers));
      return;
    }
    setQuestion(nextQuestion);
    setSeconds(VOCABULARY_TEST_SECONDS);
    setDeadline(Date.now() + VOCABULARY_TEST_SECONDS * 1000);
    setRevealed(false);
    setChosenCorrect(undefined);
  };

  const reviseAsUnknown = () => {
    setAnswers((current) => current.map((answer, index) => index === current.length - 1 ? { ...answer, correct: false } : answer));
    setChosenCorrect(false);
  };
  const exit = () => {
    void stopVocabularySpeech();
    onExit();
  };

  return (
    <Screen contentStyle={styles.zero}>
      <View style={styles.testTopBar}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" hitSlop={8} onPress={exit} style={styles.iconButton}><ArrowLeft color={colors.foreground} size={21} /></Pressable>
        <View style={styles.topCenter}><AppText variant="button">{questionNo} / {VOCABULARY_TEST_TOTAL}</AppText><Tag tone="muted">{phaseLabel}</Tag></View>
        <View accessibilityLabel={`剩余${seconds}秒`} style={[styles.timer, seconds <= 3 ? styles.timerUrgent : null]}><Clock3 color={seconds <= 3 ? colors.destructive : colors.primary} size={15} /><AppText color={seconds <= 3 ? colors.destructive : colors.primary} variant="button">{seconds}</AppText></View>
      </View>
      <View style={styles.progressWrap}><VocabularyProgress value={questionNo / VOCABULARY_TEST_TOTAL} /></View>
      <ScrollView contentContainerStyle={styles.runnerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.testWordArea}>
          <AppText style={styles.testHint} variant="caption">你认识这个词或短语吗？</AppText>
          <AppText accessibilityRole="header" style={styles.testWord} variant="pageTitle">{question.word.word}</AppText>
          <Pressable accessibilityLabel={`播放${question.word.word}发音`} onPress={() => { void speakVocabularyWithFeedback(question.word.word); }} style={styles.sound}><Volume2 color={colors.primary} size={20} /></Pressable>
          {revealed ? (
            <Card style={styles.answerCard}>
              <View style={[styles.answerHeading, chosenCorrect ? styles.answerKnown : styles.answerUnknown]}><View style={styles.answerIcon}>{chosenCorrect ? <Check color={colors.primary} size={18} /> : <X color={colors.destructive} size={18} />}</View><AppText color={chosenCorrect ? colors.primary : colors.destructive} variant="button">{chosenCorrect ? '认识' : '不认识'}</AppText></View>
              <AppText style={styles.testMeaning} variant="sectionTitle">{question.word.meaning}</AppText>
              {chosenCorrect ? <Button variant="outline" onPress={reviseAsUnknown} style={styles.reviseButton}><AppText color={colors.destructive} variant="button">改为不认识</AppText></Button> : null}
            </Card>
          ) : <AppText style={styles.center} variant="caption">不要猜太久，按第一反应作答</AppText>}
        </View>
      </ScrollView>
      <View style={[styles.testActions, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        {revealed ? <Button onPress={next} size="lg">{answers.length >= VOCABULARY_TEST_TOTAL ? '查看测评结果' : '下一题'}</Button> : <View style={styles.answerButtons}><Button onPress={() => submit(false)} size="lg" style={styles.flexButton} variant="outline">不认识</Button><Button onPress={() => submit(true)} size="lg" style={styles.flexButton}>认识</Button></View>}
      </View>
    </Screen>
  );
}

export function VocabularyTestResultView({ result, onBack, onRestart }: { result: VocabularyTestResult; onBack: () => void; onRestart: () => void }) {
  const wrong = result.answers.filter((answer) => !answer.correct);
  return (
    <Screen scroll contentStyle={styles.zero} header={<TopBar title="测评结果" onBack={onBack} />}>
      <View style={styles.page}>
        <View style={styles.resultHero}><AppText color={colors.primary} style={styles.score} variant="pageTitle">{result.totalRate}%</AppText><AppText variant="caption">答对 {result.correct} / {result.total}</AppText><AppText variant="sectionTitle" color={colors.primary} style={styles.verdict}>{result.verdict}</AppText></View>
        <Card style={styles.resultCard}><AppText variant="cardTitle">结果判断</AppText><AppText>{result.judgment}</AppText></Card>
        <Card style={styles.resultCard}><AppText variant="cardTitle">学习建议</AppText><AppText>{result.suggestion}</AppText></Card>
        <View style={styles.levelGrid}>{([3, 4, 5] as const).map((level) => { const stat = result.levelStats[level]; return <Card key={level} style={styles.levelCard}><AppText variant="caption">{level} 级词汇</AppText><AppText color={colors.primary} variant="sectionTitle">{stat.rate === null ? '—' : `${stat.rate}%`}</AppText><AppText variant="micro">{stat.correct} / {stat.total}</AppText></Card>; })}</View>
        <View style={styles.sectionHeading}><AppText variant="sectionTitle">本次错词</AppText><AppText variant="caption">{wrong.length} 词</AppText></View>
        {wrong.length ? <View style={styles.wrongList}>{wrong.map((answer) => <Card key={answer.wordId} style={styles.wrongCard}><View style={styles.grow}><AppText variant="cardTitle">{answer.word}</AppText><AppText variant="caption">{answer.meaning}</AppText></View><Pressable accessibilityLabel={`播放${answer.word}发音`} onPress={() => { void speakVocabularyWithFeedback(answer.word); }} style={styles.smallSound}><Volume2 color={colors.primary} size={16} /></Pressable></Card>)}</View> : <Card style={styles.perfectCard}><Check color={colors.primary} size={20} /><AppText>本次没有错词，继续保持。</AppText></Card>}
        <View style={styles.notice}><AppText variant="caption">本结果仅用于安排词汇学习，不是正式 ICAO 等级结论。</AppText></View>
        <Button leading={<RotateCcw color={colors.primaryForeground} size={17} />} onPress={onRestart} size="lg">重新测评</Button>
        <Button onPress={onBack} size="lg" variant="outline">返回单词学习</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0 },
  grow: { flex: 1 },
  page: { gap: spacing[4], padding: spacing[5], paddingBottom: spacing[8] },
  hero: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary10, borderRadius: radii.xxl, height: 72, justifyContent: 'center', marginTop: spacing[4], width: 72 },
  heading: { alignItems: 'center', gap: spacing[2] },
  center: { textAlign: 'center' },
  rulesCard: { gap: spacing[5], padding: spacing[5] },
  rule: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] },
  ruleNumber: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  notice: { backgroundColor: colors.secondary, borderRadius: radii.lg, padding: spacing[3] },
  lastResult: { gap: spacing[2] },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  testTopBar: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: spacing[3] },
  iconButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  topCenter: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  timer: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], height: 36, justifyContent: 'center', width: 58 },
  timerUrgent: { backgroundColor: 'rgba(219,43,51,0.10)' },
  progressWrap: { paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  runnerContent: { flexGrow: 1, padding: spacing[5] },
  testWordArea: { alignItems: 'center', flex: 1, gap: spacing[4], justifyContent: 'center', minHeight: 440 },
  testHint: { marginBottom: spacing[1] },
  testWord: { fontSize: 36, lineHeight: 46, textAlign: 'center' },
  sound: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  answerCard: { alignItems: 'center', gap: spacing[4], maxWidth: 520, padding: spacing[5], width: '100%' },
  answerHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  reviseButton: { borderColor: colors.destructive, backgroundColor: `${colors.destructive}1A`, alignSelf: 'center' },
  answerIcon: { alignItems: 'center', borderRadius: radii.full, height: 32, justifyContent: 'center', width: 32 },
  answerKnown: { backgroundColor: colors.primary10 },
  answerUnknown: { backgroundColor: `${colors.destructive}1A` },
  testMeaning: { lineHeight: 30, textAlign: 'center' },
  testActions: { backgroundColor: colors.background72, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  answerButtons: { flexDirection: 'row', gap: spacing[3] },
  flexButton: { flex: 1 },
  resultHero: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[5] },
  verdict: { alignSelf: 'center', textAlign: 'center', fontSize: 24, lineHeight: 32 },
  score: { fontSize: 50, lineHeight: 58 },
  resultCard: { gap: spacing[2], padding: spacing[5] },
  levelGrid: { flexDirection: 'row', gap: spacing[2] },
  levelCard: { alignItems: 'center', flex: 1, gap: spacing[1], paddingHorizontal: spacing[2] },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] },
  wrongList: { gap: spacing[2] },
  wrongCard: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  smallSound: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 36, justifyContent: 'center', width: 36 },
  perfectCard: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
});
