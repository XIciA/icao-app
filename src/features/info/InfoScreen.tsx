import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, FileText, HelpCircle, ImagePlus, Info, Mail, MessageSquarePlus, Phone, RefreshCcw, ShieldCheck, Star, Upload, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { colors, radii, spacing } from '@/theme';

type InfoSlug = 'hub' | 'help' | 'feedback' | 'about' | 'agreement' | 'privacy';
const pages: InfoSlug[] = ['hub', 'help', 'feedback', 'about', 'agreement', 'privacy'];

export function InfoScreen() {
  const { slug } = useLocalSearchParams<{ slug: InfoSlug }>();
  const page: InfoSlug = pages.includes(slug) ? slug : 'hub';
  if (page === 'hub') return <InfoHub />;
  if (page === 'help') return <HelpPage />;
  if (page === 'feedback') return <FeedbackPage />;
  if (page === 'about') return <AboutPage />;
  return <LegalPage page={page} />;
}

function Page({ title, children, scroll = true }: { title: string; children: React.ReactNode; scroll?: boolean }) { return <Screen scroll={scroll} keyboard contentStyle={styles.screen}><TopBar title={title} />{children}</Screen>; }

function InfoHub() {
  const router = useRouter();
  return <Page title="信息与帮助"><View style={styles.content}><Section title="帮助"><Row icon={HelpCircle} label="帮助与反馈" hint="常见问题与意见反馈" first onPress={() => router.push('/info/help')} /><Row icon={Info} label="关于 ICAO 学习" hint={`版本 ${APP_DISPLAY_VERSION}`} onPress={() => router.push('/info/about')} /></Section><Section title="法律条款"><Row icon={FileText} label="用户协议" first onPress={() => router.push('/info/agreement')} /><Row icon={ShieldCheck} label="隐私政策" onPress={() => router.push('/info/privacy')} /></Section></View></Page>;
}

function HelpPage() {
  const router = useRouter(); const [open, setOpen] = useState(-1);
  const faqs = [
    ['如何切换不同的题库？', '在题库首页点击右上角等级或进入对应模块，即可切换学习内容。'],
    ['我的标注和笔记会同步吗？', '当前仅保存在本机。真实云同步将在后续阶段接入。'],
    ['随身听支持后台播放吗？', '当前版本仅验证基础播放流程，后台能力以正式版本为准。'],
    ['如何参加 AI 模拟考试？', '入口和流程为设计稿示例，真实 AI 评分能力暂未接入。'],
  ];
  return <Page title="帮助与反馈"><View style={styles.content}><View style={styles.faqList}>{faqs.map(([question, answer], index) => <Pressable key={question} onPress={() => setOpen(open === index ? -1 : index)}><Card style={styles.faq}><View style={styles.row}><BookOpen color={colors.primary} size={16} /><AppText style={styles.flex} variant="button">{question}</AppText><ChevronDown color={colors.mutedForeground} size={16} style={{ transform: [{ rotate: open === index ? '180deg' : '0deg' }] }} /></View>{open === index ? <AppText style={styles.answer}>{answer}</AppText> : null}</Card></Pressable>)}</View><Section title="联系我们"><Row icon={MessageSquarePlus} label="提交反馈" hint="告诉我们你的建议或遇到的问题" first onPress={() => router.push('/info/feedback')} /><Row icon={Phone} label="客服电话" value="400-000-1234" /><Row icon={Mail} label="邮件支持" value="support@icao.app" /></Section></View></Page>;
}

