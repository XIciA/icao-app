import { Link, type Href } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, spacing } from '@/theme';

// Temporarily hide the header shortcut; the /download page remains available.
const SHOW_HEADER_DOWNLOAD_LINK = false;

export function WebAppDownloadLink() {
  if (!SHOW_HEADER_DOWNLOAD_LINK || Platform.OS !== 'web' || !isEdgeOneProductionWeb()) return null;

  return (
    <Link accessibilityLabel="下载 APP" href={'/download' as Href} style={styles.link}>
      <AppText color={colors.primary} variant="button">下载 APP</AppText>
    </Link>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2.5],
  },
});
