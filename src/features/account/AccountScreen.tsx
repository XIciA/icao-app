import * as ImagePicker from 'expo-image-picker';
import { DEFAULT_TENCENT_ASR_MODEL, maskChinaMobile, normalizeChinaMobile, type TencentAsrModel } from '@icao/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Bookmark, Check, CheckCircle2, ChevronRight, Cloud, FileText, History, Info, LogOut, MapPin, Pencil, RefreshCcw, Shield, Trash2, Upload, UserRound } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, Share, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppModal } from '@/components/platform/AppModal';
import { AuthField, CodeField, PasswordField } from '@/components/auth/auth-ui';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { useAuth, type AccountDeletionAuthentication } from '@/features/auth/AuthProvider';
import { isValidPhonePassword, type PhoneBindingChallenge } from '@/features/auth/auth-service';
import { getCachedAiConsentHint, hasAiConsent, withdrawAiConsent } from '@/features/ai/ai-client';
import { MembershipRoutePage } from '@/features/native-commercial-testflight/MembershipRoutePage';
import { ASR_MODEL_OPTIONS, getAsrModel, setAsrModel } from '@/features/ai/asr-model-preference';
import { readAnnotationStore } from '@/features/question-bank/annotations/annotation-store';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { bindLearningSync, getLearningSyncStatus, inspectLearningSyncBinding, runLearningSync, type LearningSyncStatus } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';
import { SESSION_STORAGE_LABEL } from '@/platform/session-storage-capabilities';
import { updateProfile, useProfile } from './profile-store';
import { clearLearningData, deleteAllAiResults, exportAccountAndLearningData } from './privacy-self-service';
import { accountDisplayNameHint } from './account-release-copy';

type AccountSlug = 'profile' | 'edit-profile' | 'membership' | 'settings' | 'privacy' | 'sync' | 'security' | 'bind-phone' | 'password' | 'delete-account';
const pages: AccountSlug[] = ['profile', 'edit-profile', 'membership', 'settings', 'privacy', 'sync', 'security', 'bind-phone', 'password', 'delete-account'];

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  const page: AccountSlug = pages.includes(slug) ? slug : 'profile';
  if (page === 'profile') return <ProfilePage />;
  if (page === 'edit-profile') return <EditProfilePage />;
  if (page === 'membership') return <MembershipRoutePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'privacy') return <PrivacyPage />;
  if (page === 'sync') return <SyncPage />;
  if (page === 'security') return <SecurityPage />;
  if (page === 'bind-phone') return <BindPhonePage />;
  if (page === 'password') return <PasswordPage />;
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
        <AppText variant="caption">账号 ID：{auth.account?.accountId.slice(0, 8) ?? '同步中'}</AppText>
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
          <Row first icon={Shield} label="手机号" value={maskChinaMobile(auth.account?.phone)} />
        </Section>
        <AppText variant="caption">学习与权益跟随永久账号 ID；手机号用于找回和安全验证。</AppText>
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
        <AppText variant="micro">{accountDisplayNameHint}</AppText>
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
  const [allDevicesMode, setAllDevicesMode] = useState(false);
  const [authenticationMethod, setAuthenticationMethod] = useState<AccountDeletionAuthentication['method']>();
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthOtp, setReauthOtp] = useState('');
  const [reauthOtpSent, setReauthOtpSent] = useState(false);
  const [reauthOtpSending, setReauthOtpSending] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [asrModel, setSelectedAsrModel] = useState<TencentAsrModel>(DEFAULT_TENCENT_ASR_MODEL);
  const [asrPickerVisible, setAsrPickerVisible] = useState(false);
  useEffect(() => {
    let active = true;
    void getAsrModel().then((model) => { if (active) setSelectedAsrModel(model); });
    return () => { active = false; };
  }, []);
  const hasApple = auth.session?.user.providers.includes('apple') === true
    && auth.account?.providers.includes('apple') === true;
  const hasWechat = auth.session?.user.providers.includes('wechat') === true
    && auth.account?.providers.includes('wechat') === true;
  const hasPassword = auth.account?.hasPassword === true
    || (auth.session?.user.providers.includes('phone') === true && auth.session.user.hasPassword);
  const hasPhoneOtp = auth.account?.phoneBound === true;
  const authenticationOptions = useMemo<{ label: string; method: AccountDeletionAuthentication['method'] }[]>(() => [
    ...(hasApple ? [{ label: 'Apple', method: 'apple' as const }] : []),
    ...(hasWechat ? [{ label: '微信', method: 'wechat' as const }] : []),
    ...(hasPassword ? [{ label: '登录密码', method: 'password' as const }] : []),
    ...(hasPhoneOtp ? [{ label: '短信验证码', method: 'phone_otp' as const }] : []),
  ], [hasApple, hasPassword, hasPhoneOtp, hasWechat]);
  const selectedAuthentication = authenticationOptions.find(({ method }) => method === authenticationMethod);
  const allDevicesReady = authenticationMethod === 'apple'
    || authenticationMethod === 'wechat'
    || (authenticationMethod === 'password' && reauthPassword.length > 0)
    || (authenticationMethod === 'phone_otp' && reauthOtpSent && /^\d{6}$/u.test(reauthOtp));

  useEffect(() => {
    if (!confirm || !allDevicesMode) return;
    if (authenticationOptions.some(({ method }) => method === authenticationMethod)) return;
    setAuthenticationMethod(authenticationOptions[0]?.method);
  }, [allDevicesMode, authenticationMethod, authenticationOptions, confirm]);

  async function selectAsrModel(model: TencentAsrModel) {
    await setAsrModel(model);
    setSelectedAsrModel(model);
    setAsrPickerVisible(false);
  }

  async function signOut(all = false) {
    try {
      if (all) {
        if (!authenticationMethod || !allDevicesReady) return;
        await auth.signOutAll({
          method: authenticationMethod,
          ...(authenticationMethod === 'password' ? { password: reauthPassword } : {}),
          ...(authenticationMethod === 'phone_otp' ? { phoneOtp: reauthOtp } : {}),
        });
      }
      else await auth.signOut();
      setConfirm(false);
      setAllDevicesMode(false);
      router.replace('/auth/login');
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setSignOutError(code === 'invalid_phone_or_password'
        ? '登录密码不正确，请重新输入'
        : code === 'invalid_phone_otp'
          ? '验证码错误或已过期，请重新获取'
          : '退出失败，请稍后重试');
    }
  }

  async function requestAllDevicesOtp() {
    setReauthOtpSending(true);
    setSignOutError('');
    try {
      await auth.requestAccountDeletionPhoneOtp('session_revoke_all');
      setReauthOtpSent(true);
    } catch {
      setSignOutError('验证码发送失败，请稍后重试');
    } finally {
      setReauthOtpSending(false);
    }
  }

  return (
    <Page title="设置">
      <View style={styles.content}>
        <Section title="账号">
          <Row first hint="手机号与会话" icon={Shield} label="账号安全" onPress={() => router.push('/account/security')} />
        </Section>
        <Section title="AI 与隐私">
          <Row first hint="切换后从下一次转写开始生效" icon={Cloud} label="腾讯 ASR 模型" onPress={() => setAsrPickerVisible(true)} value={asrModel} />
          <Row hint="同意、删除、清除、导出与注销" icon={Shield} label="账号与隐私" onPress={() => router.push('/account/privacy')} />
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
      <LogoutDialog
        allDevicesMode={allDevicesMode}
        allDevicesReady={allDevicesReady}
        authenticationMethod={authenticationMethod}
        authenticationOptions={authenticationOptions}
        error={signOutError}
        onAll={() => setAllDevicesMode(true)}
        onAllConfirm={() => { void signOut(true); }}
        onBack={() => setAllDevicesMode(false)}
        onCancel={() => { setAllDevicesMode(false); setConfirm(false); }}
        onCurrent={() => { void signOut(false); }}
        onMethod={setAuthenticationMethod}
        onOtp={setReauthOtp}
        onPassword={setReauthPassword}
        onRequestOtp={() => { void requestAllDevicesOtp(); }}
        otp={reauthOtp}
        otpSending={reauthOtpSending}
        otpSent={reauthOtpSent}
        password={reauthPassword}
        selectedAuthenticationLabel={selectedAuthentication?.label ?? ''}
        visible={confirm}
      />
    </Page>
  );
}

