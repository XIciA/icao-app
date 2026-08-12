import { BookOpenText, Check, Headphones, MessageSquareQuote, Mic2, RadioTower, Sparkles } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { buildMockExamSession, toQuestionBankStudyPackage } from '@/features/mock-exam/build-session';
import { discardLegacyMockExamDraft } from '@/features/mock-exam/legacy-draft-cleanup';
import { MOCK_EXAM_MODULES, MOCK_EXAM_TYPE_LABELS } from '@/features/mock-exam/rules';
import type { MockExamModuleId, MockExamType } from '@/features/mock-exam/types';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import type { QuestionBankStudyPackage } from '@/features/question-bank/types';
import { colors, radii, spacing } from '@/theme';

const modules: { id: MockExamModuleId; title: string; icon: typeof Headphones }[] = [
  { id: 'listening', title: '听力', icon: Headphones }, { id: 'sentences900', title: '900 句', icon: MessageSquareQuote }, { id: 'radiotelephony', title: '陆空通话', icon: RadioTower }, { id: 'storytelling', title: '故事复诵', icon: BookOpenText }, { id: 'opi', title: 'OPI', icon: Mic2 },
];

export function MockExamScreen() {
  const [examType, setExamType] = useState<MockExamType>('icao4-first');
  const [selected, setSelected] = useState<Set<MockExamModuleId>>(() => new Set(MOCK_EXAM_MODULES['icao4-first']));
  const [studyPackage, setStudyPackage] = useState<QuestionBankStudyPackage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { void discardLegacyMockExamDraft(); }, []);
  const allowed = MOCK_EXAM_MODULES[examType];
  const selectedIds = allowed.filter((id) => selected.has(id));
  const complete = selectedIds.length === allowed.length;
  const chooseType = (next: MockExamType) => { setExamType(next); setSelected(new Set(MOCK_EXAM_MODULES[next])); setError(undefined); };
  const start = async () => { if (!selectedIds.length) return; setBusy(true); setError(undefined); try { setStudyPackage(toQuestionBankStudyPackage(await buildMockExamSession({ examType, modules: selectedIds }))); } catch (value) { setError(value instanceof Error ? value.message : '试卷生成失败，请重试。'); } finally { setBusy(false); } };
  if (studyPackage) return <QuestionBankStudyScreen onReturn={() => setStudyPackage(undefined)} returnLabel="返回 AI 模考" sourceRoute="/content/mock-exam" studyPackage={studyPackage} />;
  return <Screen scroll contentStyle={styles.screen}><TopBar title="AI 模考" /><View style={styles.setup}>
    <View style={styles.hero}><AppText color={colors.primary} variant="micro">LEARNING MOCK EXAM</AppText><AppText variant="pageTitle">学习型模考</AppText><AppText>按考试规则组卷，作答和复盘沿用题库学习页。本功能不提供官方等级或评分。</AppText></View>
    <Section title="考试类型"><View style={styles.types}>{(Object.keys(MOCK_EXAM_MODULES) as MockExamType[]).map((id) => <Pressable key={id} onPress={() => chooseType(id)} style={[styles.type, examType === id && styles.active]}>{examType === id ? <View style={styles.typeCheck}><Check color={colors.primaryForeground} size={10} /></View> : null}<AppText style={styles.center} variant="sectionTitle">{MOCK_EXAM_TYPE_LABELS[id].replace(' 初考', '').replace(' 复考', '')}</AppText><AppText color={examType === id ? colors.primary : colors.mutedForeground} variant="caption">{id.endsWith('recert') ? '复考' : '初考'}</AppText></Pressable>)}</View></Section>
    <Section right={`已选 ${selectedIds.length}/${allowed.length}`} title="考试板块"><View style={styles.moduleGrid}>{modules.filter((entry) => allowed.includes(entry.id)).map((entry) => { const Icon = entry.icon; const checked = selected.has(entry.id); return <Pressable key={entry.id} onPress={() => setSelected((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} style={[styles.module, checked && styles.active]}><View style={styles.moduleIcon}><Icon color={checked ? colors.primary : colors.mutedForeground} size={18} /></View><AppText style={styles.copy} variant="button">{entry.title}</AppText><View style={[styles.checkBox, checked && styles.checkBoxActive]}>{checked ? <Check color={colors.primaryForeground} size={11} /> : null}</View></Pressable>; })}</View><AppText variant="micro">{complete ? '已选择全部规则板块，将生成一套完整练习卷。' : '当前为自选模考，学习记录会保留所选板块。'}</AppText></Section>
    <Card style={styles.notice}><AppText variant="button">本次说明</AppText><AppText variant="caption">题目从共享题库无放回抽取；试卷目录按本套题目分组，可自由跳题。单题答案与复盘保持学习页行为，结束后只生成一条模考学习记录。</AppText></Card>
    {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={!selectedIds.length || busy} leading={<Sparkles color={colors.primaryForeground} size={18} />} onPress={() => void start()} size="lg">{busy ? '正在生成试卷…' : selectedIds.length ? `开始${complete ? '完整' : '自选'}模考` : '请至少选择一个板块'}</Button>
  </View></Screen>;
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) { return <View style={styles.section}><View style={styles.row}><AppText variant="sectionTitle">{title}</AppText>{right ? <AppText variant="micro">{right}</AppText> : null}</View>{children}</View>; }
const styles = StyleSheet.create({ screen: { paddingHorizontal: 0 }, setup: { gap: spacing[5], padding: spacing[5], paddingBottom: spacing[6] }, hero: { gap: spacing[2] }, section: { gap: spacing[2] }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, types: { flexDirection: 'row', gap: spacing[2] }, type: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, flex: 1, gap: 1, justifyContent: 'center', minHeight: 68, position: 'relative' }, typeCheck: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 18, justifyContent: 'center', position: 'absolute', right: 6, top: 6, width: 18 }, active: { backgroundColor: colors.primary06, borderColor: colors.primary }, center: { textAlign: 'center' }, moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, module: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2], minHeight: 58, padding: spacing[2], width: '48%' }, moduleIcon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.lg, height: 36, justifyContent: 'center', width: 36 }, copy: { flex: 1 }, checkBox: { alignItems: 'center', borderColor: colors.border, borderRadius: 6, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 }, checkBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary }, notice: { gap: spacing[2] }, });
