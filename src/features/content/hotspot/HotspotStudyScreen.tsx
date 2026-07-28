import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';

import { buildHotspotSession, type HotspotSessionResult } from './build-hotspot-session';
import { loadHotspotDataset } from './HotspotDetailScreen';
import { getHotspotBrief } from './repository';

export function HotspotStudyScreen({ briefId }: { briefId: string }) {
  const router = useRouter();
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
        <TopBar onBack={() => router.back()} title="OPI 热点" />
        <CenteredState description="该热点资讯不存在或已经下线。" title="无法开始热点学习" tone="destructive" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} title={brief.title} />
        <CenteredState actionLabel="重新加载" description={error} onAction={() => void load()} title="热点练习包读取失败" tone="destructive" />
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