function PrivacyPage() {
  const auth = useAuth();
  const router = useRouter();
  const [aiConsent, setAiConsent] = useState(false);
  const [aiResultCount, setAiResultCount] = useState(0);
  const [busy, setBusy] = useState<'ai' | 'learning' | 'export' | 'consent'>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [hint, records] = await Promise.all([
      getCachedAiConsentHint().catch(() => false),
      sqliteLearningStore.getRecords(),
    ]);
    setAiConsent(hint);
    setAiResultCount(records.filter((record) => record.recordType === 'ai_result').length);
    void hasAiConsent().then(setAiConsent).catch(() => undefined);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function requireAccount() {
    const accountId = auth.account?.accountId;
    if (accountId) return accountId;
    router.push('/auth/login');
    return undefined;
  }

  async function revokeAi() {
    if (busy) return;
    setBusy('consent');
    setError('');
    setMessage('');
    try {
      await withdrawAiConsent();
      setAiConsent(false);
      setMessage('AI 数据处理同意已撤回，不影响非 AI 学习。');
    } catch {
      setError('AI 数据处理同意撤回失败，请登录并稍后重试。');
    } finally {
      setBusy(undefined);
    }
  }

  async function exportData() {
    const accountId = requireAccount();
    if (!accountId || busy) return;
    setBusy('export');
    setError('');
    setMessage('');
    try {
      const data = await exportAccountAndLearningData(accountId);
      await Share.share({
        title: '听你五个账号与学习数据',
        message: JSON.stringify(data, null, 2),
      });
      setMessage('导出内容已生成，请在系统分享面板中选择保存或发送方式。');
    } catch {
      setError('数据导出失败，待同步数据已保留，请检查网络后重试。');
    } finally {
      setBusy(undefined);
    }
  }

  async function removeAllAiResults() {
    const accountId = requireAccount();
    if (!accountId || busy) return;
    setBusy('ai');
    setError('');
    setMessage('');
    try {
      const result = await deleteAllAiResults(accountId);
      setAiResultCount(0);
      setMessage(`已删除 ${result.deletedCount} 条云端 AI 结果，删除会同步到其他设备。`);
    } catch {
      setError('全部 AI 结果删除未完成，请保持登录并检查网络后重试。');
    } finally {
      setBusy(undefined);
    }
  }

  async function removeLearningData() {
    const accountId = requireAccount();
    if (!accountId || busy) return;
    setBusy('learning');
    setError('');
    setMessage('');
    try {
      const result = await clearLearningData(accountId);
      setAiResultCount(0);
      setMessage(`已清除 ${result.deletedCount} 项学习数据；账号、会员和订单仍保留。`);
    } catch {
      setError('学习数据清除未完成，请保持登录并重试；旧离线数据不会恢复已完成的云端清除。');
    } finally {
      setBusy(undefined);
    }
  }

  function confirmDeleteAllAiResults() {
    Alert.alert(
      '删除全部 AI 结果？',
      '将删除已保存的转写、语法反馈和润色结果，但保留其他学习进度、账号、会员和订单。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除全部AI结果', style: 'destructive', onPress: () => { void removeAllAiResults(); } },
      ],
    );
  }

  function confirmClearLearningData() {
    Alert.alert(
      '清除全部学习数据？',
      '将清除学习进度、记录、收藏、标注、笔记、回答和 AI 结果，并阻止旧离线设备恢复它们。账号、会员和订单不受影响。',
      [
        { text: '取消', style: 'cancel' },
        { text: '清除学习数据', style: 'destructive', onPress: () => { void removeLearningData(); } },
      ],
    );
  }

  return (
    <Page title="账号与隐私">
      <View style={styles.content}>
        <Section title="账号与同意">
          <Row first hint="绑定手机号、登录方式与会话" icon={Shield} label="账号安全" onPress={() => router.push('/account/security')} />
          <Row
            hint={aiConsent ? '撤回后停止新的上传和分析，已有 AI 结果不会自动删除' : '再次使用 AI 功能时可重新确认'}
            icon={Shield}
            label={aiConsent ? '撤回 AI 数据处理同意' : 'AI 数据处理同意'}
            onPress={aiConsent ? () => { void revokeAi(); } : undefined}
            value={aiConsent ? '已同意' : '未同意'}
          />
        </Section>
        <Section title="数据自助">
          <Row first hint="包含账号资料、学习进度、记录和用户文档" icon={Upload} label="导出账号和学习数据" onPress={() => { void exportData(); }} value={busy === 'export' ? '生成中…' : undefined} />
          <Row danger hint="保留其他学习数据" icon={Trash2} label="删除全部 AI 结果" onPress={confirmDeleteAllAiResults} value={`${aiResultCount} 条`} />
          <Row danger hint="保留账号、会员和订单" icon={Trash2} label="清除全部学习数据" onPress={confirmClearLearningData} value={busy === 'learning' ? '清除中…' : undefined} />
        </Section>
        <Section title="政策与联系">
          <Row first icon={FileText} label="隐私政策" onPress={() => router.push('/info/privacy')} />
          <Row icon={FileText} label="用户协议" onPress={() => router.push('/info/agreement')} />
          <Row icon={FileText} label="第三方服务清单" onPress={() => { void Linking.openURL('https://yunqihangke.com/apps/readyoufife/privacy/#third-party-services'); }} />
          <Row hint="privacy@yunqihangke.com" icon={Info} label="隐私权利联系" onPress={() => { void Linking.openURL('mailto:privacy@yunqihangke.com'); }} />
        </Section>
        {message ? <AppText color={colors.primary} variant="caption">{message}</AppText> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button leading={<Trash2 color={colors.destructive} size={16} />} onPress={() => router.push('/account/delete-account')} variant="outline">注销整个账号</Button>
        <AppText style={styles.center} variant="micro">单条 AI 结果可在“学习记录”中直接删除。</AppText>
      </View>
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
    if (auth.account) setNeedsBinding((await inspectLearningSyncBinding(auth.account.accountId)).needsConfirmation);
  }, [auth.account]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function sync() {
    if (!auth.session) { router.push('/auth/login'); return; }
    if (!auth.account) { setError('账号信息正在同步，请稍后重试。'); return; }
    setPhase('syncing');
    setError('');
    try {
      if (needsBinding || status.boundUserId !== auth.account.accountId) await bindLearningSync(auth.account.accountId, 'upload-local');
      else await runLearningSync(auth.account.accountId);
      await refresh();
      setNeedsBinding(false);
      setPhase('success');
    } catch {
      setError('同步失败，本机数据和待发送队列均已保留，请稍后重试。');
      setPhase('idle');
      await refresh();
    }
  }

  const bound = Boolean(auth.account && status.boundUserId === auth.account.accountId);
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
  const hasPassword = auth.session?.user.hasPassword === true;
  const phoneBound = auth.account?.phoneBound === true;
  const providerLabel = auth.account?.providers.map((provider) => (
    provider === 'apple' ? 'Apple' : provider === 'wechat' ? '微信' : '手机号'
  )).join(' + ') || '正在同步';
  const [startingPasswordSetup, setStartingPasswordSetup] = useState(false);
  const [passwordSetupError, setPasswordSetupError] = useState('');

  async function openPasswordSettings() {
    if (!phoneBound) {
      router.push('/account/bind-phone');
      return;
    }
    if (hasPassword) {
      router.push('/account/password');
      return;
    }
    if (startingPasswordSetup) return;
    setStartingPasswordSetup(true);
    setPasswordSetupError('');
    try {
      await auth.signOut();
      router.replace('/auth/login?mode=recovery');
    } catch {
      setPasswordSetupError('暂时无法开始短信验证，请稍后重试');
    } finally {
      setStartingPasswordSetup(false);
    }
  }

  return (
    <Page title="账号安全">
      <View style={styles.content}>
        <Section title="登录与绑定">
          <Row first icon={Shield} label="已绑定方式" value={providerLabel} />
          <Row
            hint={phoneBound ? '用于找回密码和敏感操作验证' : '可选绑定，稍后仍可使用已有第三方方式登录'}
            icon={UserRound}
            label="绑定手机号"
            onPress={phoneBound ? undefined : () => router.push('/account/bind-phone')}
            value={maskChinaMobile(auth.account?.phone)}
          />
          <Row
            hint={!phoneBound ? '先绑定手机号后即可设置' : hasPassword ? '验证当前密码后设置新密码' : '短信验证后设置，可使用手机号和密码登录'}
            icon={Shield}
            label={hasPassword ? '修改登录密码' : '设置登录密码'}
            onPress={() => void openPasswordSettings()}
          />
        </Section>
        {passwordSetupError ? <AppText color={colors.destructive} variant="caption">{passwordSetupError}</AppText> : null}
        <Section title="安全">
          <Row first icon={Shield} label="会话存储" value={SESSION_STORAGE_LABEL} />
        </Section>
        <Section title="危险操作">
          <Row danger first icon={Trash2} label="注销账号" hint="永久删除账号与活跃数据" onPress={() => router.push('/account/delete-account')} />
        </Section>
      </View>
    </Page>
  );
}

