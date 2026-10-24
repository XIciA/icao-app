import { MemberFeatureGate } from '@/features/auth/MemberFeatureGate.native';
import { useLocalSearchParams } from 'expo-router';

import { EditorialArticleScreen } from '@/features/editorial/EditorialArticleScreen';

export default function EditorialArticleRoute() { return <MemberFeatureGate><EditorialArticleRouteBody /></MemberFeatureGate>; }

function EditorialArticleRouteBody() {
  const { articleSlug } = useLocalSearchParams<{ articleSlug?: string }>();
  return <EditorialArticleScreen slug={articleSlug ?? ''} />;
}
