import { BookMarked, Check, ChevronRight, RotateCcw, Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

const words = [
  { word: 'maintain', phonetic: '/meɪnˈteɪn/', meaning: '保持；维持', example: 'Maintain flight level three one zero.' },
  { word: 'clearance', phonetic: '/ˈklɪərəns/', meaning: '许可；放行', example: 'Stand by for your departure clearance.' },
  { word: 'divert', phonetic: '/daɪˈvɜːt/', meaning: '备降；改航', example: 'We need to divert due to weather.' },
  { word: 'turbulence', phonetic: '/ˈtɜːbjələns/', meaning: '颠簸；湍流', example: 'Expect moderate turbulence ahead.' },
];

type Step = 'books' | 'list' | 'study' | 'test' | 'done';
export function VocabScreen() {
  const [step, setStep] = useState<Step>('books');
  const [index, setIndex] = useState(0);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [answer, setAnswer] = useState<number>();
  const word = words[index];

  if (step === 'study') return <Study word={word} index={index} known={known.has(index)} onKnown={() => setKnown((current) => new Set(current).add(index))} onNext={() => index < words.length - 1 ? setIndex(index + 1) : setStep('test')} onBack={() => setStep('list')} />;
  if (step === 'test') return <Test word={word} answer={answer} onAnswer={setAnswer} onFinish={() => setStep('done')} />;
  if (step === 'done') return <Screen contentStyle={styles.complete}><View style={styles.completeIcon}><Check color={colors.primary} size={34} /></View><AppText variant="pageTitle">本组学习完成</AppText><AppText style={styles.center}>已学习 {words.length} 个航空高频词，掌握 {known.size} 个。</AppText><Button onPress={() => { setIndex(0); setAnswer(undefined); setStep('study'); }} leading={<RotateCcw color={colors.primaryForeground} size={17} />} size="lg">再学一遍</Button><Button onPress={() => setStep('books')} size="lg" variant="outline">返回词书</Button></Screen>;

  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title={step === 'books' ? '单词学习' : '航空核心词汇'} />
      {step === 'books' ? <><View style={styles.header}><AppText color={colors.primary} variant="micro">VOCABULARY</AppText><AppText variant="pageTitle">选择词书</AppText><AppText>按航空场景学习高频词汇，并通过小测巩固记忆。</AppText></View><Pressable onPress={() => setStep('list')}><Card elevated style={styles.book}><View style={styles.bookIcon}><BookMarked color={colors.primary} size={24} /></View><View style={styles.copy}><AppText variant="sectionTitle">航空核心词汇</AppText><AppText>4 个演示词 · 场景例句 · 随堂测试</AppText><View style={styles.progress}><View style={[styles.fill, { width: `${(known.size / words.length) * 100}%` }]} /></View></View><ChevronRight color={colors.mutedForeground} /></Card></Pressable></> : <><View style={styles.header}><AppText variant="pageTitle">单词列表</AppText><AppText>{known.size}/{words.length} 已掌握</AppText></View><View style={styles.list}>{words.map((item, itemIndex) => <Pressable key={item.word} onPress={() => { setIndex(itemIndex); setStep('study'); }}><Card style={styles.wordRow}><View style={styles.copy}><AppText variant="cardTitle">{item.word}</AppText><AppText variant="caption">{item.meaning}</AppText></View>{known.has(itemIndex) ? <Tag>已掌握</Tag> : <AppText variant="micro">学习</AppText>}</Card></Pressable>)}</View></>}
    </Screen>
  );
}

function Study({ word, index, known, onKnown, onNext, onBack }: { word: (typeof words)[number]; index: number; known: boolean; onKnown: () => void; onNext: () => void; onBack: () => void }) {
  return <Screen contentStyle={styles.screen}><TopBar onBack={onBack} title="单词学习" /><View style={styles.studyHeader}><AppText variant="micro">{index + 1} / {words.length}</AppText><View style={styles.progress}><View style={[styles.fill, { width: `${((index + 1) / words.length) * 100}%` }]} /></View></View><Card elevated style={styles.wordCard}><View style={styles.speaker}><Volume2 color={colors.primary} size={22} /></View><AppText style={styles.word} variant="pageTitle">{word.word}</AppText><AppText style={styles.phonetic}>{word.phonetic}</AppText><AppText variant="sectionTitle">{word.meaning}</AppText><View style={styles.example}><AppText color={colors.primary} variant="micro">AVIATION EXAMPLE</AppText><AppText>{word.example}</AppText></View></Card><View style={styles.actions}><Button onPress={onKnown} variant={known ? 'outline' : 'primary'}>{known ? '已标记掌握' : '我认识'}</Button><Button onPress={onNext}>继续</Button></View></Screen>;
}
function Test({ word, answer, onAnswer, onFinish }: { word: (typeof words)[number]; answer?: number; onAnswer: (value: number) => void; onFinish: () => void }) {
  const choices = ['保持；维持', '备降；改航', '许可；放行', '颠簸；湍流'];
  return <Screen contentStyle={styles.screen}><TopBar title="随堂测试" /><View style={styles.header}><AppText color={colors.primary} variant="micro">QUICK TEST</AppText><AppText variant="pageTitle">{word.word}</AppText><AppText>请选择最符合的中文含义。</AppText></View><View style={styles.list}>{choices.map((choice, i) => <Pressable key={choice} onPress={() => onAnswer(i)}><Card style={[styles.choice, answer === i ? styles.choiceActive : null]}><AppText style={styles.letter} variant="button">{String.fromCharCode(65 + i)}</AppText><AppText style={styles.copy}>{choice}</AppText>{answer === i ? <Check color={colors.primary} /> : null}</Card></Pressable>)}</View><Button disabled={answer === undefined} onPress={onFinish} size="lg">查看学习结果</Button></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, header: { gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[4] }, list: { gap: spacing[3], paddingBottom: spacing[5] },
  book: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, bookIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 52, justifyContent: 'center', width: 52 }, copy: { flex: 1 },
  progress: { backgroundColor: colors.secondary, borderRadius: radii.full, height: 7, marginTop: spacing[2], overflow: 'hidden' }, fill: { backgroundColor: colors.primary, height: '100%' }, wordRow: { alignItems: 'center', flexDirection: 'row' },
  studyHeader: { gap: spacing[2], paddingVertical: spacing[4] }, wordCard: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[6] }, speaker: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 52, justifyContent: 'center', width: 52 }, word: { fontSize: 38 }, phonetic: { color: colors.mutedForeground, fontFamily: fonts.monoRegular }, example: { alignSelf: 'stretch', backgroundColor: colors.primary06, borderRadius: radii.xl, gap: spacing[2], padding: spacing[4] }, actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  choice: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, choiceActive: { borderColor: colors.primary, backgroundColor: colors.primary06 }, letter: { color: colors.primary, width: 28 }, complete: { alignItems: 'center', gap: spacing[4], justifyContent: 'center' }, completeIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 72, justifyContent: 'center', width: 72 }, center: { textAlign: 'center' },
});
