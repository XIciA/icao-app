import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Bell, Bookmark, Check, CheckCircle2, ChevronRight, Cloud, History, Info, Languages, LogOut, Mail, MapPin, Pencil, RefreshCcw, Shield, Smartphone, Trash2, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppModal } from '@/components/platform/AppModal';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasAiConsent, withdrawAiConsent } from '@/features/ai/ai-client';
import { readAnnotationStore } from '@/features/question-bank/annotations/annotation-store';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { bindLearningSync, getLearningSyncStatus, inspectLearningSyncBinding, runLearningSync, type LearningSyncStatus } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';
import { EMAIL_DELIVERY_AVAILABLE } from '@/platform/email-capabilities';
import { SESSION_STORAGE_LABEL } from '@/platform/session-storage-capabilities';

type AccountSlug = 'profile' | 'edit-profile' | 'settings' | 'sync' | 'security' | 'change-email' | 'change-password' | 'delete-account';
const pages: AccountSlug[] = ['profile', 'edit-profile', 'settings', 'sync', 'security', 'change-email', 'change-password', 'delete-account'];

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
  const auth = useAuth();
  return <Page title="个人资料"><View style={styles.profileHero}><Avatar /><AppText variant="pageTitle">飞行学员</AppText><AppText variant="caption">账号 ID：{auth.session?.user.id.slice(0, 8)}</AppText><Tag>目标 · ICAO 4 级</Tag></View><View style={styles.content}><Section title="基本信息"><Row icon={UserRound} label="昵称" value="飞行学员" first /><Row icon={Info} label="性别" value="男" /><Row icon={MapPin} label="所在地区" value="四川 · 广汉" /></Section><Section title="登录账号"><Row icon={Mail} label="邮箱" value={auth.session?.user.email ?? ''} first onPress={() => router.push('/account/change-email')} /></Section><AppText variant="caption">登录邮箱用于账号归属、同步和安全验证。</AppText><Button leading={<Pencil color={colors.primaryForeground} size={16} />} onPress={() => router.push('/account/edit-profile')}>编辑资料</Button></View></Page>;
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
  const auth = useAuth();
  const [notify, setNotify] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  useEffect(() => { void hasAiConsent().then(setAiConsent); }, []);
  async function revokeAi() {
    try {
      await withdrawAiConsent();
      setAiConsent(false);
    } catch {
      setSignOutError('AI 数据处理同意撤回失败，请登录并稍后重试');
    }
  }
  async function signOut(all = false) {
    try {
      if (all) await auth.signOutAll();
      else await auth.signOut();
      setConfirm(false);
      router.replace('/auth/login');
    } catch {
      setSignOutError('退出失败，请稍后重试');
    }
  }
  return <Page title="设置"><View style={styles.content}><Section title="账号"><Row icon={Shield} label="账号安全" hint="邮箱、密码" first onPress={() => router.push('/account/security')} /><Row icon={Bell} label="消息通知" value={notify ? '已开启' : '未开启'} trailing={<Switch value={notify} onValueChange={setNotify} />} /></Section><Section title="AI 与隐私"><Row icon={Shield} label={aiConsent ? '撤回 AI 数据处理同意' : 'AI 数据处理同意'} hint={aiConsent ? '撤回后仍可使用录音、回放和非 AI 学习功能' : '首次使用 AI 功能时由你明确确认'} value={aiConsent ? '已同意' : '未同意'} first onPress={aiConsent ? () => { void revokeAi(); } : undefined} /></Section><Section title="通用"><Row icon={Cloud} label="学习数据同步" value="自动同步" first onPress={() => router.push('/account/sync')} /><Row icon={Languages} label="语言" value="简体中文" /><Row icon={RefreshCcw} label="深色模式" value="跟随系统" /><Row icon={Trash2} label="清理缓存" value="12.6 MB" /></Section><Section title="支持"><Row icon={Info} label="帮助中心" first onPress={() => router.push('/info/help')} /><Row icon={Info} label="关于飞猪 ICAO" value={APP_DISPLAY_VERSION} onPress={() => router.push('/info/about')} /></Section>{signOutError ? <AppText color={colors.destructive} variant="caption">{signOutError}</AppText> : null}<Button disabled={!auth.session} leading={<LogOut color={colors.destructive} size={16} />} onPress={() => setConfirm(true)} variant="outline">退出登录</Button><AppText style={styles.center} variant="micro">© 2026 飞猪 ICAO</AppText></View><LogoutDialog visible={confirm} onCancel={() => setConfirm(false)} onCurrent={() => { void signOut(false); }} onAll={() => { void signOut(true); }} /></Page>;
}

