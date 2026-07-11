import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Bell, Bookmark, Check, CheckCircle2, ChevronRight, Cloud, History, Info, Languages, LogOut, Mail, MapPin, Pencil, Phone, RefreshCcw, Shield, Smartphone, Trash2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type AccountSlug = 'profile' | 'edit-profile' | 'settings' | 'sync' | 'security' | 'change-phone' | 'change-email' | 'change-password' | 'delete-account';
const pages: AccountSlug[] = ['profile', 'edit-profile', 'settings', 'sync', 'security', 'change-phone', 'change-email', 'change-password', 'delete-account'];

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  const page: AccountSlug = pages.includes(slug) ? slug : 'profile';
  if (page === 'profile') return <ProfilePage />;
  if (page === 'edit-profile') return <EditProfilePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'sync') return <SyncPage />;
  if (page === 'security') return <SecurityPage />;
  if (page === 'delete-account') return <DeleteAccountPage />;
  return <CredentialPage page={page} />;
}

function Page({ title, children, scroll = true }: { title: string; children: React.ReactNode; scroll?: boolean }) {
  return <Screen scroll={scroll} contentStyle={styles.screen}><TopBar title={title} />{children}</Screen>;
}

function ProfilePage() {
  const router = useRouter();
  return <Page title="个人资料"><View style={styles.profileHero}><Avatar /><AppText variant="pageTitle">飞行学员</AppText><AppText variant="caption">飞猪 ID：ICAO_88231388</AppText><Tag>目标 · ICAO 4 级</Tag></View><View style={styles.content}><Section title="基本信息"><Row icon={UserRound} label="昵称" value="飞行学员" first /><Row icon={Info} label="性别" value="男" /><Row icon={MapPin} label="所在地区" value="四川 · 广汉" /></Section><Section title="联系方式"><Row icon={Phone} label="手机号" value="157****1388" first /><Row icon={Mail} label="邮箱" value="pilot@example.com" /></Section><AppText variant="caption">个人资料用于个性化你的备考体验，当前资料为演示数据。</AppText><Button leading={<Pencil color={colors.primaryForeground} size={16} />} onPress={() => router.push('/account/edit-profile')}>编辑资料</Button></View></Page>;
}

function EditProfilePage() {
  const router = useRouter();
  const [name, setName] = useState('飞行学员');
  const [gender, setGender] = useState('男');
  const [level, setLevel] = useState('ICAO 4 级');
  const [signature, setSignature] = useState('每天进步一点点，冲刺 ICAO 4 级！');
  const [saved, setSaved] = useState(false);
  return <Page title="编辑资料"><View style={styles.avatarEdit}><Avatar small /><AppText variant="caption">点击更换头像</AppText></View><View style={styles.form}><TextField label="昵称" onChangeText={setName} value={name} /><Choice label="性别" options={['男', '女', '保密']} value={gender} onChange={setGender} /><TextField label="所在地区" value="四川 · 广汉" editable={false} /><Choice label="目标等级" options={['ICAO 4 级', 'ICAO 5 级', 'ICAO 6 级']} value={level} onChange={setLevel} compact /><TextField label="个性签名" multiline onChangeText={setSignature} style={styles.textarea} value={signature} /><Button onPress={() => setSaved(true)} size="lg">保存修改</Button><AppText style={styles.center} variant="micro">资料仅在本机演示，不会上传云端</AppText></View><BottomSheet onClose={() => setSaved(false)} visible={saved}><SheetResult title="资料已保存" body="本次仅更新演示状态，没有修改真实账户。" onPress={() => { setSaved(false); router.back(); }} /></BottomSheet></Page>;
}

function SettingsPage() {
  const router = useRouter();
  const [notify, setNotify] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return <Page title="设置"><View style={styles.content}><Section title="账号"><Row icon={Shield} label="账号安全" hint="手机号、邮箱、密码" first onPress={() => router.push('/account/security')} /><Row icon={Bell} label="消息通知" value={notify ? '已开启' : '未开启'} trailing={<Switch value={notify} onValueChange={setNotify} />} /></Section><Section title="通用"><Row icon={Cloud} label="学习数据同步" value="仅本机" first onPress={() => router.push('/account/sync')} /><Row icon={Languages} label="语言" value="简体中文" /><Row icon={RefreshCcw} label="深色模式" value="跟随系统" /><Row icon={Trash2} label="清理缓存" value="12.6 MB" /></Section><Section title="支持"><Row icon={Info} label="帮助中心" first onPress={() => router.push('/info/help')} /><Row icon={Info} label="关于飞猪 ICAO" value="v1.0.0" onPress={() => router.push('/info/about')} /></Section><Button leading={<LogOut color={colors.destructive} size={16} />} onPress={() => setConfirm(true)} variant="outline">退出登录</Button><AppText style={styles.center} variant="micro">© 2026 飞猪 ICAO</AppText></View><LogoutDialog visible={confirm} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); router.replace('/auth/splash'); }} /></Page>;
}