type FeedbackState = 'idle' | 'success' | 'error';
function FeedbackPage() {
  const router = useRouter(); const [state, setState] = useState<FeedbackState>('idle'); const [category, setCategory] = useState('功能建议'); const [content, setContent] = useState(''); const [contact, setContact] = useState('');
  if (state !== 'idle') { const success = state === 'success'; return <Page title="提交反馈" scroll={false}><View style={styles.result}><View style={[styles.resultIcon, !success && styles.resultIconError]}>{success ? <CheckCircle2 color={colors.primary} size={38} /> : <XCircle color={colors.destructive} size={38} />}</View><AppText variant="sectionTitle">{success ? '反馈提交成功' : '提交失败'}</AppText><AppText style={styles.center}>{success ? '感谢你的反馈！我们已收到你的意见，将在 1-3 个工作日内处理。' : '网络似乎出了点问题，你的反馈没有发送成功。请检查网络后重试。'}</AppText><View style={styles.resultActions}>{success ? <><Button onPress={() => router.replace('/info/help')} size="lg">返回帮助中心</Button><Button onPress={() => setState('idle')} size="lg" variant="outline">再提一条</Button></> : <><Button leading={<RefreshCcw color={colors.primaryForeground} size={16} />} onPress={() => setState('idle')} size="lg">重新提交</Button><Button onPress={() => router.back()} size="lg" variant="outline">稍后再说</Button></>}</View><AppText variant="micro">演示结果 · 未连接真实反馈服务</AppText></View></Page>; }
  return <Page title="提交反馈"><View style={styles.feedback}><Choice label="反馈类型" options={['功能建议', '内容纠错', '播放/音频', '账号问题', '其他']} value={category} onChange={setCategory} /><TextField label="问题描述" maxLength={500} multiline onChangeText={setContent} placeholder="请详细描述你的建议或遇到的问题，我们会认真处理每一条反馈。" style={styles.textarea} value={content} /><AppText style={styles.count} variant="micro">{content.length} / 500</AppText><View style={styles.uploadGroup}><AppText variant="button">添加图片（选填）</AppText><Pressable style={styles.upload}><ImagePlus color={colors.mutedForeground} size={20} /><AppText variant="micro">上传</AppText></Pressable></View><TextField label="联系方式（选填）" onChangeText={setContact} placeholder="手机号或邮箱，便于我们回复你" value={contact} /><Button disabled={content.trim().length < 5} onPress={() => setState('success')} size="lg">提交反馈</Button><Pressable onPress={() => setState('error')}><AppText style={styles.center} variant="micro">预览提交失败状态</AppText></Pressable><AppText style={styles.center} variant="micro">当前为界面演示，内容不会发送</AppText></View></Page>;
}

function AboutPage() {
  const router = useRouter();
  return <Page title="关于"><View style={styles.aboutHero}><View style={styles.logo}><Upload color={colors.primaryForeground} size={28} style={{ transform: [{ rotate: '-45deg' }] }} /></View><AppText variant="sectionTitle">ICAO 学习</AppText><AppText variant="caption">航空英语 · 陆空通话备考助手</AppText><View style={styles.versionPill}><AppText variant="micro">版本 {APP_DISPLAY_VERSION}</AppText></View></View><View style={styles.content}><Section><Row icon={RefreshCcw} label="检查更新" value="已是最新版本" first /><Row icon={Star} label="给我们评分" hint="去应用商店支持我们" onPress={() => undefined} /><Row icon={Upload} label="分享给朋友" onPress={() => undefined} /></Section><Section><Row icon={FileText} label="用户协议" first onPress={() => router.push('/info/agreement')} /><Row icon={ShieldCheck} label="隐私政策" onPress={() => router.push('/info/privacy')} /></Section><AppText style={styles.copyright} variant="micro">Copyright © 2026 ICAO 学习{`\n`}All rights reserved · 京 ICP 备 00000000 号</AppText></View></Page>;
}

