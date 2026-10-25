import { Platform } from 'react-native';

import { isVercelLegacyWeb } from '@/config/web-runtime';
import { ResourceEditorialScreen } from '@/features/editorial/ResourceEditorialScreen';

import { CourseCatalogScreen as AppCourseCatalogScreen } from './courses/AppCourseCatalogScreen';
import { CourseCatalogScreen } from './courses/CourseCatalogScreen';
import { HotspotListScreen } from './hotspot/HotspotListScreen';

export function ContentLibraryScreen({ slug }: { slug: string }) {
  if (slug === 'courses') return isVercelLegacyWeb(Platform.OS) ? <CourseCatalogScreen /> : <AppCourseCatalogScreen />;
  if (slug === 'hotspot') return <HotspotListScreen />;
  if (slug === 'resources') return <ResourceEditorialScreen />;
  return null;
}
