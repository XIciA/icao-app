import * as ImagePicker from 'expo-image-picker';
import { DEFAULT_TENCENT_ASR_MODEL, type TencentAsrModel } from '@icao/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Bookmark, Check, CheckCircle2, ChevronRight, Cloud, History, Info, LogOut, MapPin, Pencil, RefreshCcw, Shield, Trash2, UserRound } from '@/components/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppModal } from '@/components/platform/AppModal';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasAiConsent, withdrawAiConsent } from '@/features/ai/ai-client';
import { ASR_MODEL_OPTIONS, getAsrModel, setAsrModel } from '@/features/ai/asr-model-preference';
import { readAnnotationStore } from '@/features/question-bank/annotations/annotation-store';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { bindLearningSync, getLearningSyncStatus, inspectLearningSyncBinding, runLearningSync, type LearningSyncStatus } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';
import { SESSION_STORAGE_LABEL } from '@/platform/session-storage-capabilities';
import { updateProfile, useProfile } from './profile-store';

type AccountSlug = 'profile' | 'edit-profile' | 'settings' | 'sync' | 'security' | 'delete-account';
const pages: AccountSlug[] = ['profile', 'edit-profile', 'settings', 'sync', 'security', 'delete-account'];

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  const page: AccountSlug = pages.includes(slug) ? slug : 'profile';
  if (page === 'profile') return <ProfilePage />;
  if (page === 'edit-profile') return <EditProfilePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'sync') return <SyncPage />;
  if (page === 'security') return <SecurityPage />;
  if (page === 'delete-account') return <DeleteAccountPage />;
  return <ProfilePage />;
}

function Page({ title, children, scroll = true }: { title: string; children: React.ReactNode; scroll?: boolean }) {
  return <Screen contentStyle={styles.screen} scroll={scroll}><TopBar title={title} />{children}</Screen>;
}

function ProfilePage() {
  const router = useRouter();
  const auth = useAuth();
  const profile = useProfile();
  const displayName = auth.session?.user.displayName ?? '飞行学员';
  return (
    <Page title="个人资料">
      <View style={styles.profileHero}>
        <Avatar uri={profile.avatarUri} />
        <AppText variant="pageTitle">{displayName}</AppText>
        <AppText variant="caption">账号 ID：{auth.session?.user.id.slice(0, 8)}</AppText>
        <Tag>听你五个账号</Tag>
      </View>
      <View style={styles.content}>
        <Section title="基本信息">
          <Row first icon={UserRound} label="账户名称" value={displayName} />
          <Row icon={Info} label="性别" value={profile.gender} />
          <Row icon={MapPin} label="所在地区" value={profile.region} />
          <Row icon={Bookmark} label="个性签名" value={profile.signature} />
        </Section>
        <Section title="登录账号">
          <Row first icon={Shield} label="邀请码登录" value="已启用" />
        </Section>
        <AppText variant="caption">账户名称由专属邀请码确定，用于账号归属与跨设备同步。</AppText>
        <Button leading={<Pencil color={colors.primaryForeground} size={16} />} onPress={() => router.push('/account/edit-profile')}>编辑资料</Button>
      </View>
    </Page>
  );
}

