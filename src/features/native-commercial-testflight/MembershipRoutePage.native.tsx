import { Platform, StyleSheet, View } from 'react-native';

import {
  AccountScreen,
  AccountTopBar,
} from '@/components/account/account-ui';
import { ShieldCheck } from '@/components/ui/icons';
import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { MembershipPage } from './MembershipPage';

export function MembershipRoutePage() {
  if (Platform.OS !== 'android') return <MembershipPage />;

  return (
    <AccountScreen>
      <AccountTopBar title="会员与购买" />
      <Card elevated style={styles.card}>
        <View style={styles.icon}>
          <ShieldCheck color={colors.primary} size={26} />
        </View>
        <AppText variant="sectionTitle">Android 暂不提供应用内购买</AppText>
        <AppText style={styles.description} variant="caption">
          你仍可登录账号并使用已开放的学习内容。购买功能开放时间请以应用内后续通知为准。
        </AppText>
      </Card>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[8],
  },
  description: { textAlign: 'center' },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderRadius: radii.xl,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
});
