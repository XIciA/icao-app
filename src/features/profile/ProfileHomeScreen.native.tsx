import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { useGuide } from '@/features/usage-guide/GuideBindings';
import { unreadFeedback } from '@/features/feedback/feedback-history-client.native';
import { trackProductClick } from '@/platform/product-clicks.native';
import { useFocusEffect } from 'expo-router';
import { Download, Flame, HelpCircle, MessageCircle, Settings, Star } from '@/components/ui/icons';
import { useCallback, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, spacing } from '@/theme';
import { ProfileLearningCard } from './ProfileLearningCard.native';
import { AccountScreen, RowGroup, Row } from '@/components/account/account-ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/account/profile-store.native';
import { ProfileIdentityCard } from './ProfileIdentityCard.native';

const menu = [
  { slug: 'membership', label: '会员购买', icon: Star },
  { slug: 'guide', label: '使用指南', icon: HelpCircle },
  { slug: 'exam-feedback', label: '考情反馈', icon: Flame },
  { slug: 'feedback', label: '意见反馈', icon: MessageCircle },
  { slug: 'downloads', label: '下载管理', icon: Download },
  { slug: 'settings', label: '设置', icon: Settings },
];

export function ProfileHomeScreen() {
  const router = useRouter();
  const guide = useGuide();
  const auth = useAuth();
  const profile = useProfile();
  const cloudWeb = Platform.OS === 'web' && isEdgeOneProductionWeb();
  const visibleMenu = menu.filter(item => item.slug !== 'downloads' || Platform.OS !== 'web').filter((item) => Platform.OS !== 'web' || cloudWeb
    || (item.slug !== 'membership' && item.slug !== 'feedback' && item.slug !== 'exam-feedback'));
  const [examUnread, setExamUnread] = useState<{accountId:string;value:boolean}>();
  const [feedbackUnread, setFeedbackUnread] = useState<{accountId:string;value:boolean}>();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        if (!accountId) return;
        void unreadFeedback('exam_report').then(result => { if(active)setExamUnread({accountId,value:result.unread}); }).catch(() => undefined);
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
    else if (slug === 'downloads') router.push('/account/downloads');
    else if (slug === 'settings') router.push('/account/settings');
    else if (slug === 'exam-feedback') router.push({ pathname: '/info/[slug]', params: { slug: 'feedback', source: 'exam_report' } });
    else if (slug === 'feedback')
      router.push({
        pathname: '/info/[slug]',
        params: { slug: 'feedback', source: 'profile', sourceRoute: '/(tabs)/profile' },
      });
    else router.push('/account/profile');
  }

  return (
    <View style={styles.root}><AccountScreen background={<SoftGlow intensity={0.8} size={320} style={styles.glow} />}>
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
            />{((item.slug === 'feedback' && feedbackUnread?.accountId === accountId && feedbackUnread?.value) || (item.slug === 'exam-feedback' && examUnread?.accountId === accountId && examUnread?.value)) ? <View accessibilityLabel="反馈有新回复" style={styles.unreadDot}/> : null}</View>
          ))}
        </RowGroup>
      </View>
    </AccountScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { left: -170, top: -180 },
  unreadDot: {position:'absolute',right:40,top:26,width:8,height:8,borderRadius:4,backgroundColor:colors.primary},
  menuSpacing: { marginTop: spacing[5] },
});