function EditProfilePage() {
  const router = useRouter();
  const auth = useAuth();
  const profile = useProfile();
  const [avatarUri, setAvatarUri] = useState<string | null>(profile.avatarUri);
  const [gender, setGender] = useState(profile.gender);
  const [targetLevel, setTargetLevel] = useState(profile.targetLevel);
  const [signature, setSignature] = useState(profile.signature);
  const [region, setRegion] = useState(profile.region);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAvatarUri(profile.avatarUri);
    setGender(profile.gender);
    setTargetLevel(profile.targetLevel);
    setSignature(profile.signature);
    setRegion(profile.region);
  }, [profile]);

  async function chooseAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('无法访问相册', '请在系统设置中允许访问照片后重试。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    setSaving(true);
    await updateProfile({
      avatarUri,
      gender,
      targetLevel,
      signature,
      region,
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <Page title="编辑资料">
      <View style={styles.avatarEdit}>
        <Pressable accessibilityLabel="更换头像" onPress={() => void chooseAvatar()}>
          <Avatar small uri={avatarUri} />
        </Pressable>
        <Pressable accessibilityLabel="点击更换头像" onPress={() => void chooseAvatar()}>
          <AppText color={colors.primary} variant="caption">点击更换头像</AppText>
        </Pressable>
      </View>
      <View style={styles.form}>
        <TextField editable={false} label="账户名称" value={auth.session?.user.displayName ?? '飞行学员'} />
        <AppText variant="micro">账户名称由邀请码确定，如需调整请联系管理员。</AppText>
        <Choice label="性别" onChange={setGender} options={['男', '女', '保密']} value={gender} />
        <TextField label="所在地区" onChangeText={setRegion} value={region} />
        <Choice compact label="目标等级" onChange={setTargetLevel} options={['ICAO 4 级', 'ICAO 5 级', 'ICAO 6 级']} value={targetLevel} />
        <TextField label="个性签名" multiline onChangeText={setSignature} style={styles.textarea} value={signature} />
        <Button disabled={saving} onPress={() => void handleSave()} size="lg">
          {saving ? '正在保存…' : '保存修改'}
        </Button>
      </View>
      <BottomSheet onClose={() => setSaved(false)} visible={saved}>
        <SheetResult body="个人资料已更新并保存在本机。" onPress={() => { setSaved(false); router.back(); }} title="资料已保存" />
      </BottomSheet>
    </Page>
  );
}

function SettingsPage() {
  const router = useRouter();
  const auth = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  const [asrModel, setSelectedAsrModel] = useState<TencentAsrModel>(DEFAULT_TENCENT_ASR_MODEL);
  const [asrPickerVisible, setAsrPickerVisible] = useState(false);
  useEffect(() => {
    void Promise.all([hasAiConsent(), getAsrModel()]).then(([consent, model]) => {
      setAiConsent(consent);
      setSelectedAsrModel(model);
    });
  }, []);

  async function selectAsrModel(model: TencentAsrModel) {
    await setAsrModel(model);
    setSelectedAsrModel(model);
    setAsrPickerVisible(false);
  }

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

  return (
    <Page title="设置">
      <View style={styles.content}>
        <Section title="账号">
          <Row first hint="邀请码与会话" icon={Shield} label="账号安全" onPress={() => router.push('/account/security')} />
        </Section>
        <Section title="AI 与隐私">
          <Row first hint="切换后从下一次转写开始生效" icon={Cloud} label="腾讯 ASR 模型" onPress={() => setAsrPickerVisible(true)} value={asrModel} />
          <Row hint={aiConsent ? '撤回后仍可使用录音、回放和非 AI 学习功能' : '首次使用 AI 功能时由你明确确认'} icon={Shield} label={aiConsent ? '撤回 AI 数据处理同意' : 'AI 数据处理同意'} onPress={aiConsent ? () => { void revokeAi(); } : undefined} value={aiConsent ? '已同意' : '未同意'} />
        </Section>
        <Section title="通用">
          <Row first icon={Cloud} label="学习数据同步" onPress={() => router.push('/account/sync')} value="自动同步" />
        </Section>
        <Section title="支持">
          <Row first icon={Info} label="帮助中心" onPress={() => router.push('/info/help')} />
          <Row icon={Info} label="关于听你五个" onPress={() => router.push('/info/about')} value={APP_DISPLAY_VERSION} />
        </Section>
        {signOutError ? <AppText color={colors.destructive} variant="caption">{signOutError}</AppText> : null}
        <Button disabled={!auth.session} leading={<LogOut color={colors.destructive} size={16} />} onPress={() => setConfirm(true)} variant="outline">退出登录</Button>
        <AppText style={styles.center} variant="micro">© 2026 听你五个</AppText>
      </View>
      <AsrModelSheet current={asrModel} onClose={() => setAsrPickerVisible(false)} onSelect={(model) => { void selectAsrModel(model); }} visible={asrPickerVisible} />
      <LogoutDialog onAll={() => { void signOut(true); }} onCancel={() => setConfirm(false)} onCurrent={() => { void signOut(false); }} visible={confirm} />
    </Page>
  );
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
          : ['需要确认数据归属', '确认后先保留本机快照，再将数据归入当前账号。'];
  return <Page title="学习数据同步"><View style={styles.content}><Card elevated style={styles.syncCard}><View style={styles.syncIcon}>{phase === 'syncing' ? <ActivityIndicator color={colors.primary} /> : phase === 'success' ? <Check color={colors.primary} size={22} /> : <Cloud color={colors.primary} size={22} />}</View><View style={styles.flex}><AppText variant="cardTitle">{copy[0]}</AppText><AppText variant="caption">{copy[1]}</AppText></View></Card><Section title="本机数据"><Row first icon={History} label="学习记录" value={`${localCounts.records} 条`} /><Row icon={Bookmark} label="标注与笔记" value={`${localCounts.annotations} 项`} /><Row icon={Cloud} label="待同步变更" value={`${status.pendingCount} 项`} /></Section>{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={phase === 'syncing'} leading={phase === 'syncing' ? <ActivityIndicator color={colors.primaryForeground} /> : <RefreshCcw color={colors.primaryForeground} size={16} />} onPress={() => void sync()} size="lg">{phase === 'syncing' ? '同步中' : !auth.session ? '去登录' : bound ? '立即同步' : '确认归属并同步'}</Button><AppText style={styles.center} variant="micro">失败不会删除本机数据；不支持跨账号自动合并。</AppText></View></Page>;
}

function SecurityPage() {
  const auth = useAuth();
  const router = useRouter();
  return <Page title="账号安全"><View style={styles.content}><Section title="登录与绑定"><Row first icon={Shield} label="登录方式" value="专属邀请码" /><Row icon={UserRound} label="账户名称" value={auth.session?.user.displayName ?? '未登录'} /></Section><Section title="安全"><Row first icon={Shield} label="会话存储" value={SESSION_STORAGE_LABEL} /></Section><Section title="危险操作"><Row danger first icon={Trash2} label="注销账号" hint="永久删除账号与活跃数据" onPress={() => router.push('/account/delete-account')} /></Section></View></Page>;
}

function DeleteAccountPage() {
  const router = useRouter(); const auth = useAuth(); const [agreed, setAgreed] = useState(false); const [inviteCode, setInviteCode] = useState(''); const [confirmation, setConfirmation] = useState(''); const [error, setError] = useState(''); const [deleting, setDeleting] = useState(false);
  const risks = ['学习记录、标注、笔记、同步数据与 AI 账号数据将从活跃数据库删除', '本机个人数据、会话与待同步队列将清除', '操作不可撤销；数据库备份最多保留 7 天后自然过期'];
  const ready = agreed && /^[\u3400-\u9fff]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/u.test(inviteCode.trim()) && confirmation === '注销账号';
  async function remove() { if (!ready) return; setDeleting(true); setError(''); try { await auth.deleteAccount(inviteCode); router.replace('/auth/login'); } catch (cause) { setError(cause instanceof Error && cause.message === 'invalid_invite_code' ? '邀请码错误，账号未删除' : '注销失败，账号与本机数据均未删除'); } finally { setDeleting(false); } }
  return <Page title="注销账号"><View style={styles.delete}><View style={styles.dangerHero}><View style={styles.dangerIcon}><AlertTriangle color={colors.destructive} size={30} /></View><AppText variant="sectionTitle">此操作不可撤销</AppText><AppText style={styles.center}>注销账号会永久删除当前账号的活跃数据。</AppText></View><Card style={styles.risks}>{risks.map((risk) => <View key={risk} style={styles.risk}><View style={styles.riskDot}><AppText color={colors.destructive} variant="micro">×</AppText></View><AppText style={styles.flex}>{risk}</AppText></View>)}</Card><TextField autoCapitalize="characters" label="确认邀请码" onChangeText={setInviteCode} placeholder="请输入完整邀请码" value={inviteCode} /><TextField label="确认文字" onChangeText={setConfirmation} placeholder="请输入：注销账号" value={confirmation} /><Pressable onPress={() => setAgreed(!agreed)} style={styles.consent}><View style={[styles.checkbox, agreed && styles.checkboxOn]}>{agreed ? <Check color={colors.primaryForeground} size={12} /> : null}</View><AppText variant="caption">我已知晓上述风险，仍要注销账号</AppText></Pressable>{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={!ready || deleting} onPress={() => void remove()} size="lg" variant="destructive">{deleting ? '正在注销…' : '永久注销账号'}</Button><Button disabled={deleting} onPress={router.back} size="lg" variant="outline">放弃，返回</Button></View></Page>;
}

function Avatar({ uri, small = false }: { uri?: string | null; small?: boolean }) {
  return (
    <View style={[styles.avatar, small && styles.avatarSmall]}>
      {uri ? (
        <Image accessibilityLabel="用户头像" source={{ uri }} style={[styles.avatarImage, small && styles.avatarSmallImage]} />
      ) : (
        <UserRound color={colors.primary} size={small ? 25 : 32} />
      )}
      <View style={styles.editBadge}>
        <Pencil color={colors.primaryForeground} size={9} />
      </View>
    </View>
  );
}

function Choice({ label, options, value, onChange, compact = false }: { label: string; options: string[]; value: string; onChange: (value: string) => void; compact?: boolean }) { return <View style={styles.choice}><AppText variant="button">{label}</AppText><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceButton, value === option && styles.choiceSelected]}><AppText color={value === option ? colors.primary : colors.mutedForeground} variant={compact ? 'micro' : 'caption'}>{option}</AppText></Pressable>)}</View></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText variant="caption">{title}</AppText><Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, hint, value, onPress, first = false, danger = false, trailing }: { icon: typeof UserRound; label: string; hint?: string; value?: string; onPress?: () => void; first?: boolean; danger?: boolean; trailing?: React.ReactNode }) { const content = <View style={[styles.row, !first && styles.rowBorder]}><View style={[styles.rowIcon, danger && styles.rowIconDanger]}><Icon color={danger ? colors.destructive : colors.primary} size={16} /></View><View style={styles.flex}><AppText color={danger ? colors.destructive : colors.foreground} variant="button">{label}</AppText>{hint ? <AppText variant="micro">{hint}</AppText> : null}</View>{value ? <AppText variant="caption">{value}</AppText> : null}{trailing}{onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}</View>; return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content; }
function SheetResult({ title, body, onPress }: { title: string; body: string; onPress: () => void }) { return <View style={styles.sheet}><CheckCircle2 color={colors.primary} size={38} /><AppText variant="sectionTitle">{title}</AppText><AppText style={styles.center}>{body}</AppText><Button onPress={onPress}>我知道了</Button></View>; }
function AsrModelSheet({ visible, current, onClose, onSelect }: { visible: boolean; current: TencentAsrModel; onClose: () => void; onSelect: (model: TencentAsrModel) => void }) { return <BottomSheet accessibilityLabel="选择腾讯 ASR 模型" onClose={onClose} visible={visible}><View style={styles.modelSheet}><AppText variant="sectionTitle">选择转写模型</AppText><AppText variant="caption">选择只保存在本机，并从下一次转写开始生效。</AppText><View style={styles.modelOptions}>{ASR_MODEL_OPTIONS.map((option) => { const selected = option.model === current; return <Pressable accessibilityLabel={`使用 ${option.model}`} accessibilityState={{ selected }} key={option.model} onPress={() => onSelect(option.model)} style={[styles.modelOption, selected && styles.modelOptionSelected]}><View style={styles.flex}><AppText color={selected ? colors.primary : colors.foreground} variant="button">{option.model}</AppText><AppText variant="micro">{option.title} · {option.description}</AppText></View>{selected ? <Check color={colors.primary} size={18} /> : null}</Pressable>; })}</View><AppText variant="micro">当前未启用热词、词汇替换、自学习模型或航空规则化脚本。</AppText></View></BottomSheet>; }
function LogoutDialog({ visible, onCancel, onCurrent, onAll }: { visible: boolean; onCancel: () => void; onCurrent: () => void; onAll: () => void }) { return <AppModal animationType="slide" onRequestClose={onCancel} transparent visible={visible}><Pressable onPress={onCancel} style={styles.overlay}><Pressable onPress={() => undefined} style={styles.logout}><View style={styles.handle} /><View style={styles.dangerIcon}><LogOut color={colors.destructive} size={26} /></View><AppText variant="sectionTitle">退出登录</AppText><AppText style={styles.center}>退出不会删除学习数据；未同步变更会保留在本机。</AppText><Button onPress={onCurrent} size="lg">仅退出当前设备</Button><Button onPress={onAll} size="lg" variant="destructive">退出全部设备</Button><Button onPress={onCancel} size="lg" variant="outline">取消</Button></Pressable></Pressable></AppModal>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[5] }, profileHero: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[5] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 74, justifyContent: 'center', overflow: 'hidden', position: 'relative', width: 74 }, avatarSmall: { height: 58, width: 58 }, avatarImage: { borderRadius: radii.full, height: 74, width: 74 }, avatarSmallImage: { height: 58, width: 58 }, editBadge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, bottom: 0, height: 20, justifyContent: 'center', position: 'absolute', right: 0, width: 20, zIndex: 2 }, avatarEdit: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[5] }, form: { gap: spacing[4], padding: spacing[5] }, formNoPad: { gap: spacing[4] }, textarea: { minHeight: 72, textAlignVertical: 'top' }, center: { textAlign: 'center' }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, rowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowIconDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, flex: { flex: 1 }, choice: { gap: spacing[2] }, choiceRow: { flexDirection: 'row', gap: spacing[2] }, choiceButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing[1] }, choiceSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, modelSheet: { gap: spacing[4] }, modelOptions: { gap: spacing[2] }, modelOption: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 68, padding: spacing[3] }, modelOptionSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, syncCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] }, syncIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, current: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, softIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 }, delete: { gap: spacing[3], padding: spacing[5] }, dangerHero: { alignItems: 'center', gap: spacing[2] }, dangerIcon: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, risks: { backgroundColor: 'rgba(219,43,51,0.04)', borderColor: 'rgba(219,43,51,0.22)', gap: spacing[3] }, risk: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] }, riskDot: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 18, justifyContent: 'center', width: 18 }, consent: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[3] }, overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }, logout: { alignItems: 'stretch', backgroundColor: colors.card, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] }, handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radii.full, height: 4, marginBottom: spacing[1], width: 40 },
});
