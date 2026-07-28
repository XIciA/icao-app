import { ResourceEditorialScreen } from '@/features/editorial/ResourceEditorialScreen';

import { CourseCatalogScreen } from './courses/CourseCatalogScreen';
import { HotspotListScreen } from './hotspot/HotspotListScreen';

export function ContentLibraryScreen({ slug }: { slug: string }) {
  if (slug === 'courses') return <CourseCatalogScreen />;
  if (slug === 'hotspot') return <HotspotListScreen />;
  if (slug === 'resources') return <ResourceEditorialScreen />;
  return null;
}
