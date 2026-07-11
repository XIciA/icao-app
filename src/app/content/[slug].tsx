import { useLocalSearchParams } from 'expo-router';

import { ContentLibraryScreen } from '@/features/content/ContentLibraryScreen';
import { MockExamScreen } from '@/features/content/MockExamScreen';
import { RadioPlayerScreen } from '@/features/content/RadioPlayerScreen';
import { VocabScreen } from '@/features/content/VocabScreen';

export default function ContentRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  if (slug === 'vocab') return <VocabScreen />;
  if (slug === 'radio') return <RadioPlayerScreen />;
  if (slug === 'mock-exam') return <MockExamScreen />;
  if (slug === 'ai-report') return <MockExamScreen reportOnly />;
  return <ContentLibraryScreen slug={slug} />;
}
