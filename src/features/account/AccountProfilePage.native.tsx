import { requestPhotoSelectionPermission } from '@/platform/photo-permission.native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, fonts, radii, spacing } from '@/theme';
import { prepareProfileAvatar } from '../../../modules/icao-profile-avatar/src';
import { EXAM_GOALS } from './profile-model';
import { ProfileAvatar } from './ProfileAvatar';
import { updateProfile, useProfile } from './profile-store.native';

export function AccountProfilePage() {
  const router = useRouter();
  const auth = useAuth();
  const profile = useProfile();
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const edited = useRef(false);
  const accountId = auth.account?.accountId;
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const draftAccount = useRef(accountId);
  const focused = useRef(false);
  const pendingAction = useRef<{ accountId: string } | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    focused.current = !!accountId;
    pendingAction.current = undefined;
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
      edited.current = false;
      setDraft(profile);
    }
  }, [accountId, profile]);
  useEffect(() => { if (!edited.current) setDraft(profile); }, [profile]);
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
      edited.current = true;
      setDraft((current) => ({ ...current, avatarUri: uri }));
    } catch { if (actionIsCurrent(action)) setError('图片读取失败，请重试。'); }
    finally {
      if (actionIsCurrent(action)) { pendingAction.current = undefined; setPicking(false); }
    }
  }

  async function save() {
    if (!dirty) return;
    const displayName = draft.displayName.trim();
    if (!displayName || Array.from(displayName).length > 24) { setError('昵称需要为 1–24 个字符。'); return; }
    const action = beginAction();
    if (!action) return;
    setSaving(true);
    setError('');
    try {
      await updateProfile({ ...draft, displayName });
      if (!actionIsCurrent(action)) return;
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
    edited.current = true;
    setDraft(current => ({ ...current, target: goal.id }));
  }

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="个人资料" />
      <View style={styles.form}>
        <Pressable accessibilityRole="button" accessibilityLabel="更换头像" disabled={saving || picking} onPress={() => void chooseAvatar()} style={styles.avatar}>
          <ProfileAvatar size={64} uri={draft.avatarUri} />
          <View style={styles.avatarCopy}>
            <AppText variant="cardTitle">个人头像</AppText>
            <AppText color={colors.primary} variant="body">{picking ? '正在读取…' : '更换头像'}</AppText>
          </View>
        </Pressable>
        <View style={styles.nicknameGroup}>
          <AppText color={colors.mutedForeground} variant="caption">昵称</AppText>
          <TextInput accessibilityLabel="昵称" editable={!saving} maxLength={48} style={styles.nickname} onChangeText={(displayName) => { edited.current = true; setDraft((current) => ({ ...current, displayName })); setError(''); }} value={draft.displayName} />
        </View>
        <AppText variant="sectionTitle">备考目标</AppText>
        <View style={styles.goal}>
          <AppText color={colors.mutedForeground} variant="caption">目标等级</AppText>
          <View style={styles.options}>
            {(['icao4', 'icao5'] as const).map(level => <Pressable key={level} accessibilityRole="radio" accessibilityLabel={level === 'icao4' ? 'ICAO 4' : 'ICAO 5'} accessibilityState={{checked: goalLevel === level, disabled: saving}} disabled={saving} onPress={() => chooseGoal(level, goalType)} style={[styles.option, goalLevel === level && styles.selected]}><AppText color={goalLevel === level ? colors.primary : colors.mutedForeground} variant="button">{level === 'icao4' ? 'ICAO 4' : 'ICAO 5'}</AppText></Pressable>)}
          </View>
        </View>
        <View style={styles.goal}>
          <AppText color={colors.mutedForeground} variant="caption">考试类型</AppText>
          <View style={styles.options}>
            {(['first', 'recert'] as const).map(type => <Pressable key={type} accessibilityRole="radio" accessibilityLabel={type === 'first' ? '初考' : '复考'} accessibilityState={{checked: goalType === type, disabled: saving}} disabled={saving} onPress={() => chooseGoal(goalLevel, type)} style={[styles.option, goalType === type && styles.selected]}><AppText color={goalType === type ? colors.primary : colors.mutedForeground} variant="button">{type === 'first' ? '初考' : '复考'}</AppText></Pressable>)}
          </View>
        </View>
        <View style={styles.goal}>
          <AppText variant="caption">账号 ID</AppText>
          <AppText selectable variant="caption">{auth.account?.accountId ?? '正在读取…'}</AppText>
        </View>
        {error ? <AppText accessibilityRole="alert" color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={!dirty || saving || picking} loading={saving} onPress={() => void save()} size="lg">保存修改</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  form: { gap: spacing[5], padding: spacing[5] },
  avatar: { alignItems: 'center', flexDirection: 'row', gap: spacing[4], marginBottom: spacing[2] },
  avatarCopy: { gap: spacing[2] },
  nicknameGroup: { gap: spacing[2], marginBottom: spacing[2] },
  nickname: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing[3], color: colors.foreground, fontFamily: fonts.sansRegular, fontSize: 20 },
  goal: { gap: spacing[3] },
  options: { flexDirection: 'row', gap: spacing[2], padding: spacing[1], backgroundColor: colors.muted, borderRadius: radii.lg },
  option: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 48, padding: spacing[2], borderRadius: radii.md },
  selected: { backgroundColor: colors.card },
});
