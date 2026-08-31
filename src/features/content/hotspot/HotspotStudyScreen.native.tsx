import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { spacing } from '@/theme';

import { HotspotAccessNotice, HotspotBriefCard } from './HotspotAccessView.native';
import { useHotspotAccess } from './use-hotspot-access.native';

export function HotspotStudyScreen({ briefId }: { briefId: string }) {
  const router = useRouter();
  const { retry, state } = useHotspotAccess(briefId);
  if (state.status === 'loading') return <GlobalLoadingScreen />;

  if (state.status !== 'ready') {
    return (
      <Screen contentStyle={styles.screen} scroll>
        <TopBar onBack={() => router.back()} title={state.brief?.title ?? 'OPI 热点'} />
        <View style={styles.body}>
          {state.brief ? <HotspotBriefCard brief={state.brief} /> : null}
          <HotspotAccessNotice
            onMembership={() => router.push('/account/membership')}
            onRetry={retry}
            result={state}
          />
        </View>
      </Screen>
    );
  }

  const returnHref: Href = {
    pathname: '/content/hotspot/[briefId]',
    params: { briefId: state.brief.id },
  };
  return (
    <QuestionBankStudyScreen
      category={state.session.category}
      dataset={state.session.dataset}
      returnHref={returnHref}
      returnLabel="返回热点详情"
      sourceRoute={`/content/hotspot/${state.brief.id}/study`}
      topic={state.session.topic}
    />
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  body: { gap: spacing[4], paddingBottom: spacing[10], paddingHorizontal: spacing[4] },
});
