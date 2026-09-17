import { Redirect, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { AppDownloadScreen } from '@/features/content/AppDownloadScreen';
import { isVercelLegacyWeb } from '@/config/web-runtime';

import { ContentLibraryScreen } from '@/features/content/ContentLibraryScreen';
import { LearningReportScreen } from '@/features/content/LearningReportScreen';
import { MockExamScreen } from '@/features/content/MockExamScreen';
import { RadioPlayerScreen } from '@/features/content/RadioPlayerScreen';
import { VocabScreen } from '@/features/content/VocabScreen';
import { isContentAvailableOnPlatform } from '@/features/content/native-release-surface';

export default function ContentRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  if (!isContentAvailableOnPlatform(slug, Platform.OS)) return <Redirect href="/(tabs)/discover" />;
  if (slug === 'app-download') return isVercelLegacyWeb(Platform.OS) ? <AppDownloadScreen /> : <Redirect href="/(tabs)/discover" />;
  if (slug === 'vocab') return <VocabScreen />;
  if (slug === 'radio') return <RadioPlayerScreen />;
  if (slug === 'mock-exam') return <MockExamScreen />;
  if (slug === 'ai-report') return <LearningReportScreen />;
  return <ContentLibraryScreen slug={slug} />;
}