type SyncPhase = 'idle' | 'syncing' | 'success';
function SyncPage() {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  function sync() { setPhase('syncing'); setTimeout(() => setPhase('success'), 900); }
  const copy = phase === 'idle' ? ['云同步待接入', '当前数据只保存在本机，可预览完整同步交互。'] : phase === 'syncing' ? ['正在同步', '正在演示上传学习记录与标注数据。'] : ['同步成功', '状态演示完成，本机数据没有被修改。'];
  return <Page title="学习数据同步"><View style={styles.content}><Card elevated style={styles.syncCard}><View style={styles.syncIcon}>{phase === 'syncing' ? <ActivityIndicator color={colors.primary} /> : phase === 'success' ? <Check color={colors.primary} size={22} /> : <Cloud color={colors.primary} size={22} />}</View><View style={styles.flex}><AppText variant="cardTitle">{copy[0]}</AppText><AppText variant="caption">{copy[1]}</AppText></View></Card><Section title="本机数据"><Row icon={History} label="学习记录" value="0 条" first /><Row icon={Bookmark} label="标注与笔记" value="1 项" /></Section><Button disabled={phase === 'syncing'} leading={phase === 'syncing' ? <ActivityIndicator color={colors.primaryForeground} /> : <RefreshCcw color={colors.primaryForeground} size={16} />} onPress={sync} size="lg">{phase === 'syncing' ? '同步中' : '演示立即同步'}</Button><AppText style={styles.center} variant="micro">设计稿演示：未连接真实账号与云端服务。</AppText></View></Page>;
}

function SecurityPage() {
  const router = useRouter();
  return <Page title="账号安全"><View style={styles.content}><Section title="登录与绑定"><Row icon={Smartphone} label="手机号" value="157****1388" first onPress={() => router.push('/account/change-phone')} /><Row icon={Mail} label="邮箱" value="pilot@example.com" onPress={() => router.push('/account/change-email')} /><Row icon={Shield} label="登录密码" value="已设置" onPress={() => router.push('/account/change-password')} /></Section><Section title="安全"><Row icon={Shield} label="生物识别登录" value="未开启" first /></Section><Section title="危险操作"><Row danger icon={Trash2} label="注销账号" hint="永久删除账号与数据" first onPress={() => router.push('/account/delete-account')} /></Section></View></Page>;
}

function CredentialPage({ page }: { page: 'change-phone' | 'change-email' | 'change-password' }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [second, setSecond] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const isPhone = page === 'change-phone'; const isEmail = page === 'change-email';
  const title = isPhone ? '修改手机号' : isEmail ? '修改邮箱' : '修改密码';
  const current = isPhone ? '157****1388' : 'pilot@example.com';
  const ready = page === 'change-password' ? value.length >= 6 && second.length >= 6 && confirmation === second : value.trim().length > 4 && code.length >= 4;
  return <Page title={title}><View style={styles.content}>{page !== 'change-password' ? <Card style={styles.current}><View style={styles.softIcon}>{isPhone ? <Shield color={colors.primary} size={19} /> : <Mail color={colors.primary} size={19} />}</View><View><AppText variant="caption">当前绑定{isPhone ? '手机号' : '邮箱'}</AppText><AppText variant="button">{current}</AppText></View></Card> : null}<View style={styles.formNoPad}>{page === 'change-password' ? <><TextField label="当前密码" onChangeText={setValue} placeholder="请输入当前密码" secureTextEntry value={value} /><TextField label="新密码" onChangeText={setSecond} placeholder="8-20 位，含字母和数字" secureTextEntry value={second} /><TextField label="确认新密码" onChangeText={setConfirmation} placeholder="请再次输入新密码" secureTextEntry value={confirmation} /></> : <><TextField keyboardType={isPhone ? 'phone-pad' : 'email-address'} label={isPhone ? '新手机号' : '新邮箱'} onChangeText={setValue} placeholder={isPhone ? '请输入新手机号' : '请输入新邮箱地址'} value={value} /><TextField keyboardType="number-pad" label="验证码" maxLength={6} onChangeText={setCode} placeholder="6 位验证码" value={code} /></>}<Button disabled={!ready} onPress={router.back} size="lg">确认修改</Button><AppText variant="caption">当前为设计稿演示，不发送验证码，也不变更真实账号。</AppText></View></View></Page>;
}

