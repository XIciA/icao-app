import { render } from '@testing-library/react-native';
import { PanResponder, type PanResponderCallbacks, type PanResponderGestureState } from 'react-native';
import { EdgeBackRegion } from '../EdgeBackRegion.native';

it('dispatches only a completed left-edge right drag through the screen navigation', async () => {
  let handlers: PanResponderCallbacks = {};
  const original = PanResponder.create;
  const spy = jest.spyOn(PanResponder, 'create').mockImplementation(config => { handlers = config; return original(config); });
  const navigation = { canGoBack: () => true, goBack: jest.fn() };
  await render(<EdgeBackRegion enabled navigation={navigation}>{null}</EdgeBackRegion>);
  const event = { nativeEvent: { pageX: 8 } } as never;
  handlers.onStartShouldSetPanResponderCapture?.(event, {} as PanResponderGestureState);
  const gesture = (patch = {}) => ({ x0: 8, dx: 100, dy: 2, numberActiveTouches: 1, ...patch } as PanResponderGestureState);
  expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture())).toBe(true);
  for (const patch of [{ dx: -100 }, { dy: 100 }, { numberActiveTouches: 2 }]) {
    expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(patch))).toBe(false);
  }
  handlers.onStartShouldSetPanResponderCapture?.({ nativeEvent: { pageX: 160 } } as never, gesture());
  expect(handlers.onMoveShouldSetPanResponderCapture?.(event, gesture({ x0: 0 }))).toBe(false);
  handlers.onStartShouldSetPanResponderCapture?.(event, gesture());
  handlers.onPanResponderRelease?.(event, gesture({ dx: 30 }));
  handlers.onPanResponderTerminate?.(event, gesture());
  expect(navigation.goBack).not.toHaveBeenCalled();
  handlers.onPanResponderRelease?.(event, gesture());
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
