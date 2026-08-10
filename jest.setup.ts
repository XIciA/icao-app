jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
jest.mock('@/components/ui/icons', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
