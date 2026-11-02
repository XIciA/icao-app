import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { buildHotspotSession, type HotspotSessionResult } from './build-hotspot-session';
import { loadHotspotDataset } from './HotspotDetailScreen';
import { getHotspotBrief } from './repository';

export function HotspotStudyScreen({ briefId }: { briefId: string }) {
  const brief = getHotspotBrief(briefId);
  const [session, setSession] = useState<HotspotSessionResult>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!brief) return;
    setError(undefined);
    try {
      setSession(buildHotspotSession(brief, await loadHotspotDataset()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热点练习包读取失败。');
    }
  }, [brief]);

  useEffect(() => { void load(); }, [load]);

  if (!brief) {
    return (
      <Screen>
        <CenteredState  kind="unavailable"  />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <CenteredState actionLabel="重试"  onAction={() => void load()} kind="failure"  />
      </Screen>
    );
  }
  if (!session) return <GlobalLoadingScreen />;

  const returnHref: Href = {
    pathname: '/content/hotspot/[briefId]',
    params: { briefId: brief.id },
  };
  return (
    <QuestionBankStudyScreen
      category={session.category}
      dataset={session.dataset}
      returnHref={returnHref}
      returnLabel="返回热点详情"
      sourceRoute={`/content/hotspot/${brief.id}/study`}
      topic={session.topic}
    />
  );
}