type SyncPhase = 'idle' | 'syncing' | 'success';
function SyncPage() {
  const auth = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [status, setStatus] = useState<LearningSyncStatus>({ cursor: 0, pendingCount: 0 });
  const [needsBinding, setNeedsBinding] = useState(false);
  const [localCounts, setLocalCounts] = useState({ annotations: 0, records: 0 });
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [nextStatus, records, annotations] = await Promise.all([
      getLearningSyncStatus(),
      sqliteLearningStore.getRecords(),
      readAnnotationStore(),
    ]);
    setStatus(nextStatus);
    setLocalCounts({ records: records.length, annotations: Object.keys(annotations.entries).length });
    if (auth.session) setNeedsBinding((await inspectLearningSyncBinding(auth.session.user.id)).needsConfirmation);
  }, [auth.session]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function sync() {
    if (!auth.session) { router.push('/auth/login'); return; }
    setPhase('syncing');
    setError('');
    try {
      if (needsBinding || status.boundUserId !== auth.session.user.id) await bindLearningSync(auth.session.user.id, 'upload-local');
      else await runLearningSync(auth.session.user.id);
      await refresh();
      setNeedsBinding(false);
      setPhase('success');
    } catch {
      setError('同步失败，本机数据和待发送队列均已保留，请稍后重试。');
      setPhase('idle');
      await refresh();
    }
  }

  const bound = Boolean(auth.session && status.boundUserId === auth.session.user.id);
  const copy = !auth.session
    ? ['登录后启用云同步', '未登录时继续使用本机学习数据。']
    : phase === 'syncing'
      ? ['正在同步', '正在安全推送并拉取当前账号的学习数据。']
      : phase === 'success'
        ? ['同步成功', '当前账号的云端与本机核心学习数据已更新。']
        : bound
          ? ['云同步已绑定', status.lastSyncedAt ? `上次同步：${new Date(status.lastSyncedAt).toLocaleString()}` : '尚未完成首次同步。']
          : ['需要确认数据归属', '确认后先保留本机快照，再将数据归入当前邮箱账号。'];
  return <Page title="学习数据同步"><View style={styles.content}><Card elevated style={styles.syncCard}><View style={styles.syncIcon}>{phase === 'syncing' ? <ActivityIndicator color={colors.primary} /> : phase === 'success' ? <Check color={colors.primary} size={22} /> : <Cloud color={colors.primary} size={22} />}</View><View style={styles.flex}><AppText variant="cardTitle">{copy[0]}</AppText><AppText variant="caption">{copy[1]}</AppText></View></Card><Section title="本机数据"><Row icon={History} label="学习记录" value={`${localCounts.records} 条`} first /><Row icon={Bookmark} label="标注与笔记" value={`${localCounts.annotations} 项`} /><Row icon={Cloud} label="待同步变更" value={`${status.pendingCount} 项`} /></Section>{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={phase === 'syncing'} leading={phase === 'syncing' ? <ActivityIndicator color={colors.primaryForeground} /> : <RefreshCcw color={colors.primaryForeground} size={16} />} onPress={() => void sync()} size="lg">{phase === 'syncing' ? '同步中' : !auth.session ? '去登录' : bound ? '立即同步' : '确认归属并同步'}</Button><AppText style={styles.center} variant="micro">失败不会删除本机数据；不支持跨账号自动合并。</AppText></View></Page>;
}

function SecurityPage() {
  const auth = useAuth();
  const router = useRouter();
  return <Page title="账号安全"><View style={styles.content}><Section title="登录与绑定"><Row icon={Mail} label="邮箱" value={auth.session?.user.email ?? '未登录'} first onPress={() => router.push('/account/change-email')} /><Row icon={Shield} label="修改密码" value="已设置" onPress={() => router.push('/account/change-password')} /><Row icon={Smartphone} label="手机号" value="未开放" /></Section><Section title="安全"><Row icon={Shield} label="会话存储" value={SESSION_STORAGE_LABEL} first /></Section><Section title="危险操作"><Row danger icon={Trash2} label="注销账号" hint="永久删除账号与活跃数据" first onPress={() => router.push('/account/delete-account')} /></Section></View></Page>;
}

