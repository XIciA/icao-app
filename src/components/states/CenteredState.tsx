import { BookX, Download, FileText, RefreshCw, Shield, UserRound, WifiOff } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/theme';
import { AppText, Button } from '../ui';
import { useAppRouter } from '@/components/navigation/useAppRouter';

const states = {
  membership: { title: '会员内容', icon: Shield },
  download: { title: '内容未就绪', icon: Download },
  failure: { title: '暂时无法加载', icon: RefreshCw },
  unavailable: { title: '内容不可用', icon: BookX },
  empty: { title: '暂无内容', icon: FileText },
  verification: { title: '需要联网验证', icon: WifiOff },
  scope: { title: '不在当前学习范围', icon: BookX },
  'account-deletion': { title: '账号正在注销', icon: UserRound },
  account: { title: '暂时无法确认账号状态', icon: RefreshCw },
} as const;
export type IntermediateStateKind = keyof typeof states;
type Props = {
  kind: IntermediateStateKind;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  busy?: boolean;
  /** Local nested screens must supply their own return target. */
  onReturn?: () => void;
  allowReturn?: boolean;
};

/** One prompt surface, at most two actions. Business decisions remain with callers. */
export function CenteredState({ kind, actionLabel, onAction, secondaryLabel, onSecondary, busy, onReturn, allowReturn = true }: Props) {
  const router = useAppRouter();
  const back = onReturn ?? (() => router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const { title, icon: Icon } = states[kind];
  const primary = onAction ?? (allowReturn ? back : undefined);
  const secondary = onSecondary ?? (onAction && allowReturn && onAction !== onReturn ? back : undefined);
  return <View style={styles.root} testID="intermediate-prompt">
    <View style={styles.hero}><Icon color={colors.primary} size={32} /></View>
    <AppText style={styles.title} variant="sectionTitle">{title}</AppText>
    <View style={styles.actions}>
      {primary ? <Button accessibilityLabel={onAction ? actionLabel ?? '重试' : '返回'} disabled={busy} onPress={primary}>{onAction ? actionLabel ?? '重试' : '返回'}</Button> : null}
      {secondary ? <Button accessibilityLabel={secondaryLabel ?? '返回'} disabled={busy} onPress={secondary} style={styles.secondary} variant="outline">{secondaryLabel ?? '返回'}</Button> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: spacing[8] },
  hero: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 64, justifyContent: 'center', width: 64 },
  title: { marginTop: spacing[6], textAlign: 'center' },
  actions: { marginTop: spacing[6], minWidth: 160, gap: spacing[2] },
  secondary: { backgroundColor: colors.secondary },
});