function LegalPage({ page }: { page: 'agreement' | 'privacy' }) {
  const isAgreement = page === 'agreement';
  const intro = isAgreement ? '欢迎使用 ICAO 学习。在注册或使用本应用前，请仔细阅读并充分理解本协议各条款。' : '我们非常重视您的个人信息与隐私保护。本政策说明我们如何收集、使用、存储和保护您的信息，请您仔细阅读。';
  const clauses = isAgreement ? [
    ['协议的接受与变更', '本协议构成您与本应用之间就使用服务达成的完整约定。我们可能根据业务需要不时更新本协议。'],
    ['账号注册与使用', '您应提供真实、准确的注册信息，并妥善保管账号与密码。因保管不当造成的损失由您自行承担。'],
    ['学习内容与知识产权', '应用内题库、音频、课程及文章等内容受知识产权法律保护，仅供个人学习使用。'],
    ['用户行为规范', '不得利用本服务从事违法违规活动，不得干扰平台正常运行。'],
  ] : [
    ['我们收集的信息', '账号信息：注册时的手机号、邮箱、昵称等基础资料。学习数据：您的做题记录、收藏、标注与学习进度。'],
    ['信息的使用', '我们仅在提供学习服务、优化学习体验和保障账号安全的范围内使用上述信息。'],
    ['信息的存储与保护', '当前演示版本的数据主要保存在本机。真实服务接入前将重新确认保存期限与安全措施。'],
    ['信息的共享', '除法律法规要求外，我们不会向无关第三方出售或共享您的个人信息。'],
  ];
  return <Page title={isAgreement ? '用户协议' : '隐私政策'}><View style={styles.legal}><AppText variant="pageTitle">{isAgreement ? '用户服务协议' : '隐私政策'}</AppText><AppText variant="micro">版本 v2.4 · 更新于 2026-06-01 · 生效于 2026-06-15</AppText><Card style={styles.intro}><AppText>{intro}</AppText></Card>{clauses.map(([title, body], index) => <View key={title} style={styles.clause}><View style={styles.clauseTitle}><View style={styles.number}><AppText color={colors.primary} variant="micro">{index + 1}</AppText></View><AppText variant="button">{title}</AppText></View><AppText style={styles.clauseBody}>{body}</AppText></View>)}<AppText style={styles.center} variant="micro">— 本文档为示例文案，非正式法律文本 —</AppText></View></Page>;
}

function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) { return <View style={styles.choice}><AppText variant="button">{label}</AppText><View style={styles.chips}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.chip, option === value && styles.chipSelected]}><AppText color={option === value ? colors.primary : colors.mutedForeground} variant="micro">{option}</AppText></Pressable>)}</View></View>; }
function Section({ title, children }: { title?: string; children: React.ReactNode }) { return <View style={styles.section}>{title ? <AppText variant="caption">{title}</AppText> : null}<Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, hint, value, first = false, onPress }: { icon: typeof Info; label: string; hint?: string; value?: string; first?: boolean; onPress?: () => void }) { const body = <View style={[styles.menuRow, !first && styles.border]}><View style={styles.menuIcon}><Icon color={colors.primary} size={16} /></View><View style={styles.flex}><AppText variant="button">{label}</AppText>{hint ? <AppText variant="micro">{hint}</AppText> : null}</View>{value ? <AppText variant="caption">{value}</AppText> : null}{onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}</View>; return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[4] }, section: { gap: spacing[2] }, rows: { padding: 0 }, menuRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, menuIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, flex: { flex: 1 }, faqList: { gap: spacing[2.5] }, faq: { gap: spacing[3], padding: spacing[3] }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, answer: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[3] }, feedback: { gap: spacing[4], padding: spacing[5] }, choice: { gap: spacing[2] }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, chip: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }, chipSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, textarea: { minHeight: 112, textAlignVertical: 'top' }, count: { marginTop: -spacing[3], textAlign: 'right' }, uploadGroup: { gap: spacing[2] }, upload: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, gap: spacing[1], height: 78, justifyContent: 'center', width: 78 }, result: { alignItems: 'center', flex: 1, gap: spacing[3], justifyContent: 'center', padding: spacing[8] }, resultIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 80, justifyContent: 'center', width: 80 }, resultIconError: { backgroundColor: 'rgba(219,43,51,0.10)' }, center: { textAlign: 'center' }, resultActions: { gap: spacing[2.5], marginTop: spacing[4], width: '100%' }, aboutHero: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[8] }, logo: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, versionPill: { backgroundColor: colors.secondary, borderRadius: radii.full, marginTop: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[1.5] }, copyright: { lineHeight: 18, marginTop: spacing[4], textAlign: 'center' }, legal: { gap: spacing[4], padding: spacing[5] }, intro: { backgroundColor: colors.secondary }, clause: { gap: spacing[2] }, clauseTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, number: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.sm, height: 22, justifyContent: 'center', width: 22 }, clauseBody: { paddingLeft: spacing[8] },
});
