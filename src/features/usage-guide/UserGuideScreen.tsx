import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookMarked, Bot, ChevronRight, Flame, FolderOpen, Highlighter, Play, Radio } from '@/components/ui/icons';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, radii, spacing } from '@/theme';
import { HelpFaqList } from './HelpFaqList';
import { readTutorialProgress } from './tutorial-progress';
import { TUTORIAL_STEPS, type TutorialProgress } from './tutorial-model';

export const GUIDE_FEATURES = [
  { slug: 'vocab', title: '单词学习', icon: BookMarked, description: '选择不同词书，结合释义、例句和发音积累词汇。按认识、模糊、忘记等状态学习，回顾薄弱词；30题动态测评帮助了解词汇识别情况，不等同于官方等级。词书与题库查词的收藏集中管理。' },
  { slug: 'radio', title: '随身听', icon: Radio, description: '随时播放900句、听力和故事复诵等音频。支持顺序、随机和单曲循环，可调整倍速、播放间隔及字幕模式。想深入练习时，可以直接进入当前音频对应的题目。' },
  { slug: 'hotspot', title: 'OPI 热点', icon: Flame, description: '按考试日期查看考点话题与相关问题，选择热点即可进入对应学习。标注、查词和回答继续使用同一套工具，结束后还可回顾本次学习。' },
  { slug: 'resources', title: '资源分享', icon: FolderOpen, description: '阅读航空英语备考方法、学习资料与实用资源文章，了解备考思路，补充日常练习。' },
  { slug: 'mock-exam', title: '模拟练习', icon: Bot, description: '根据考试类型选择板块，进行完整或自选练习。按模拟流程作答，结束后查看适用的成绩信息，并在学习记录中回看。' },
] as const;
export function UserGuideScreen() {
  const router = useRouter();
  const auth = useAuth();
  const accountId = auth.account?.accountId ?? (auth.uiAcceptanceMode ? 'ui-acceptance' : undefined);
  const [saved, setSaved] = useState<{ accountId: string; progress: TutorialProgress }>();
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setError('');
    if (accountId) void readTutorialProgress(accountId).then(progress => { if (active) setSaved({ accountId, progress }); }).catch(() => { if (active) setError('教程进度暂时无法读取，可以稍后重试；学习数据不受影响。'); });
    return () => { active = false; };
  }, [accountId]));
  const progress = saved && saved.accountId === accountId ? saved.progress : undefined;
  const complete = progress && progress.step >= TUTORIAL_STEPS.length;
  const started = progress && progress.step > 0;
  function start(restart = false) { router.push({ pathname: '/info/[slug]', params: { slug: 'tutorial', ...(restart ? { restart: '1' } : {}) } }); }
  return <Screen scroll contentStyle={styles.screen}>
    <TopBar title="使用指南" />
    <View style={styles.header}><AppText color={colors.primary} variant="micro">跟着学一题，了解全部功能</AppText><AppText variant="pageTitle">把每次练习，变成自己的积累。</AppText><AppText>从900句 Sentence1开始，亲手试一遍学习工具。其他学习方式，在下面快速了解。</AppText></View>
    <Card elevated style={styles.tutorial}>
      <View style={styles.row}><View style={styles.icon}><Highlighter color={colors.primary} size={22} /></View><View style={{ flex: 1 }}><AppText variant="sectionTitle">跟着学一题</AppText><AppText variant="caption">Sentence1 · Maintaining FL310.</AppText></View></View>
      <AppText>听一句、标重点、查生词、记笔记，再录音、查看AI结果，最后回顾自己的积累。</AppText>
      <AppText variant="caption">直接使用真实学习页面；操作会正常保存。支持跳过、退出和重新体验。AI沿用现有权限及额度流程。</AppText>
      {started ? <AppText color={colors.primary} variant="caption">{complete ? '已完成教程，可以随时重新体验。' : `上次进行到：${TUTORIAL_STEPS[progress.step]?.title}`}</AppText> : null}
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      <Button leading={<Play color={colors.primaryForeground} size={17} />} onPress={() => start(Boolean(complete))}>{complete ? '重新体验' : started ? '继续教程' : '开始新手教程'}</Button>
      {started && !complete ? <Button variant="ghost" onPress={() => start(true)}>从头体验（保留学习数据）</Button> : null}
    </Card>
    <AppText variant="caption" style={{ marginTop: spacing[3] }}>题库首页可切换最全、精选或考试真题；在个人资料中选择自己的考试目标。</AppText>
    <View style={styles.section}><AppText variant="sectionTitle">发现更多学习方式</AppText><AppText variant="caption">了解用途，选择你需要的方式开始。</AppText></View>
    {GUIDE_FEATURES.map(({ slug, title, icon: Icon, description }) => <View key={slug} style={styles.feature}>
      <View style={styles.row}><Icon color={colors.primary} size={21} /><AppText variant="cardTitle">{title}</AppText></View>
      <AppText>{description}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`前往${title}`} onPress={() => router.push({ pathname: '/content/[slug]', params: { slug } })} style={styles.link}><AppText color={colors.primary} variant="button">去试试</AppText><ChevronRight color={colors.primary} size={16} /></Pressable>
    </View>)}
    <View style={styles.section}><AppText variant="sectionTitle">学习成果，还能这样用</AppText></View>
    <AppText>在「我的标注」集中查看标签、高亮和笔记；题库查词与单词学习的收藏统一放在「单词收藏」；结束后的练习保存在「学习记录」，可以回到对应题目。</AppText>
    <Card style={styles.export}><AppText variant="cardTitle">导出自己的900句资料</AppText><AppText>按等级、已学习或有标注等范围筛选，可选择包含中文翻译、自己的高亮、标签和笔记，生成PDF。</AppText><Button variant="outline" onPress={() => router.push({ pathname: '/question-bank/[bankId]', params: { bankId: 'sentences900', export: '1' } })}>前往900句导出</Button></Card>
    <View style={styles.section}><AppText variant="sectionTitle">常见问题</AppText></View><HelpFaqList />
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingBottom: spacing[8] }, header: { gap: spacing[3], marginVertical: spacing[4] }, tutorial: { gap: spacing[3], marginTop: spacing[2] }, row: { flexDirection: 'row', gap: spacing[3], alignItems: 'center' }, icon: { padding: spacing[3], borderRadius: radii.lg, backgroundColor: colors.primary08 }, section: { marginTop: spacing[8], marginBottom: spacing[3], gap: spacing[1] }, feature: { paddingVertical: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing[3] }, link: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], alignSelf: 'flex-start', minHeight: 44 }, export: { gap: spacing[3], marginTop: spacing[4] } });
