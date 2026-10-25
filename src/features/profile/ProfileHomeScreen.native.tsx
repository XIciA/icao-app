import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/navigation/tab-bar-metrics';
import { useGuide } from '@/features/usage-guide/GuideBindings';
import { unreadFeedback } from '@/features/feedback/feedback-history-client.native';
import { trackProductClick } from '@/platform/product-clicks.native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { HelpCircle, MessageCircle, Settings, Star } from '@/components/ui/icons';
import { useCallback, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, radii, spacing } from '@/theme';
import { ProfileLearningCard } from './ProfileLearningCard.native';
import { AccountScreen, RowGroup, Row } from '@/components/account/account-ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/account/profile-store.native';
import { ProfileIdentityCard } from './ProfileIdentityCard.native';

const menu = [
  { slug: 'membership', label: '会员购买', icon: Star },
  { slug: 'guide', label: '使用指南', icon: HelpCircle },
  { slug: 'feedback', label: '意见反馈', icon: MessageCircle },
  { slug: 'settings', label: '设置', icon: Settings },
];

export function ProfileHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reset, setReset] = useState<{ owner: string; phase: 'working' | 'done' | 'failed' }>();
  const guide = useGuide();
  const auth = useAuth();
  const profile = useProfile();
  const cloudWeb = Platform.OS === 'web' && isEdgeOneProductionWeb();
  const visibleMenu = menu.filter((item) => Platform.OS !== 'web' || cloudWeb
    || (item.slug !== 'membership' && item.slug !== 'feedback'));
  const [feedbackUnread, setFeedbackUnread] = useState<{accountId:string;value:boolean}>();
  const resetOwner = auth.account?.accountId ?? 'ui-acceptance';
  const resetState = reset?.owner === resetOwner ? reset.phase : 'idle';
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        if (!accountId) return;
        void unreadFeedback().then(result => { if(active)setFeedbackUnread({accountId,value:result.unread}); }).catch(() => undefined);
      };
      refresh();
      const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
      return () => {
        active = false;
        foreground.remove();
      };
    }, [accountId]),
  );
  const accountLabel = auth.restoring
    ? '正在确认账号…'
    : auth.session
      ? `${Platform.OS === 'web' ? cloudWeb ? '听你五个 Web' : 'Web 体验版' : '听你五个账号'} · ${auth.session.user.displayName ?? '已登录'}`
      : '尚未登录';

  function open(slug: string) {
    if (slug === 'membership') { trackProductClick('membership_open','profile'); router.push('/account/membership'); }
    else if (slug === 'guide') router.push({ pathname: '/info/[slug]', params: { slug: 'guide' } });
    else if (slug === 'settings') router.push('/account/settings');
    else if (slug === 'feedback')
      router.push({
        pathname: '/info/[slug]',
        params: { slug: 'feedback', source: 'profile', sourceRoute: '/(tabs)/profile' },
      });
    else router.push('/account/profile');
  }

  return (
    <View style={styles.root}><AccountScreen>
      <ProfileIdentityCard
        profile={profile}
        accountLabel={accountLabel}
        onOpenProfile={() => { guide?.event('setup-profile'); open('profile-detail'); }}
      />
      <ProfileLearningCard />
      <View style={styles.menuSpacing}>
        <RowGroup>
          {visibleMenu.map((item, index) => (
            <View key={item.slug}><Row
              icon={item.icon}
              isLast={index === visibleMenu.length - 1}
              label={cloudWeb && item.slug === 'membership' ? '会员权益' : item.label}
              onPress={() => open(item.slug)}
            />{item.slug === 'feedback' && feedbackUnread?.accountId === accountId && feedbackUnread?.value ? <View accessibilityLabel="反馈有新回复" style={styles.unreadDot}/> : null}</View>
          ))}
        </RowGroup>
      </View>
      {guide?.testingResetAvailable ? <View style={{ height: 80 }} /> : null}
    </AccountScreen>
    {guide?.testingResetAvailable && guide.resetForTesting ? <View style={[styles.testing, { bottom: Math.max(insets.bottom, spacing[4]) + FLOATING_TAB_BAR_HEIGHT + spacing[3] }]}>
      {resetState === 'done' ? <AppText variant="caption">已重置引导，学习数据保留</AppText> : null}
      {resetState === 'failed' ? <AppText variant="caption" color={colors.destructive}>重置未完成，请重试</AppText> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="一键重置为新用户" disabled={resetState === 'working' || guide.ready === false} onPress={() => {
        setReset({ owner: resetOwner, phase: 'working' });
        void guide.resetForTesting!().then(success => setReset(current => current?.owner === resetOwner ? { owner: resetOwner, phase: success ? 'done' : 'failed' } : current));
      }} style={styles.resetButton}><AppText color={colors.primary} variant="caption">{resetState === 'working' ? '正在重置…' : '一键重置为新用户'}</AppText></Pressable>
    </View> : null}</View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  testing: { position: 'absolute', right: spacing[4], alignItems: 'flex-end', gap: spacing[2] },
  resetButton: { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.full, minHeight: 44, paddingHorizontal: spacing[4], justifyContent: 'center' },
  unreadDot: {position:'absolute',right:40,top:26,width:8,height:8,borderRadius:4,backgroundColor:colors.primary},
  menuSpacing: { marginTop: spacing[5] },
});
