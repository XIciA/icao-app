import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { fireEvent, render } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { FloatingTabBar } from '../FloatingTabBar';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 47 }),
}));

const routes = [
  { key: 'index-key', name: 'index' },
  { key: 'discover-key', name: 'discover' },
  { key: 'profile-key', name: 'profile' },
];

function createProps({ defaultPrevented = false, index = 0 } = {}) {
  const emit = jest.fn((event: { type: string }) => ({
    defaultPrevented: event.type === 'tabPress' ? defaultPrevented : false,
  }));
  const navigate = jest.fn();
  const position = new Animated.Value(index);
  const interpolate = jest.spyOn(position, 'interpolate');

  const props = {
    descriptors: Object.fromEntries(routes.map((route) => [route.key, { options: {} }])),
    jumpTo: jest.fn(),
    layout: { height: 812, width: 375 },
    navigation: { emit, navigate },
    position,
    state: {
      history: [{ key: routes[index].key, type: 'route' }],
      index,
      key: 'main-tabs',
      preloadedRouteKeys: [],
      routeNames: routes.map((route) => route.name),
      routes,
      stale: false,
      type: 'tab',
    },
  } as unknown as MaterialTopTabBarProps;

  return { emit, interpolate, navigate, props };
}

describe('<FloatingTabBar />', () => {
  it('renders the three root tabs in route order and marks the committed route selected', async () => {
    const { interpolate, props } = createProps({ index: 1 });
    const screen = await render(<FloatingTabBar {...props} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['题库', '发现', '我的']);
    expect(screen.getByLabelText('题库').props.accessibilityState).toEqual({});
    expect(screen.getByLabelText('发现').props.accessibilityState).toEqual({ selected: true });
    expect(interpolate).toHaveBeenCalledTimes(3);
  });

  it('emits tabPress before navigating to a different page', async () => {
    const { emit, navigate, props } = createProps();
    const screen = await render(<FloatingTabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('发现'));

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: 'discover-key', type: 'tabPress' });
    expect(navigate).toHaveBeenCalledWith('discover', undefined);
  });

  it('honors a prevented tab press and preserves long-press events', async () => {
    const { emit, navigate, props } = createProps({ defaultPrevented: true });
    const screen = await render(<FloatingTabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('我的'));
    await fireEvent(screen.getByLabelText('我的'), 'longPress');

    expect(navigate).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({ target: 'profile-key', type: 'tabLongPress' });
  });
});
