import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CalendarDays, Check, Flame, GraduationCap, MapPin, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type FeedItem = { title: string; badge: string; summary: string; date: string; image: number; body: string[] };
const articleImages = [require('../../../assets/content/article-1.jpg'), require('../../../assets/content/article-2.jpg'), require('../../../assets/content/article-3.jpg'), require('../../../assets/content/article-4.jpg')];
const resourceImages = [require('../../../assets/content/blog-1.jpg'), require('../../../assets/content/blog-2.jpg'), require('../../../assets/content/blog-3.jpg'), require('../../../assets/content/case-1.jpg'), require('../../../assets/content/case-2.jpg'), require('../../../assets/content/case-3.jpg')];
const articles: FeedItem[] = [
  { image: articleImages[0], badge: 'Safety', title: 'Single-Engine Failure: How Modern Airliners Stay in the Air', summary: '从 ETOPS 认证到动力、液压和电气冗余，理解现代双发客机的单发安全能力。', date: 'May 24, 2026', body: ['Modern transport-category aircraft are certified to climb, cruise, and land safely on a single engine.', 'ETOPS defines how far a twin can fly from the nearest suitable airport. Redundancy is built into every critical system.', 'For the crew, an engine failure triggers a well-rehearsed identify, confirm and secure sequence.'] },
  { image: articleImages[1], badge: 'ATC', title: 'How Busy Airports Sequence Traffic', summary: '进近管制如何利用速度、航向、高度与尾流间隔组织高密度到达流。', date: 'May 10, 2026', body: ['Controllers build an arrival sequence by assigning speeds, headings, and altitudes.', 'Wake turbulence separation and ground flow management add further constraints.'] },
  { image: articleImages[2], badge: 'Phraseology', title: 'Why Standard Phraseology Bridges Any Accent', summary: '标准结构、复诵协议和歧义预防如何构成航空通话的共同语言。', date: 'April 27, 2026', body: ['ICAO standard phraseology is a tightly defined set of words and structures designed to remove ambiguity.', 'Key information is always read back to confirm correct understanding.'] },
  { image: articleImages[3], badge: 'Industry', title: 'Sustainable Aviation Fuel and Decarbonization', summary: 'SAF 原料、混合比例、成本挑战与氢能/混合动力的长期前景。', date: 'April 8, 2026', body: ['Sustainable Aviation Fuel is the most promising near-term decarbonization lever.', 'Scaling supply and reducing production cost remain the central challenges.'] },
];
const resources: FeedItem[] = [
  { image: resourceImages[0], badge: '听力技巧', title: 'ICAO 4 听力理解：关键词抓取答题法', summary: '拆解放行、滑行、进近和特情场景中的数字、航向与跑道关键词。', date: '2026 年 5 月 18 日', body: ['听力失分往往不在生词，而在节奏。正确做法是先抓信息，再补语法。', '练习时先记录数字和专有名词，再回头补全句子结构。'] },
  { image: resourceImages[1], badge: 'OPI 专项', title: '复述、协商与突发情况表达框架', summary: '使用“确认信息—表达意图—给出方案”的三段式逻辑组织回答。', date: '2026 年 4 月 30 日', body: ['OPI 考查真实沟通能力，但清晰框架能帮助你在紧张环境中稳定表达。'] },
  { image: resourceImages[2], badge: '备考规划', title: '如何用 10 天高效冲刺 ICAO 4', summary: '前 3 天发音词汇，中间 4 天特情，最后 3 天全真模拟与复盘。', date: '2026 年 4 月 12 日', body: ['时间紧张不代表只能裸考，关键是把碎片时间用在刀刃上。'] },
  { image: resourceImages[3], badge: '从 3 分到 4 分', title: 'L 同学 · 21 级', summary: '8 课时特情对练后建立标准话术，10 天复考通过 ICAO 4。', date: '2026 年 5 月 6 日', body: ['针对特情场景逐个拆解，建立确认—执行—回报的标准话术。'] },
  { image: resourceImages[4], badge: '30 天稳过 ICAO 4', title: 'W 同学 · 20 级', summary: '从基础班补齐高频词和发音，首考通过。', date: '2026 年 4 月 22 日', body: ['循序渐进的训练帮助学员重新建立开口信心。'] },
  { image: resourceImages[5], badge: '冲击 ICAO 5 成功', title: 'Z 同学 · 19 级', summary: '专项打磨论述深度、互动主动性与用词准确度。', date: '2026 年 3 月 30 日', body: ['4 分到 5 分需要从能沟通升级到论述有深度、用词更精准。'] },
];

export function ContentLibraryScreen({ slug }: { slug: string }) {
  const [active, setActive] = useState<FeedItem>();
  if (slug === 'courses') return <CoursesScreen />;
  if (slug === 'hotspot') return <HotspotScreen />;
  const title = slug === 'articles' ? '优质文章' : '资源分享';
  const items = slug === 'articles' ? articles : resources;
  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title={title} />
      <View style={styles.intro}><AppText variant="pageTitle">{title}</AppText><AppText>{slug === 'articles' ? '精选民航知识与行业观察，每篇均保留音频版入口。' : '一线飞行员的备考方法与真实过级案例。'}</AppText></View>
      <View style={styles.list}>{items.map((item) => <FeedCard item={item} key={item.title} onPress={() => setActive(item)} />)}</View>
      <BottomSheet accessibilityLabel={active?.title ?? '内容详情'} onClose={() => setActive(undefined)} visible={Boolean(active)}>
        {active ? <View style={styles.detail}><Tag>{active.badge}</Tag><AppText variant="pageTitle">{active.title}</AppText><AppText variant="caption">{active.date}</AppText>{active.body.map((paragraph) => <AppText key={paragraph}>{paragraph}</AppText>)}<Button onPress={() => setActive(undefined)} size="lg">阅读完成</Button></View> : null}
      </BottomSheet>
    </Screen>
  );
}

function FeedCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  return <Pressable accessibilityLabel={`查看${item.title}`} onPress={onPress}><Card style={styles.feed}><Image contentFit="cover" source={item.image} style={styles.image} /><View style={styles.feedCopy}><Tag>{item.badge}</Tag><AppText variant="cardTitle">{item.title}</AppText><AppText numberOfLines={3}>{item.summary}</AppText><View style={styles.date}><CalendarDays color={colors.mutedForeground} size={14} /><AppText variant="micro">{item.date}</AppText><AppText color={colors.primary} style={styles.read} variant="button">查看详情</AppText></View></View></Card></Pressable>;
}

function CoursesScreen() {
  const courses = [{ title: 'ICAO 4 基础班', cycle: '30 天', items: ['高频词与发音', '听力场景', 'OPI 基础'] }, { title: 'ICAO 4 冲刺班', cycle: '10 天', items: ['真题高强度训练', '特情话术', '全真模拟'] }, { title: 'ICAO 5 进阶班', cycle: '40 天', items: ['论述深度', '互动主动性', '精准表达'] }];
  return <Screen scroll contentStyle={styles.screen}><TopBar title="体系课程" /><View style={styles.courseHero}><View style={styles.heroIcon}><GraduationCap color={colors.primary} size={26} /></View><AppText color={colors.primary} variant="micro">CURRICULUM SYSTEM</AppText><AppText variant="pageTitle">体系课程</AppText><AppText style={styles.center}>从入门到冲刺的 App 内课程体系；本阶段展示当前方案，不接支付或会员。</AppText></View><View style={styles.list}>{courses.map((course) => <Card key={course.title} style={styles.course}><View style={styles.date}><Star color={colors.primary} size={18} /><AppText variant="sectionTitle">{course.title}</AppText><Tag>{course.cycle}</Tag></View>{course.items.map((item) => <View key={item} style={styles.check}><Check color={colors.primary} size={15} /><AppText>{item}</AppText></View>)}<Button variant="outline">课程咨询演示</Button></Card>)}</View></Screen>;
}

function HotspotScreen() {
  const router = useRouter();
  const briefs = [{ date: '2026-07-09', title: '7月9日 考试资讯', centers: ['广汉考点', '绵阳考点'], topics: ['风切变', '危险品培训', '复飞', '五边威胁', '燃油政策'] }, { date: '2026-07-08', title: '7月8日 考试资讯', centers: ['广汉考点', '绵阳考点'], topics: ['TCAS', '冲出跑道落水', '飞行员疲劳', '无人机'] }];
  const [active, setActive] = useState<(typeof briefs)[number]>();
  return <Screen scroll contentStyle={styles.screen}><TopBar title="OPI 热点" /><View style={styles.intro}><AppText variant="pageTitle">每日考点资讯</AppText><AppText>一天一篇，查看当日真实主题或直接进入 OPI 题库。</AppText></View><View style={styles.list}>{briefs.map((brief) => <Card key={brief.date} style={styles.course}><View style={styles.date}><Flame color={colors.primary} size={20} /><AppText variant="sectionTitle">{brief.title}</AppText></View><View style={styles.tags}>{brief.centers.map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}</View><AppText>{brief.topics.length} 个考点：{brief.topics.join('、')}</AppText><View style={styles.actions}><Button onPress={() => router.push('/question-bank/opi')}>开始学习</Button><Button onPress={() => setActive(brief)} variant="outline">查看详情</Button></View></Card>)}</View><BottomSheet accessibilityLabel={active?.title ?? '考点详情'} onClose={() => setActive(undefined)} visible={Boolean(active)}>{active ? <View style={styles.detail}><AppText variant="pageTitle">{active.title}</AppText>{active.topics.map((topic, index) => <Card key={topic}><AppText color={colors.primary} variant="micro">TOPIC {index + 1}</AppText><AppText variant="cardTitle">{topic}</AppText><AppText>围绕该主题组织背景、风险、处置与个人观点，完成结构化口语表达。</AppText></Card>)}<Button onPress={() => { setActive(undefined); router.push('/question-bank/opi'); }} size="lg">开始今日考点学习</Button></View> : null}</BottomSheet></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, intro: { gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[4] }, list: { gap: spacing[3], paddingBottom: spacing[6] },
  feed: { overflow: 'hidden', padding: 0 }, image: { height: 170, width: '100%' }, feedCopy: { gap: spacing[2], padding: spacing[4] }, date: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, read: { flex: 1, textAlign: 'right' }, detail: { gap: spacing[3], paddingBottom: spacing[4] },
  courseHero: { alignItems: 'center', gap: spacing[2], padding: spacing[5] }, heroIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 52, justifyContent: 'center', width: 52 }, center: { textAlign: 'center' }, course: { gap: spacing[3] }, check: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, actions: { flexDirection: 'row', gap: spacing[2] },
});