function CredentialPage({ page }: { page: 'change-email' | 'change-password' }) {
  const router = useRouter();
  const auth = useAuth();
  const [value, setValue] = useState('');
  const [second, setSecond] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const isEmail = page === 'change-email';
  const emailUnavailable = isEmail && !EMAIL_DELIVERY_AVAILABLE;
  const passwordReady = value.length >= 8 && second.length >= 8 && /[A-Za-z]/.test(second) && /\d/.test(second) && second === confirmation;
  const emailReady = /^\S+@\S+\.\S+$/.test(value.trim()) && second.length >= 8;

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      if (isEmail) {
        await auth.requestEmailChange(second, value);
        setSent(true);
      } else {
        await auth.changePassword(value, second);
        router.replace('/auth/login');
      }
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'invalid_email_or_password' || code === 'invalid_current_password' ? '当前密码错误' : '修改失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return <Page title={isEmail ? '修改邮箱' : '修改密码'}><View style={styles.content}>{isEmail ? <Card style={styles.current}><View style={styles.softIcon}><Mail color={colors.primary} size={19} /></View><View><AppText variant="caption">当前绑定邮箱</AppText><AppText variant="button">{auth.session?.user.email}</AppText></View></Card> : null}<View style={styles.formNoPad}>{emailUnavailable ? <><Card><AppText variant="button">公网邮箱功能暂未开放</AppText><AppText variant="caption">当前版本未配置正式邮件服务。如需修改登录邮箱，请联系管理员处理。</AppText></Card><Button onPress={router.back} size="lg" variant="outline">返回</Button></> : <>{isEmail ? <><TextField keyboardType="email-address" label="新邮箱" onChangeText={setValue} placeholder="请输入新邮箱地址" value={value} /><TextField label="当前密码" onChangeText={setSecond} placeholder="请输入当前密码" secureTextEntry value={second} /></> : <><TextField label="当前密码" onChangeText={setValue} placeholder="请输入当前密码" secureTextEntry value={value} /><TextField label="新密码" onChangeText={setSecond} placeholder="8-64 位，含字母和数字" secureTextEntry value={second} /><TextField label="确认新密码" onChangeText={setConfirmation} placeholder="请再次输入新密码" secureTextEntry value={confirmation} /></>}{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}{sent ? <AppText color={colors.primary} variant="caption">确认邮件已生成，请在 Mailpit 中依次确认旧邮箱和新邮箱。</AppText> : null}<Button disabled={submitting || (isEmail ? !emailReady : !passwordReady)} onPress={() => void submit()} size="lg">{submitting ? '正在处理…' : isEmail ? '发送确认邮件' : '确认修改'}</Button><AppText variant="caption">{isEmail ? '内测邮件只进入 Mailpit；两封邮件确认后需用新邮箱重新登录。' : '修改成功后所有设备都会退出，并要求使用新密码登录。'}</AppText></>}</View></View></Page>;
}

