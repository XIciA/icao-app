import { renderHook } from '@testing-library/react-native';

import { useAppViewportDimensions } from '../useAppViewportDimensions.web';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ fontScale: 1, height: 844, scale: 3, width: 390 }),
}));

describe('useAppViewportDimensions() on web', () => {
  it('returns the full mobile browser dimensions', async () => {
    const { result } = await renderHook(() => useAppViewportDimensions());

    expect(result.current).toMatchObject({ height: 844, width: 390 });
  });
});
