import { useWindowDimensions } from 'react-native';

import { resolveWebContentWidth } from './web-layout';

export function useAppViewportDimensions() {
  const viewport = useWindowDimensions();
  return { ...viewport, width: resolveWebContentWidth(viewport.width) };
}
