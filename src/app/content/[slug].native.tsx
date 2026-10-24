import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { FileQuestion } from '@/components/ui/icons';
import { Platform } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { Screen } from '@/components/ui';
import { ContentLibraryScreen } from '@/features/content/ContentLibraryScreen';
import { LearningReportScreen } from '@/features/content/LearningReportScreen';
import { MockExamScreen } from '@/features/content/MockExamScreen';
import { RadioPlayerScreen } from '@/features/content/RadioPlayerScreen';
import { VocabScreen } from '@/features/content/VocabScreen';
import {
  isContentAvailableOnPlatform,
} from '@/features/content/native-release-surface';

const KNOWN_CONTENT_SLUGS = new Set([
  'ai-report',
  'courses',
  'hotspot',
  'mock-exam',
  'radio',
  'resources',
  'vocab',
]);

export default function ContentRoute() {
  const router = useRouter();
  const { slug: rawSlug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(rawSlug) ? rawSlug[0] ?? '' : rawSlug ?? '';
  if (!KNOWN_CONTENT_SLUGS.has(slug)) {
    return (
      <Screen header={<TopBar title="发现" />}>
        <CenteredState
          actionLabel="返回发现"
          description="这个功能入口不存在、已更新或暂时不可用。"
          icon={FileQuestion}
          onAction={() => router.dismissTo('/(tabs)/discover')}
          title="无法打开此内容"
        />
      </Screen>
    );
  }
  if (!isContentAvailableOnPlatform(slug, Platform.OS)) return <Redirect href="/(tabs)/discover" />;
  if (slug === 'vocab') return <VocabScreen />;
  if (slug === 'radio') return <RadioPlayerScreen />;
  if (slug === 'mock-exam') return <MockExamScreen />;
  if (slug === 'ai-report') return <LearningReportScreen />;
  return <ContentLibraryScreen slug={slug} />;
}
