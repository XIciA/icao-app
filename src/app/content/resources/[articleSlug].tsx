import { useLocalSearchParams } from 'expo-router';

import { EditorialArticleScreen } from '@/features/editorial/EditorialArticleScreen';

export default function EditorialArticleRoute() {
  const { articleSlug } = useLocalSearchParams<{ articleSlug?: string }>();
  return <EditorialArticleScreen slug={articleSlug ?? ''} />;
}
