import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { requestPhotoSelectionPermission } from '@/platform/photo-permission.native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, fonts, radii, spacing } from '@/theme';
import { prepareProfileAvatar } from '../../../modules/icao-profile-avatar/src';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuideScrollView } from '@/features/usage-guide/GuideScrollView';
import { DetailGroup, DetailRow } from '@/components/ui/DetailGroup';
import { AiAllowanceCard } from '@/features/profile/AiAllowanceCard.native';
import { MembershipStatus, membershipPresentation } from '@/features/profile/MembershipStatus.native';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import { EXAM_GOALS } from './profile-model';
import { ProfileAvatar } from './ProfileAvatar';
import { updateProfile, useProfile } from './profile-store.native';

export function AccountProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const commerce = useCommerceRuntime();
  const [editing, setEditing] = useState<'name' | 'level' | 'type'>();
  const [nameInput, setNameInput] = useState('');
  const guide = useGuide();
  const auth = useAuth();
  const profile = useProfile();
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const edited = useRef(new Set<'displayName' | 'target' | 'avatarUri'>());
  const accountId = auth.account?.accountId;
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const draftAccount = useRef(accountId);
  const focused = useRef(false);
  const pendingAction = useRef<{ accountId: string } | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    focused.current = !!accountId;
    pendingAction.current = undefined;
    setEditing(undefined);
    setPicking(false);
    setSaving(false);
    setError('');
    return () => {
      focused.current = false;
      pendingAction.current = undefined;
    };
  }, [accountId]));
  useEffect(() => {
    if (draftAccount.current !== accountId) {
      draftAccount.current = accountId;
      edited.current.clear();
      setDraft(profile);
    }
  }, [accountId, profile]);
  useEffect(() => {
    // A late cloud snapshot may refresh untouched fields while preserving the
    // fields the user actually changed in this draft.
    setDraft(current => ({
      ...profile,
      displayName: edited.current.has('displayName') ? current.displayName : profile.displayName,
      target: edited.current.has('target') ? current.target : profile.target,
      avatarUri: edited.current.has('avatarUri') ? current.avatarUri : profile.avatarUri,
    }));
  }, [profile]);
  const dirty = draft.displayName !== profile.displayName || draft.target !== profile.target || draft.avatarUri !== profile.avatarUri;

  function beginAction() {
    if (!focused.current || !accountId || pendingAction.current) return undefined;
    const action = { accountId };
    pendingAction.current = action;
    return action;
  }

  function actionIsCurrent(action: { accountId: string }) {
    return focused.current && pendingAction.current === action && currentAccount.current === action.accountId;
  }

  async function chooseAvatar() {
    const action = beginAction();
    if (!action) return;
    setPicking(true);
    setError('');
    try {
      const permission = await requestPhotoSelectionPermission(() => void chooseAvatar(), () => focused.current && currentAccount.current === action.accountId);
      if (!actionIsCurrent(action)) return;
      if (!permission) return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, base64: false });
      if (!actionIsCurrent(action) || result.canceled) return;
      const sourceUri = result.assets[0]?.uri;
      if (!sourceUri) throw new Error('No selected image');
      const uri = await prepareProfileAvatar(sourceUri);
      if (!actionIsCurrent(action)) return;
      edited.current.add('avatarUri');
      setDraft((current) => ({ ...current, avatarUri: uri }));
    } catch { if (actionIsCurrent(action)) setError('图片读取失败，请重试。'); }
    finally {
      if (actionIsCurrent(action)) { pendingAction.current = undefined; setPicking(false); }
    }
  }

  async function save() {
    if ((!dirty || !edited.current.size) && guide?.step !== 'setup-save') return;
    const displayName = draft.displayName.trim();
    if (!displayName || Array.from(displayName).length > 24) { setError('昵称需要为 1–24 个字符。'); return; }
    const action = beginAction();
    if (!action) return;
    setSaving(true);
    setError('');
    try {
      await updateProfile({
        ...(edited.current.has('displayName') ? { displayName } : {}),
        ...(edited.current.has('target') ? { target: draft.target } : {}),
        ...(edited.current.has('avatarUri') ? { avatarUri: draft.avatarUri } : {}),
      });
      if (!actionIsCurrent(action)) return;
      guide?.event('setup-save');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile');
    } catch { if (actionIsCurrent(action)) setError('资料保存未完成，请重试。'); }
    finally {
      if (actionIsCurrent(action)) { pendingAction.current = undefined; setSaving(false); }
    }
  }

  const goalLevel = draft.target.startsWith('icao5') ? 'icao5' : 'icao4';
  const goalType = draft.target.endsWith('recert') ? 'recert' : 'first';
  function chooseGoal(level: string, type: string) {
    const goal = EXAM_GOALS.find(item => item.id === `${level}-${type}`);
    if (!goal) return;
    edited.current.add('target');
    setDraft(current => ({ ...current, target: goal.id }));
  }

  return (
    <Screen contentStyle={styles.screen} keyboard header={<TopBar title="个人资料" />}>
      <GuideScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <DetailGroup title="基本资料">
          <DetailRow label="头像" disabled={saving || picking} onPress={() => void chooseAvatar()}><ProfileAvatar size={48} uri={draft.avatarUri} /></DetailRow>
          <DetailRow label="昵称" last disabled={saving || picking} onPress={() => { setNameInput(draft.displayName); setEditing('name'); }}>{draft.displayName}</DetailRow>
        </DetailGroup>
        <DetailGroup title="备考目标">
          <View><GuideAnchor id="setup-level" /><DetailRow label="目标等级" disabled={saving || picking} onPress={() => setEditing('level')}>{goalLevel === 'icao4' ? 'ICAO 4' : 'ICAO 5'}</DetailRow></View>
          <View><GuideAnchor id="setup-type" /><DetailRow label="考试类型" last disabled={saving || picking} onPress={() => setEditing('type')}>{goalType === 'first' ? '初考' : '复考'}</DetailRow></View>
        </DetailGroup>
        <DetailGroup title="会员与账号">
          <DetailRow label="会员"><MembershipStatus /></DetailRow>
          <DetailRow label="到期时间"><AppText variant="caption">{membershipPresentation(commerce.entitlement).expires}</AppText></DetailRow>
          <AiAllowanceCard compact />
          <DetailRow label="账号 ID" last><AppText selectable variant="caption" style={styles.accountId}>{auth.account?.accountId ?? '正在读取…'}</AppText></DetailRow>
        </DetailGroup>
        {error ? <AppText accessibilityRole="alert" color={colors.destructive} variant="caption">{error}</AppText> : null}
      </GuideScrollView>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}><GuideAnchor id="setup-save" /><Button disabled={(!dirty && guide?.step !== 'setup-save') || saving || picking} loading={saving} onPress={() => void save()} size="lg">保存修改</Button></View>
      <BottomSheet visible={!!editing} onClose={() => setEditing(undefined)} accessibilityLabel={editing === 'name' ? '修改昵称' : editing === 'level' ? '目标等级' : '考试类型'}>
        <View style={styles.editor}>
          <AppText variant="sectionTitle">{editing === 'name' ? '修改昵称' : editing === 'level' ? '目标等级' : '考试类型'}</AppText>
          {editing === 'name' ? <><TextInput accessibilityLabel="编辑昵称" maxLength={48} style={styles.nickname} value={nameInput} onChangeText={setNameInput} /><AppText variant="caption">1–24 个字符</AppText><Button disabled={!nameInput.trim() || Array.from(nameInput.trim()).length > 24} onPress={() => { edited.current.add('displayName'); setDraft(current => ({ ...current, displayName: nameInput.trim() })); setError(''); setEditing(undefined); }}>完成</Button></> : (editing === 'level' ? ['icao4', 'icao5'] : ['first', 'recert']).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'icao4' ? 'ICAO 4' : value === 'icao5' ? 'ICAO 5' : value === 'first' ? '初考' : '复考'} accessibilityState={{ checked: value === (editing === 'level' ? goalLevel : goalType) }} style={styles.option} onPress={() => { if (editing === 'level') { chooseGoal(value, goalType); guide?.event('setup-level'); } else { chooseGoal(goalLevel, value); guide?.event('setup-type'); } setEditing(undefined); }}><AppText color={value === (editing === 'level' ? goalLevel : goalType) ? colors.primary : colors.foreground}>{({ icao4: 'ICAO 4', icao5: 'ICAO 5', first: '初考', recert: '复考' })[value as 'icao4' | 'icao5' | 'first' | 'recert']}</AppText></Pressable>)}
        </View>
      </BottomSheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, form: { gap: spacing[5], padding: spacing[5] },
  dock: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing[5], paddingTop: spacing[4], backgroundColor: colors.background },
  editor: { gap: spacing[4] }, accountId: { textAlign: 'right' },
  nickname: { borderColor: colors.input, borderWidth: 1, borderRadius: radii.md, padding: spacing[3], color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 16 },
  option: { minHeight: 48, paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
});
