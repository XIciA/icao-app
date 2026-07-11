import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronDown, ChevronRight, Mail, MessageCircleQuestion } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type InfoSlug = 'help' | 'feedback' | 'about' | 'agreement' | 'privacy';
const titles: Record<InfoSlug, string> = { help: '帮助中心', feedback: '意见反馈', about: '关于 ICAO', agreement: '用户协议', privacy: '隐私政策' };

export function InfoScreen() {
  const { slug } = useLocalSearchParams<{ slug: InfoSlug }>();
  const page = titles[slug] ? slug : 'help';
  if (page === 'help') return <HelpPage />;
  if (page === 'feedback') return <FeedbackPage />;
  if (page === 'about') return <AboutPage />;
  return <LegalPage page={page} />;
}

function HelpPage() {
  const router = useRouter(); const [open, setOpen] = useState(0);
  const faqs = [{ q: '学习记录保存在哪里？', a: '当前阶段保存在本机 SQLite 中。删除 App 可能会清除数据，云同步尚未接入。' }, { q: '为什么有些口语音频是占位状态？', a: 'OPI 生成音频属于未来服务能力，当前页面会明确显示占位，不会伪装成真实结果。' }, { q: '如何开启麦克风权限？', a: '首次录音时系统会请求权限；若曾拒绝，可以从设置或权限状态页前往系统设置。' }];
  return <Screen scroll contentStyle={styles.screen}><TopBar title="帮助中心" /><View style={styles.hero}><View style={styles.icon}><MessageCircleQuestion color={colors.primary} size={28} /></View><AppText variant="pageTitle">有什么可以帮你？</AppText><AppText style={styles.center}>常见问题、反馈入口与协议说明。</AppText></View><View style={styles.block}><View style={styles.faqs}>{faqs.map((item, index) => <Pressable key={item.q} onPress={() => setOpen(open === index ? -1 : index)}><Card style={styles.faq}><View style={styles.row}><AppText style={styles.flex} variant="button">{item.q}</AppText><ChevronDown color={colors.mutedForeground} size={18} style={{ transform: [{ rotate: open === index ? '180deg' : '0deg' }] }} /></View>{open === index ? <AppText>{item.a}</AppText> : null}</Card></Pressable>)}</View><Card style={styles.contact}><Mail color={colors.primary} size={22} /><View style={styles.flex}><AppText variant="cardTitle">仍需帮助</AppText><AppText variant="caption">通过反馈演示描述问题</AppText></View><Pressable onPress={() => router.push('/info/feedback')}><ChevronRight color={colors.primary} /></Pressable></Card></View></Screen>;
}

function FeedbackPage() {
  const [content, setContent] = useState(''); const [contact, setContact] = useState(''); const [done, setDone] = useState(false);
  return <Screen keyboard scroll contentStyle={styles.screen}><TopBar title="意见反馈" /><View style={styles.block}><Card style={styles.form}><TextField label="问题描述" multiline onChangeText={setContent} placeholder="请说明遇到的问题或建议" style={styles.textarea} value={content} /><TextField label="联系方式（选填）" onChangeText={setContact} placeholder="邮箱或手机号" value={contact} /><Button disabled={content.trim().length < 5} onPress={() => setDone(true)} size="lg">提交反馈演示</Button></Card><AppText variant="caption">本阶段不连接工单或邮件服务，内容不会发送。</AppText></View><BottomSheet onClose={() => setDone(false)} visible={done}><View style={styles.sheet}><CheckCircle2 color={colors.primary} size={36} /><AppText variant="sectionTitle">已完成提交演示</AppText><AppText style={styles.center}>反馈没有发送到服务器；真实提交能力将在后续服务阶段接入。</AppText><Button onPress={() => setDone(false)}>我知道了</Button></View></BottomSheet></Screen>;
}

function AboutPage() {
  const router = useRouter();
  return <Screen scroll contentStyle={styles.screen}><TopBar title="关于 ICAO" /><View style={styles.hero}><View style={styles.logo}><AppText color={colors.primary} variant="sectionTitle">ICAO</AppText></View><AppText variant="pageTitle">飞猪 ICAO</AppText><Tag>Development Build · 1.0.0</Tag><AppText style={styles.center}>专为民航英语学习构建的移动学习空间。</AppText></View><Card style={styles.menu}><Pressable onPress={() => router.push('/info/agreement')} style={styles.menuRow}><AppText style={styles.flex} variant="button">用户协议</AppText><ChevronRight color={colors.mutedForeground} size={18} /></Pressable><Pressable onPress={() => router.push('/info/privacy')} style={[styles.menuRow, styles.border]}><AppText style={styles.flex} variant="button">隐私政策</AppText><ChevronRight color={colors.mutedForeground} size={18} /></Pressable></Card><AppText style={styles.version} variant="micro">© 2026 飞猪 ICAO · 阶段 5 演示版本</AppText></Screen>;
}

function LegalPage({ page }: { page: 'agreement' | 'privacy' }) {
  const agreement = ['使用范围', '本应用当前 Development Build 用于验证学习流程、页面交互与本地数据能力，不提供正式商业服务。', '账户与内容', '当前认证、验证码、云同步和反馈提交均为明确标注的演示能力。请勿将其视为已经生效的线上账户服务。', '学习数据', '学习记录与标注目前保存在本机；用户应自行留意卸载或清除数据带来的影响。'];
  const privacy = ['数据处理说明', '当前版本不会把注册、反馈或学习同步表单发送到云端服务。', '设备权限', '录音练习仅在用户授权后访问麦克风；录音保留在本机应用空间。系统设置入口由操作系统提供。', '未来变更', '接入真实认证与云同步前，将重新确认数据范围、保存期限、删除机制与隐私文本。'];
  const content = page === 'agreement' ? agreement : privacy;
  return <Screen scroll contentStyle={styles.screen}><TopBar title={titles[page]} /><View style={styles.legal}><AppText variant="pageTitle">{titles[page]}</AppText><AppText variant="caption">更新日期：2026 年 7 月 11 日 · 阶段性文本</AppText>{content.map((item, index) => index % 2 === 0 ? <AppText key={item} variant="sectionTitle">{item}</AppText> : <AppText key={item}>{item}</AppText>)}</View></Screen>;
}

const styles = StyleSheet.create({ screen: { paddingHorizontal: 0 }, hero: { alignItems: 'center', gap: spacing[2], padding: spacing[6] }, icon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 58, justifyContent: 'center', width: 58 }, center: { textAlign: 'center' }, block: { gap: spacing[4], padding: spacing[5] }, faqs: { gap: spacing[3] }, faq: { gap: spacing[3] }, row: { alignItems: 'center', flexDirection: 'row' }, flex: { flex: 1 }, contact: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, form: { gap: spacing[4] }, textarea: { minHeight: 100, textAlignVertical: 'top' }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[4] }, logo: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xxl, height: 82, justifyContent: 'center', width: 82 }, menu: { marginHorizontal: spacing[5], padding: 0 }, menuRow: { alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing[4] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, version: { marginTop: spacing[8], textAlign: 'center' }, legal: { gap: spacing[4], padding: spacing[5] } });
