import { Platform } from 'react-native';

import { isVercelLegacyWeb } from '@/config/web-runtime';
import { ResourceEditorialScreen } from '@/features/editorial/ResourceEditorialScreen';

import { ConnectedCourseCatalogScreen } from './courses/ConnectedCourseCatalogScreen';
import { CourseCatalogScreen } from './courses/CourseCatalogScreen';
import { HotspotListScreen } from './hotspot/HotspotListScreen';

export function ContentLibraryScreen({ slug }: { slug: string }) {
  if (slug === 'courses') return isVercelLegacyWeb(Platform.OS) ? <CourseCatalogScreen /> : <ConnectedCourseCatalogScreen />;
  if (slug === 'hotspot') return <HotspotListScreen />;
  if (slug === 'resources') return <ResourceEditorialScreen />;
  return null;
}
