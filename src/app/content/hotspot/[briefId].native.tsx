import { useLocalSearchParams } from 'expo-router';

import { HotspotDetailScreen } from '@/features/content/hotspot/HotspotDetailScreen';

export default function HotspotDetailRoute() { return <HotspotDetailRouteBody />; }

function HotspotDetailRouteBody() {
  const { briefId } = useLocalSearchParams<{ briefId: string }>();
  return <HotspotDetailScreen briefId={briefId} />;
}
