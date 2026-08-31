import { useLocalSearchParams } from 'expo-router';

import { HotspotStudyScreen } from '@/features/content/hotspot/HotspotStudyScreen';

export default function HotspotStudyRoute() {
  const { briefId: rawBriefId } = useLocalSearchParams<{ briefId?: string | string[] }>();
  const briefId = Array.isArray(rawBriefId) ? rawBriefId[0] ?? '' : rawBriefId ?? '';
  return <HotspotStudyScreen briefId={briefId} />;
}
