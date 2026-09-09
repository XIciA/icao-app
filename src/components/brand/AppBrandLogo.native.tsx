import { Image, StyleSheet, View } from 'react-native';

export const APP_BRAND_LOGO_SOURCE = require('../../../assets/images/icon-native.png');

export const APP_BRAND_LOGO_SIZES = {
  sm: 54,
  md: 68,
  lg: 80,
} as const;

export type AppBrandLogoSize = keyof typeof APP_BRAND_LOGO_SIZES;

type Props = {
  accessibilityLabel?: string;
  decorative?: boolean;
  size?: AppBrandLogoSize;
  testID?: string;
};

/**
 * The only in-App renderer for the Native brand master.
 *
 * The layout surface owns positioning around this component. The component owns
 * square sizing, safe inset, contain scaling, and accessibility so callers cannot
 * crop the mark or substitute a plane glyph.
 */
export function AppBrandLogo({
  accessibilityLabel = '听你五个品牌标志',
  decorative = false,
  size = 'md',
  testID,
}: Props) {
  const dimension = APP_BRAND_LOGO_SIZES[size];
  const safeInset = Math.max(3, Math.round(dimension * 0.05));

  return (
    <View
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessible={!decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[styles.frame, { height: dimension, padding: safeInset, width: dimension }]}
      testID={testID}
    >
      <Image
        accessibilityElementsHidden
        accessible={false}
        resizeMode="contain"
        source={APP_BRAND_LOGO_SOURCE}
        style={styles.image}
        testID={testID ? `${testID}-image` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