function DeleteAccountPage() {
  const router = useRouter(); const [agreed, setAgreed] = useState(false);
  const risks = ['学习记录、标注、笔记与题库相关数据', '已购买的体系课程与权益将无法恢复', '账号昵称、手机号等数据永久无法找回', '注销后 30 天内不可使用同一手机号重新注册'];
  return <Page title="注销账号"><View style={styles.delete}><View style={styles.dangerHero}><View style={styles.dangerIcon}><AlertTriangle color={colors.destructive} size={30} /></View><AppText variant="sectionTitle">此操作不可撤销</AppText><AppText style={styles.center}>注销账号是永久性操作，请在确认前仔细阅读以下影响。</AppText></View><Card style={styles.risks}>{risks.map((risk) => <View key={risk} style={styles.risk}><View style={styles.riskDot}><AppText color={colors.destructive} variant="micro">×</AppText></View><AppText style={styles.flex}>{risk}</AppText></View>)}</Card><Pressable onPress={() => setAgreed(!agreed)} style={styles.consent}><View style={[styles.checkbox, agreed && styles.checkboxOn]}>{agreed ? <Check color={colors.primaryForeground} size={12} /> : null}</View><AppText variant="caption">我已知晓上述风险，仍要注销账号</AppText></Pressable><Button disabled={!agreed} onPress={router.back} size="lg" variant="destructive">确认注销账号</Button><Button onPress={router.back} size="lg" variant="outline">放弃，返回</Button><AppText style={styles.center} variant="micro">演示页面不会删除任何真实数据</AppText></View></Page>;
}

function Avatar({ small = false }: { small?: boolean }) { return <View style={[styles.avatar, small && styles.avatarSmall]}><UserRound color={colors.primary} size={small ? 25 : 32} /><View style={styles.editBadge}><Pencil color={colors.primaryForeground} size={9} /></View></View>; }
function Choice({ label, options, value, onChange, compact = false }: { label: string; options: string[]; value: string; onChange: (value: string) => void; compact?: boolean }) { return <View style={styles.choice}><AppText variant="button">{label}</AppText><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceButton, value === option && styles.choiceSelected]}><AppText color={value === option ? colors.primary : colors.mutedForeground} variant={compact ? 'micro' : 'caption'}>{option}</AppText></Pressable>)}</View></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText variant="caption">{title}</AppText><Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, hint, value, onPress, first = false, danger = false, trailing }: { icon: typeof UserRound; label: string; hint?: string; value?: string; onPress?: () => void; first?: boolean; danger?: boolean; trailing?: React.ReactNode }) { const content = <View style={[styles.row, !first && styles.rowBorder]}><View style={[styles.rowIcon, danger && styles.rowIconDanger]}><Icon color={danger ? colors.destructive : colors.primary} size={16} /></View><View style={styles.flex}><AppText color={danger ? colors.destructive : colors.foreground} variant="button">{label}</AppText>{hint ? <AppText variant="micro">{hint}</AppText> : null}</View>{value ? <AppText variant="caption">{value}</AppText> : null}{trailing}{onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}</View>; return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content; }
function SheetResult({ title, body, onPress }: { title: string; body: string; onPress: () => void }) { return <View style={styles.sheet}><CheckCircle2 color={colors.primary} size={38} /><AppText variant="sectionTitle">{title}</AppText><AppText style={styles.center}>{body}</AppText><Button onPress={onPress}>我知道了</Button></View>; }
function LogoutDialog({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) { return <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}><Pressable onPress={onCancel} style={styles.overlay}><Pressable onPress={() => undefined} style={styles.logout}><View style={styles.handle} /><View style={styles.dangerIcon}><LogOut color={colors.destructive} size={26} /></View><AppText variant="sectionTitle">退出登录</AppText><AppText style={styles.center}>退出后将返回启动页。当前为设计预览，不会执行真实账号操作。</AppText><Button onPress={onConfirm} size="lg" variant="destructive">确认退出</Button><Button onPress={onCancel} size="lg" variant="outline">再想想</Button></Pressable></Pressable></Modal>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[5] }, profileHero: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[5] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 74, justifyContent: 'center', position: 'relative', width: 74 }, avatarSmall: { height: 58, width: 58 }, editBadge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, bottom: 0, height: 20, justifyContent: 'center', position: 'absolute', right: 0, width: 20 }, avatarEdit: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[5] }, form: { gap: spacing[4], padding: spacing[5] }, formNoPad: { gap: spacing[4] }, textarea: { minHeight: 72, textAlignVertical: 'top' }, center: { textAlign: 'center' }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, rowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowIconDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, flex: { flex: 1 }, choice: { gap: spacing[2] }, choiceRow: { flexDirection: 'row', gap: spacing[2] }, choiceButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing[1] }, choiceSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, syncCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] }, syncIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, current: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, softIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 }, delete: { gap: spacing[3], padding: spacing[5] }, dangerHero: { alignItems: 'center', gap: spacing[2] }, dangerIcon: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, risks: { backgroundColor: 'rgba(219,43,51,0.04)', borderColor: 'rgba(219,43,51,0.22)', gap: spacing[3] }, risk: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] }, riskDot: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 18, justifyContent: 'center', width: 18 }, consent: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[3] }, overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }, logout: { alignItems: 'stretch', backgroundColor: colors.card, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] }, handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radii.full, height: 4, marginBottom: spacing[1], width: 40 },
});
