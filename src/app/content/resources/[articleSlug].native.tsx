import { useLocalSearchParams } from 'expo-router';

import { EditorialArticleScreen } from '@/features/editorial/EditorialArticleScreen';

export default function EditorialArticleRoute() { return <EditorialArticleRouteBody />; }

function EditorialArticleRouteBody() {
  const { articleSlug } = useLocalSearchParams<{ articleSlug?: string }>();
  return <EditorialArticleScreen slug={articleSlug ?? ''} />;
}
