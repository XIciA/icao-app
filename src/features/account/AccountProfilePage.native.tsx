import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { Pencil } from '@/components/ui/icons';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, radii, spacing } from '@/theme';
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!actionIsCurrent(action)) return;
      if (!permission.granted) { setError('请在系统设置中允许访问照片后重试。'); return; }
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

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="个人资料" />
      <View style={styles.form}>
        <Pressable accessibilityRole="button" accessibilityLabel="更换头像" disabled={saving || picking} onPress={() => void chooseAvatar()} style={styles.avatar}>
          <View style={styles.avatarImage}>
            <ProfileAvatar size={74} uri={draft.avatarUri} />
            <View pointerEvents="none" style={styles.editBadge}><Pencil color={colors.primaryForeground} size={9} /></View>
          </View>
          <AppText color={colors.primary} variant="caption">{picking ? '正在读取…' : '更换头像'}</AppText>
        </Pressable>
        <TextField editable={!saving} label="昵称" maxLength={48} onChangeText={(displayName) => { edited.current = true; setDraft((current) => ({ ...current, displayName })); setError(''); }} value={draft.displayName} />
        <View style={styles.goal}>
          <AppText variant="button">备考目标</AppText>
          <View style={styles.options}>
            {EXAM_GOALS.map((goal) => (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.target === goal.id, disabled: saving }} disabled={saving} key={goal.id} onPress={() => { edited.current = true; setDraft((current) => ({ ...current, target: goal.id })); }} style={[styles.option, draft.target === goal.id && styles.selected]}>
                <AppText color={draft.target === goal.id ? colors.primary : colors.mutedForeground} variant="caption">{goal.label}</AppText>
              </Pressable>
            ))}
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
  avatar: { alignItems: 'center', alignSelf: 'center', gap: spacing[2], marginBottom: spacing[2] },
  avatarImage: { position: 'relative' },
  editBadge: { position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.primary },
  goal: { gap: spacing[2] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  option: { alignItems: 'center', justifyContent: 'center', width: '48%', minHeight: 44, padding: spacing[2], borderWidth: 1, borderColor: colors.input, borderRadius: radii.md, backgroundColor: colors.card },
  selected: { borderColor: colors.primary, backgroundColor: colors.primary10 },
});
