import { useLocalSearchParams } from 'expo-router';

import { HotspotStudyScreen } from '@/features/content/hotspot/HotspotStudyScreen';

export default function HotspotStudyRoute() {
  const { briefId } = useLocalSearchParams<{ briefId: string }>();
  return <HotspotStudyScreen briefId={briefId} />;
}