function BindPhonePage() {
  const auth = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<PhoneBindingChallenge>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recentAuthRequired, setRecentAuthRequired] = useState(false);
  const [resendDeadline, setResendDeadline] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resendDeadline) return undefined;
    const timer = setInterval(() => {
      const next = Date.now();
      setClockNow(next);
      if (next >= resendDeadline) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [resendDeadline]);

  const remainingSeconds = Math.max(0, Math.ceil((resendDeadline - clockNow) / 1_000));

  function startCountdown() {
    const now = Date.now();
    setClockNow(now);
    setResendDeadline(now + 60_000);
  }

  function updatePhone(value: string) {
    const digits = value.replace(/\D/gu, '');
    setPhone((digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits).slice(0, 11));
  }

  async function requestCode() {
    if (!normalizeChinaMobile(phone)) { setError('请输入正确的中国大陆手机号'); return; }
    setSubmitting(true);
    setError('');
    setRecentAuthRequired(false);
    try {
      setChallenge(await auth.requestPhoneBindingOtp(phone));
      setCode('');
      startCountdown();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setRecentAuthRequired(code === 'recent_social_auth_required');
      setError(code === 'recent_social_auth_required'
        ? '为保护账号安全，请先重新使用当前第三方方式登录，再绑定手机号'
        : '暂时无法发送验证码，请检查手机号或稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (!challenge || remainingSeconds > 0) return;
    setSubmitting(true);
    setError('');
    setRecentAuthRequired(false);
    try {
      setChallenge(await auth.resendPhoneBindingOtp(challenge));
      setCode('');
      startCountdown();
    } catch {
      setError('暂时无法重新发送验证码，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function verify() {
    if (!challenge || !/^\d{6}$/u.test(code)) { setError('请输入6位短信验证码'); return; }
    setSubmitting(true);
    setError('');
    try {
      await auth.verifyPhoneBindingOtp(challenge, code);
      router.replace('/account/security');
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setRecentAuthRequired(code === 'recent_social_auth_required');
      setError(code === 'phone_already_registered'
        ? '该手机号已有账号，请退出后使用手机号登录'
        : code === 'recent_social_auth_required'
          ? '为保护账号安全，请先重新使用当前第三方方式登录，再绑定手机号'
        : code === 'invalid_phone_otp'
          ? '验证码错误或已过期，请重新输入'
          : '绑定未完成，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function reauthenticate() {
    setSubmitting(true);
    setError('');
    try {
      await auth.signOut();
      router.replace('/auth/login');
    } catch {
      setError('暂时无法重新验证，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function signOutToPhoneLogin() {
    setSubmitting(true);
    setError('');
    try {
      await auth.signOut();
      router.replace('/auth/login');
    } catch {
      setError('暂时无法退出，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.account?.phoneBound) {
    return <Page title="绑定手机号"><View style={styles.form}><Card><AppText variant="sectionTitle">手机号已绑定</AppText><AppText variant="caption">{maskChinaMobile(auth.account.phone)}</AppText></Card><Button onPress={() => router.replace('/account/security')}>返回账号安全</Button></View></Page>;
  }

  return (
    <Page title="绑定手机号">
      <View style={styles.form}>
        <View style={styles.passwordIntro}>
          <AppText variant="sectionTitle">绑定中国大陆手机号</AppText>
          <AppText variant="caption">绑定后可使用验证码或密码登录，也可用于账号找回。普通学习不强制绑定。</AppText>
        </View>
        <AuthField autoCapitalize="none" keyboardType="phone-pad" label="手机号" maxLength={14} onChangeText={updatePhone} placeholder="请输入11位手机号" prefix="+86" value={phone} />
        {challenge ? (
          <>
            <CodeField onChangeText={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <AppText variant="caption">验证码已发送至 {maskChinaMobile(challenge.phone)}</AppText>
            <AppText variant="caption">验证成功后将安全绑定到你的听你五个账号，学习记录与权益保持不变。</AppText>
          </>
        ) : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        {recentAuthRequired ? <Button disabled={submitting} onPress={() => void reauthenticate()} variant="outline">重新验证身份</Button> : null}
        {error === '该手机号已有账号，请退出后使用手机号登录' ? <Button disabled={submitting} onPress={() => void signOutToPhoneLogin()} variant="outline">退出并使用手机号登录</Button> : null}
        {challenge ? (
          <>
            <Button disabled={submitting || code.length !== 6} loading={submitting} onPress={() => void verify()} size="lg">验证并完成绑定</Button>
            <Button disabled={submitting || remainingSeconds > 0} onPress={() => void resendCode()} variant="outline">
              {remainingSeconds > 0 ? `${remainingSeconds} 秒后可重新获取` : '重新获取验证码'}
            </Button>
            <Button disabled={submitting} onPress={() => { setChallenge(undefined); setCode(''); setError(''); setRecentAuthRequired(false); }} variant="ghost">更换手机号</Button>
          </>
        ) : (
          <Button disabled={submitting} loading={submitting} onPress={() => void requestCode()} size="lg">获取验证码</Button>
        )}
      </View>
    </Page>
  );
}

function PasswordPage() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const setup = mode === 'setup' && auth.passwordChangePurpose === 'setup';
  const recovery = mode === 'recovery' && auth.passwordChangePurpose === 'recovery';
  const hasPassword = auth.session?.user.hasPassword === true;
  const requiresCurrentPassword = hasPassword && !recovery && !setup;
  const title = setup ? '完成注册' : recovery ? '重置登录密码' : hasPassword ? '修改登录密码' : '设置登录密码';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [startingRecovery, setStartingRecovery] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (((mode === 'setup' || mode === 'recovery') && !setup && !recovery) || (!hasPassword && !setup && !recovery)) {
      router.replace('/account/security');
    }
  }, [hasPassword, mode, recovery, router, setup]);

  const passwordError = getPasswordPolicyError(newPassword);
  const confirmationError = confirmation && confirmation !== newPassword ? '两次输入的密码不一致' : '';
  const ready = Boolean(
    (!requiresCurrentPassword || currentPassword)
      && newPassword
      && !passwordError
      && confirmation === newPassword,
  );

  async function savePassword() {
    if (!ready) return;
    setSaving(true);
    setError('');
    try {
      await auth.updatePassword(newPassword, requiresCurrentPassword ? currentPassword : undefined);
      setSaved(true);
    } catch (cause) {
      setError(getPasswordUpdateError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function startSmsRecovery() {
    setStartingRecovery(true);
    setError('');
    try {
      await auth.signOut();
      router.replace('/auth/login?mode=recovery');
    } catch {
      setError('暂时无法开始短信验证，请稍后重试');
    } finally {
      setStartingRecovery(false);
    }
  }

  function finish() {
    setSaved(false);
    router.replace(setup ? '/(tabs)' : '/account/security');
  }

  return (
    <Page title={title}>
      <View style={styles.passwordForm}>
        <View style={styles.passwordIntro}>
          <AppText variant="sectionTitle">登录密码</AppText>
          <AppText variant="caption">
            {setup
              ? '手机号验证已通过，设置登录密码即可完成注册。'
              : recovery
              ? '手机号验证已通过，请为当前账号设置一个新密码。'
              : requiresCurrentPassword
                ? '验证当前密码后，新密码会用于后续手机号密码登录。'
                : '设置后，验证码登录和密码登录仍使用同一个账号。'}
          </AppText>
        </View>
        {requiresCurrentPassword ? (
          <>
            <PasswordField
              label="当前密码"
              onChangeText={setCurrentPassword}
              placeholder="请输入当前密码"
              value={currentPassword}
            />
            <Button
              disabled={saving || startingRecovery}
              loading={startingRecovery}
              onPress={() => void startSmsRecovery()}
              variant="ghost"
            >
              忘记当前密码？使用短信验证
            </Button>
          </>
        ) : null}
        <PasswordField
          label="新密码"
          onChangeText={setNewPassword}
          placeholder="请输入 10–64 位新密码"
          value={newPassword}
        />
        <AppText color={passwordError ? colors.destructive : colors.mutedForeground} variant="micro">
          {passwordError || '密码为 10–64 位，且至少包含一个字母和一个数字。'}
        </AppText>
        <PasswordField
          label="确认新密码"
          onChangeText={setConfirmation}
          placeholder="请再次输入新密码"
          value={confirmation}
        />
        {confirmationError ? <AppText color={colors.destructive} variant="caption">{confirmationError}</AppText> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button
          disabled={!ready || saving}
          loading={saving}
          onPress={() => void savePassword()}
          size="lg"
          testID="password-submit"
        >
          {setup ? '完成注册' : '保存密码'}
        </Button>
        <AppText style={styles.center} variant="micro">密码仅用于身份验证，不会写入学习资料或本机日志。</AppText>
      </View>
      <BottomSheet onClose={finish} visible={saved}>
        <SheetResult
          actionLabel={setup ? '进入 App' : undefined}
          body={setup ? '账号注册已完成，现在可以使用验证码或密码登录。' : '登录密码已更新，可以继续使用验证码或密码登录。'}
          onPress={finish}
          title={setup ? '注册完成' : '密码已保存'}
        />
      </BottomSheet>
    </Page>
  );
}

function getPasswordPolicyError(password: string) {
  if (!password) return '';
  if (isValidPhonePassword(password)) return '';
  const length = Array.from(password).length;
  if (length < 10 || length > 64) return '密码长度需要为 10–64 位';
  if (!/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) return '密码必须同时包含字母和数字';
  return '';
}

function getPasswordUpdateError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  if (code === 'invalid_phone_or_password' || code === 'invalid_current_password' || code === 'invalid_credentials') return '当前密码不正确，请重新输入';
  if (code === 'password_unchanged' || code === 'same_password') return '新密码不能与当前密码相同';
  if (code === 'invalid_phone_password' || code === 'password_too_weak') return '新密码不符合安全要求，请更换后重试';
  if (code === 'phone_reauthentication_required') return '登录验证已过期，请通过短信验证码验证后重试';
  return '密码保存失败，请稍后重试';
}

function DeleteAccountPage() {
  const router = useRouter();
  const auth = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [authenticationMethod, setAuthenticationMethod] = useState<AccountDeletionAuthentication['method']>();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const hasApple = auth.session?.user.providers.includes('apple') === true
    && auth.account?.providers.includes('apple') === true;
  const hasWechat = auth.session?.user.providers.includes('wechat') === true
    && auth.account?.providers.includes('wechat') === true;
  const hasPassword = auth.account?.hasPassword === true
    || (auth.session?.user.providers.includes('phone') === true && auth.session.user.hasPassword);
  const hasPhoneOtp = auth.account?.phoneBound === true;
  const authenticationOptions = useMemo<{ label: string; method: AccountDeletionAuthentication['method'] }[]>(() => [
    ...(hasApple ? [{ label: 'Apple', method: 'apple' as const }] : []),
    ...(hasWechat ? [{ label: '微信', method: 'wechat' as const }] : []),
    ...(hasPassword ? [{ label: '登录密码', method: 'password' as const }] : []),
    ...(hasPhoneOtp ? [{ label: '短信验证码', method: 'phone_otp' as const }] : []),
  ], [hasApple, hasPassword, hasPhoneOtp, hasWechat]);
  const selectedAuthentication = authenticationOptions.find(({ method }) => method === authenticationMethod);
  const authenticationReady = authenticationMethod === 'apple'
    || authenticationMethod === 'wechat'
    || (authenticationMethod === 'password' && password.length > 0)
    || (authenticationMethod === 'phone_otp' && /^\d{6}$/u.test(phoneOtp));
  const ready = agreed && confirmation === '注销账号' && authenticationReady;
  const risks = [
    '学习记录、标注、笔记、同步数据与 AI 账号数据将从活跃系统删除',
    '会员权益与剩余 AI 点数将失效；依法需要保留的交易记录不受影响',
    '服务端完成删除后，本机个人资料、录音、会话与待同步队列将清除',
    '操作不可撤销；重新注册会获得新的独立账号',
  ];

  useEffect(() => {
    if (authenticationOptions.some(({ method }) => method === authenticationMethod)) return;
    setAuthenticationMethod(authenticationOptions[0]?.method);
  }, [authenticationMethod, authenticationOptions]);

  async function requestOtp() {
    setOtpSending(true);
    setError('');
    try {
      await auth.requestAccountDeletionPhoneOtp();
      setOtpSent(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'phone_otp_rate_limited' ? '验证码请求过于频繁，请稍后重试' : '验证码发送失败，请稍后重试');
    } finally {
      setOtpSending(false);
    }
  }

  async function remove() {
    if (!ready) return;
    setDeleting(true);
    setError('');
    try {
      await auth.deleteAccount({
        method: authenticationMethod!,
        ...(authenticationMethod === 'password' ? { password } : {}),
        ...(authenticationMethod === 'phone_otp' ? { phoneOtp } : {}),
      });
      router.replace('/auth/login');
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      if (code === 'invalid_phone_or_password' || code === 'invalid_credentials') setError('登录密码不正确，请重新输入');
      else if (code === 'invalid_phone_otp') setError('验证码错误或已过期，请重新获取');
      else if (code === 'social_auth_cancelled') setError('已取消身份验证，账号未注销');
      else if (code === 'identity_already_in_use') setError('当前第三方身份与本账号不一致，账号未注销');
      else setError('暂时无法确认注销请求，请检查网络后重试；重复提交不会重复删除');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="注销账号">
      <View style={styles.delete}>
        <View style={styles.dangerHero}>
          <View style={styles.dangerIcon}><AlertTriangle color={colors.destructive} size={30} /></View>
          <AppText variant="sectionTitle">此操作不可撤销</AppText>
          <AppText style={styles.center}>注销账号会永久删除当前账号及其活跃数据。</AppText>
        </View>
        <Card style={styles.risks}>{risks.map((risk) => <View key={risk} style={styles.risk}><View style={styles.riskDot}><AppText color={colors.destructive} variant="micro">×</AppText></View><AppText style={styles.flex}>{risk}</AppText></View>)}</Card>
        {authenticationOptions.length > 0 ? (
          <Choice
            label="验证方式"
            onChange={(label) => setAuthenticationMethod(authenticationOptions.find((option) => option.label === label)?.method)}
            options={authenticationOptions.map(({ label }) => label)}
            value={selectedAuthentication?.label ?? ''}
          />
        ) : <AppText color={colors.destructive} variant="caption">当前账号没有可用的身份验证方式，请联系客服。</AppText>}
        {authenticationMethod === 'apple' ? <AppText variant="caption">提交时将由 Apple 弹窗再次验证你的身份。</AppText> : null}
        {authenticationMethod === 'wechat' ? <AppText variant="caption">提交时将跳转微信再次验证你的身份。</AppText> : null}
        {authenticationMethod === 'password' ? <TextField accessibilityLabel="登录密码" label="登录密码" onChangeText={setPassword} secureTextEntry value={password} /> : null}
        {authenticationMethod === 'phone_otp' ? (
          <View style={styles.formNoPad}>
            <Button disabled={otpSending || deleting} onPress={() => void requestOtp()} variant="outline">{otpSending ? '正在发送…' : otpSent ? '重新发送验证码' : '发送短信验证码'}</Button>
            <TextField keyboardType="number-pad" label="短信验证码" maxLength={6} onChangeText={setPhoneOtp} value={phoneOtp} />
          </View>
        ) : null}
        <TextField label="确认文字" onChangeText={setConfirmation} placeholder="请输入：注销账号" value={confirmation} />
        <Pressable onPress={() => setAgreed(!agreed)} style={styles.consent}><View style={[styles.checkbox, agreed && styles.checkboxOn]}>{agreed ? <Check color={colors.primaryForeground} size={12} /> : null}</View><AppText variant="caption">我已知晓上述风险，仍要注销账号</AppText></Pressable>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={!ready || deleting} onPress={() => void remove()} size="lg" variant="destructive">{deleting ? '正在验证并注销…' : '验证身份并永久注销'}</Button>
        <Button disabled={deleting} onPress={router.back} size="lg" variant="outline">放弃，返回</Button>
      </View>
    </Page>
  );
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
function SheetResult({ title, body, actionLabel = '我知道了', onPress }: { title: string; body: string; actionLabel?: string; onPress: () => void }) { return <View style={styles.sheet}><CheckCircle2 color={colors.primary} size={38} /><AppText variant="sectionTitle">{title}</AppText><AppText style={styles.center}>{body}</AppText><Button onPress={onPress}>{actionLabel}</Button></View>; }
function AsrModelSheet({ visible, current, onClose, onSelect }: { visible: boolean; current: TencentAsrModel; onClose: () => void; onSelect: (model: TencentAsrModel) => void }) { return <BottomSheet accessibilityLabel="选择腾讯 ASR 模型" onClose={onClose} visible={visible}><View style={styles.modelSheet}><AppText variant="sectionTitle">选择转写模型</AppText><AppText variant="caption">选择只保存在本机，并从下一次转写开始生效。</AppText><View style={styles.modelOptions}>{ASR_MODEL_OPTIONS.map((option) => { const selected = option.model === current; return <Pressable accessibilityLabel={`使用 ${option.model}`} accessibilityState={{ selected }} key={option.model} onPress={() => onSelect(option.model)} style={[styles.modelOption, selected && styles.modelOptionSelected]}><View style={styles.flex}><AppText color={selected ? colors.primary : colors.foreground} variant="button">{option.model}</AppText><AppText variant="micro">{option.title} · {option.description}</AppText></View>{selected ? <Check color={colors.primary} size={18} /> : null}</Pressable>; })}</View><AppText variant="micro">当前未启用热词、词汇替换、自学习模型或航空规则化脚本。</AppText></View></BottomSheet>; }
function LogoutDialog({
  allDevicesMode,
  allDevicesReady,
  authenticationMethod,
  authenticationOptions,
  error,
  onAll,
  onAllConfirm,
  onBack,
  onCancel,
  onCurrent,
  onMethod,
  onOtp,
  onPassword,
  onRequestOtp,
  otp,
  otpSending,
  otpSent,
  password,
  selectedAuthenticationLabel,
  visible,
}: {
  allDevicesMode: boolean;
  allDevicesReady: boolean;
  authenticationMethod?: AccountDeletionAuthentication['method'];
  authenticationOptions: { label: string; method: AccountDeletionAuthentication['method'] }[];
  error: string;
  onAll: () => void;
  onAllConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
  onCurrent: () => void;
  onMethod: (method: AccountDeletionAuthentication['method'] | undefined) => void;
  onOtp: (value: string) => void;
  onPassword: (value: string) => void;
  onRequestOtp: () => void;
  otp: string;
  otpSending: boolean;
  otpSent: boolean;
  password: string;
  selectedAuthenticationLabel: string;
  visible: boolean;
}) {
  return (
    <AppModal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable onPress={onCancel} style={styles.overlay}>
        <Pressable onPress={() => undefined} style={styles.logout}>
          <View style={styles.handle} />
          <View style={styles.dangerIcon}><LogOut color={colors.destructive} size={26} /></View>
          <AppText variant="sectionTitle">{allDevicesMode ? '验证后退出全部设备' : '退出登录'}</AppText>
          <AppText style={styles.center}>退出不会删除学习数据；未同步变更会保留在本机。</AppText>
          {allDevicesMode ? (
            <>
              {authenticationOptions.length > 0 ? (
                <Choice
                  label="验证方式"
                  onChange={(label) => onMethod(authenticationOptions.find((option) => option.label === label)?.method)}
                  options={authenticationOptions.map(({ label }) => label)}
                  value={selectedAuthenticationLabel}
                />
              ) : <AppText color={colors.destructive} variant="caption">当前账号没有可用的身份验证方式，请联系客服。</AppText>}
              {authenticationMethod === 'apple' ? <AppText variant="caption">继续后将由 Apple 弹窗再次验证身份。</AppText> : null}
              {authenticationMethod === 'wechat' ? <AppText variant="caption">继续后将跳转微信再次验证身份。</AppText> : null}
              {authenticationMethod === 'password' ? <TextField accessibilityLabel="登录密码" label="登录密码" onChangeText={onPassword} secureTextEntry value={password} /> : null}
              {authenticationMethod === 'phone_otp' ? (
                <View style={styles.formNoPad}>
                  <Button disabled={otpSending} onPress={onRequestOtp} variant="outline">
                    {otpSending ? '正在发送…' : otpSent ? '重新发送验证码' : '发送短信验证码'}
                  </Button>
                  <TextField keyboardType="number-pad" label="短信验证码" maxLength={6} onChangeText={onOtp} value={otp} />
                </View>
              ) : null}
              {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
              <Button disabled={!allDevicesReady} onPress={onAllConfirm} size="lg" variant="destructive">验证并退出全部设备</Button>
              <Button onPress={onBack} size="lg" variant="outline">返回</Button>
            </>
          ) : (
            <>
              <Button onPress={onCurrent} size="lg">仅退出当前设备</Button>
              <Button onPress={onAll} size="lg" variant="destructive">退出全部设备</Button>
              <Button onPress={onCancel} size="lg" variant="outline">取消</Button>
            </>
          )}
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[5] }, profileHero: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[5] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 74, justifyContent: 'center', overflow: 'hidden', position: 'relative', width: 74 }, avatarSmall: { height: 58, width: 58 }, avatarImage: { borderRadius: radii.full, height: 74, width: 74 }, avatarSmallImage: { height: 58, width: 58 }, editBadge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, bottom: 0, height: 20, justifyContent: 'center', position: 'absolute', right: 0, width: 20, zIndex: 2 }, avatarEdit: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[5] }, form: { gap: spacing[4], padding: spacing[5] }, formNoPad: { gap: spacing[4] }, passwordForm: { gap: spacing[4], padding: spacing[5] }, passwordIntro: { gap: spacing[2] }, textarea: { minHeight: 72, textAlignVertical: 'top' }, center: { textAlign: 'center' }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, rowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowIconDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, flex: { flex: 1 }, choice: { gap: spacing[2] }, choiceRow: { flexDirection: 'row', gap: spacing[2] }, choiceButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing[1] }, choiceSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, modelSheet: { gap: spacing[4] }, modelOptions: { gap: spacing[2] }, modelOption: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 68, padding: spacing[3] }, modelOptionSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, syncCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] }, syncIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, current: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, softIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 }, delete: { gap: spacing[3], padding: spacing[5] }, dangerHero: { alignItems: 'center', gap: spacing[2] }, dangerIcon: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, risks: { backgroundColor: 'rgba(219,43,51,0.04)', borderColor: 'rgba(219,43,51,0.22)', gap: spacing[3] }, risk: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] }, riskDot: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 18, justifyContent: 'center', width: 18 }, consent: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[3] }, overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }, logout: { alignItems: 'stretch', backgroundColor: colors.card, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] }, handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radii.full, height: 4, marginBottom: spacing[1], width: 40 },
});
