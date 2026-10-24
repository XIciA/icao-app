import { MemberFeatureGate } from '@/features/auth/MemberFeatureGate.native';
import { useLocalSearchParams } from 'expo-router';

import { HotspotDetailScreen } from '@/features/content/hotspot/HotspotDetailScreen';

export default function HotspotDetailRoute() { return <MemberFeatureGate><HotspotDetailRouteBody /></MemberFeatureGate>; }

function HotspotDetailRouteBody() {
  const { briefId } = useLocalSearchParams<{ briefId: string }>();
  return <HotspotDetailScreen briefId={briefId} />;
}
