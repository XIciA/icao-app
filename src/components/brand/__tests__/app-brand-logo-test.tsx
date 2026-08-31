import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  APP_BRAND_LOGO_SIZES,
  APP_BRAND_LOGO_SOURCE,
  AppBrandLogo,
  type AppBrandLogoSize,
} from '../AppBrandLogo';

describe('<AppBrandLogo />', () => {
  it.each(Object.keys(APP_BRAND_LOGO_SIZES) as AppBrandLogoSize[])(
    'keeps the %s variant square, inset, and uncropped',
    async (size) => {
      const screen = await render(<AppBrandLogo size={size} testID="brand-logo" />);
      const frame = screen.getByTestId('brand-logo');
      const image = screen.getByTestId('brand-logo-image', { includeHiddenElements: true });
      const frameStyle = StyleSheet.flatten(frame.props.style);
      const imageStyle = StyleSheet.flatten(image.props.style);

      expect(frameStyle.width).toBe(APP_BRAND_LOGO_SIZES[size]);
      expect(frameStyle.height).toBe(APP_BRAND_LOGO_SIZES[size]);
      expect(frameStyle.padding).toBeGreaterThan(0);
      expect(frameStyle.overflow).not.toBe('hidden');
      expect(imageStyle.width).toBe('100%');
      expect(imageStyle.height).toBe('100%');
      expect(image.props.resizeMode).toBe('contain');
      expect(image.props.source).toBe(APP_BRAND_LOGO_SOURCE);
    },
  );

  it('announces the brand once by default', async () => {
    const screen = await render(<AppBrandLogo testID="brand-logo" />);
    const frame = screen.getByTestId('brand-logo');
    const image = screen.getByTestId('brand-logo-image', { includeHiddenElements: true });

    expect(frame.props.accessible).toBe(true);
    expect(frame.props.accessibilityRole).toBe('image');
    expect(frame.props.accessibilityLabel).toBe('听你五个品牌标志');
    expect(image.props.accessible).toBe(false);
  });

  it('can be hidden when surrounding copy already names the brand', async () => {
    const screen = await render(<AppBrandLogo decorative testID="brand-logo" />);
    const frame = screen.getByTestId('brand-logo', { includeHiddenElements: true });

    expect(frame.props.accessible).toBe(false);
    expect(frame.props.accessibilityLabel).toBeUndefined();
    expect(frame.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
