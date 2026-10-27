import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useLoginEntry } from '@/features/auth/use-login-entry';
import { safeAppDestination } from '@/features/auth/guest-access';
import { spacing } from '@/theme';

export function GuestMembershipPage() {
  const login = useLoginEntry();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeAppDestination(next);
  const destination = `/account/membership${target ? `?next=${encodeURIComponent(target)}` : ''}`;
  return <Screen scroll header={<TopBar title="开通会员" />}>
    <Card style={{ gap: spacing[4] }}>
      <AppText variant="sectionTitle">解锁会员学习功能</AppText>
      <AppText>会员可使用会员题库、会员音频、模拟练习，以及 OPI 热点的参考答案、音频和作答功能。</AppText>
      <AppText variant="caption">单词学习、免费音频、热点概览、资源分享与课程介绍无需会员，未登录也可使用。</AppText>
      <Button onPress={() => login(destination)}>登录后开通会员</Button>
    </Card>
  </Screen>;
}
