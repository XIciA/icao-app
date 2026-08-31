import { useLocalSearchParams } from 'expo-router';

import { HotspotDetailScreen } from '@/features/content/hotspot/HotspotDetailScreen';

export default function HotspotDetailRoute() {
  const { briefId: rawBriefId } = useLocalSearchParams<{ briefId?: string | string[] }>();
  const briefId = Array.isArray(rawBriefId) ? rawBriefId[0] ?? '' : rawBriefId ?? '';
  return <HotspotDetailScreen briefId={briefId} />;
}
