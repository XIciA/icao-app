import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
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
  isKnownContentSlug,
} from '@/features/content/native-release-surface';

export default function ContentRoute() {
  const router = useRouter();
  const { slug: rawSlug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(rawSlug) ? rawSlug[0] ?? '' : rawSlug ?? '';
  if (!isKnownContentSlug(slug)) {
    return (
      <Screen>
        <TopBar title="发现" />
        <CenteredState
          actionLabel="返回发现"
          description="这个功能入口不存在、已更新或暂时不可用。"
          icon={FileQuestion}
          onAction={() => router.replace('/(tabs)/discover')}
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