function DeleteAccountPage() {
  const router = useRouter(); const auth = useAuth(); const [agreed, setAgreed] = useState(false); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [error, setError] = useState(''); const [deleting, setDeleting] = useState(false);
  const risks = ['学习记录、标注、笔记、同步数据与 AI 账号数据将从活跃数据库删除', '本机个人数据、会话与待同步队列将清除', '操作不可撤销；数据库备份最多保留 7 天后自然过期'];
  const ready = agreed && password.length >= 8 && confirmation === '注销账号';
  async function remove() { if (!ready) return; setDeleting(true); setError(''); try { await auth.deleteAccount(password); router.replace('/auth/login'); } catch (cause) { setError(cause instanceof Error && cause.message === 'invalid_current_password' ? '当前密码错误' : '注销失败，账号与本机数据均未删除'); } finally { setDeleting(false); } }
  return <Page title="注销账号"><View style={styles.delete}><View style={styles.dangerHero}><View style={styles.dangerIcon}><AlertTriangle color={colors.destructive} size={30} /></View><AppText variant="sectionTitle">此操作不可撤销</AppText><AppText style={styles.center}>注销账号会永久删除当前账号的活跃数据。</AppText></View><Card style={styles.risks}>{risks.map((risk) => <View key={risk} style={styles.risk}><View style={styles.riskDot}><AppText color={colors.destructive} variant="micro">×</AppText></View><AppText style={styles.flex}>{risk}</AppText></View>)}</Card><TextField label="当前密码" onChangeText={setPassword} placeholder="请输入当前密码" secureTextEntry value={password} /><TextField label="确认文字" onChangeText={setConfirmation} placeholder="请输入：注销账号" value={confirmation} /><Pressable onPress={() => setAgreed(!agreed)} style={styles.consent}><View style={[styles.checkbox, agreed && styles.checkboxOn]}>{agreed ? <Check color={colors.primaryForeground} size={12} /> : null}</View><AppText variant="caption">我已知晓上述风险，仍要注销账号</AppText></Pressable>{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={!ready || deleting} onPress={() => void remove()} size="lg" variant="destructive">{deleting ? '正在注销…' : '永久注销账号'}</Button><Button disabled={deleting} onPress={router.back} size="lg" variant="outline">放弃，返回</Button></View></Page>;
}

function Avatar({ small = false }: { small?: boolean }) { return <View style={[styles.avatar, small && styles.avatarSmall]}><UserRound color={colors.primary} size={small ? 25 : 32} /><View style={styles.editBadge}><Pencil color={colors.primaryForeground} size={9} /></View></View>; }
function Choice({ label, options, value, onChange, compact = false }: { label: string; options: string[]; value: string; onChange: (value: string) => void; compact?: boolean }) { return <View style={styles.choice}><AppText variant="button">{label}</AppText><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceButton, value === option && styles.choiceSelected]}><AppText color={value === option ? colors.primary : colors.mutedForeground} variant={compact ? 'micro' : 'caption'}>{option}</AppText></Pressable>)}</View></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText variant="caption">{title}</AppText><Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, hint, value, onPress, first = false, danger = false, trailing }: { icon: typeof UserRound; label: string; hint?: string; value?: string; onPress?: () => void; first?: boolean; danger?: boolean; trailing?: React.ReactNode }) { const content = <View style={[styles.row, !first && styles.rowBorder]}><View style={[styles.rowIcon, danger && styles.rowIconDanger]}><Icon color={danger ? colors.destructive : colors.primary} size={16} /></View><View style={styles.flex}><AppText color={danger ? colors.destructive : colors.foreground} variant="button">{label}</AppText>{hint ? <AppText variant="micro">{hint}</AppText> : null}</View>{value ? <AppText variant="caption">{value}</AppText> : null}{trailing}{onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}</View>; return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content; }
function SheetResult({ title, body, onPress }: { title: string; body: string; onPress: () => void }) { return <View style={styles.sheet}><CheckCircle2 color={colors.primary} size={38} /><AppText variant="sectionTitle">{title}</AppText><AppText style={styles.center}>{body}</AppText><Button onPress={onPress}>我知道了</Button></View>; }
function LogoutDialog({ visible, onCancel, onCurrent, onAll }: { visible: boolean; onCancel: () => void; onCurrent: () => void; onAll: () => void }) { return <AppModal animationType="slide" onRequestClose={onCancel} transparent visible={visible}><Pressable onPress={onCancel} style={styles.overlay}><Pressable onPress={() => undefined} style={styles.logout}><View style={styles.handle} /><View style={styles.dangerIcon}><LogOut color={colors.destructive} size={26} /></View><AppText variant="sectionTitle">退出登录</AppText><AppText style={styles.center}>退出不会删除学习数据；未同步变更会保留在本机。</AppText><Button onPress={onCurrent} size="lg">仅退出当前设备</Button><Button onPress={onAll} size="lg" variant="destructive">退出全部设备</Button><Button onPress={onCancel} size="lg" variant="outline">取消</Button></Pressable></Pressable></AppModal>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[5] }, profileHero: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[5] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 74, justifyContent: 'center', position: 'relative', width: 74 }, avatarSmall: { height: 58, width: 58 }, editBadge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, bottom: 0, height: 20, justifyContent: 'center', position: 'absolute', right: 0, width: 20 }, avatarEdit: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[5] }, form: { gap: spacing[4], padding: spacing[5] }, formNoPad: { gap: spacing[4] }, textarea: { minHeight: 72, textAlignVertical: 'top' }, center: { textAlign: 'center' }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, rowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowIconDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, flex: { flex: 1 }, choice: { gap: spacing[2] }, choiceRow: { flexDirection: 'row', gap: spacing[2] }, choiceButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing[1] }, choiceSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, syncCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] }, syncIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, current: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, softIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 }, delete: { gap: spacing[3], padding: spacing[5] }, dangerHero: { alignItems: 'center', gap: spacing[2] }, dangerIcon: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, risks: { backgroundColor: 'rgba(219,43,51,0.04)', borderColor: 'rgba(219,43,51,0.22)', gap: spacing[3] }, risk: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] }, riskDot: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 18, justifyContent: 'center', width: 18 }, consent: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[3] }, overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }, logout: { alignItems: 'stretch', backgroundColor: colors.card, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] }, handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radii.full, height: 4, marginBottom: spacing[1], width: 40 },
});
