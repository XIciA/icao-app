import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { useMemo } from 'react';
import { selectHotspotSource } from '@icao/contracts/app-content';
import { buildHotspotStudyPackage } from './build-hotspot-study-package.native';
import type { Href } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { spacing } from '@/theme';

import { HotspotAccessNotice, HotspotBriefCard } from './HotspotAccessView.native';
import { useHotspotAccess } from './use-hotspot-access.native';

export function HotspotStudyScreen({ briefId }: { briefId: string }) {
  return <NativeScreenBoundary title="OPI 热点" fallbackHref="/content/hotspot" resetKey={briefId}><HotspotStudyContent briefId={briefId} /></NativeScreenBoundary>;
}

function HotspotStudyContent({ briefId }: { briefId: string }) {
  const router = useRouter();
  const {center}=useLocalSearchParams<{center?:string}>();
  const { retry, state } = useHotspotAccess(briefId, { freezeReadyForStudy: true });
  const studyPackage=useMemo(()=>{
    if(state.status!=='ready')return undefined;
    if(!center||center==='all')return state.session;
    const brief=selectHotspotSource(state.brief,center);
    const dataset=state.session.items[0]?.dataset;
    return dataset&&brief.topics.length?buildHotspotStudyPackage(brief,dataset):state.session;
  },[state,center]);
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/content/hotspot'); };
  if (state.status === 'loading') return <Screen contentStyle={styles.screen}><TopBar onBack={goBack} title="OPI 热点" /><GlobalLoadingScreen /></Screen>;

  if (state.status !== 'ready') {
    return (
      <Screen contentStyle={styles.screen} scroll>
        <TopBar onBack={goBack} title={state.brief?.title ?? 'OPI 热点'} />
        <View style={styles.body}>
          {state.brief ? <HotspotBriefCard brief={state.brief} /> : null}
          <HotspotAccessNotice
            onMembership={() => router.push({ pathname: '/account/[slug]', params: { slug: 'membership', from: 'learning' } })}
            onRetry={retry}
            result={state}
          />
        </View>
      </Screen>
    );
  }

  const returnHref: Href = {
    pathname: '/content/hotspot/[briefId]',
    params: { briefId: state.brief.id, ...(center?{center}:{}) },
  };
  return (
    <QuestionBankStudyScreen
      returnHref={returnHref}
      returnLabel="返回热点详情"
      sourceRoute={`/content/hotspot/${state.brief.id}/study`}
      studyPackage={studyPackage!}
    />
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  body: { gap: spacing[4], paddingBottom: spacing[10], paddingHorizontal: spacing[4] },
});
