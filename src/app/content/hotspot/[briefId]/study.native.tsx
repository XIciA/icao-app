import { MemberFeatureGate } from '@/features/auth/MemberFeatureGate.native';
import { useLocalSearchParams } from 'expo-router';

import { HotspotStudyScreen } from '@/features/content/hotspot/HotspotStudyScreen';

export default function HotspotStudyRoute() { return <MemberFeatureGate><HotspotStudyRouteBody /></MemberFeatureGate>; }

function HotspotStudyRouteBody() {
  const { briefId } = useLocalSearchParams<{ briefId: string }>();
  return <HotspotStudyScreen briefId={briefId} />;
}
