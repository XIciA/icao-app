import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import * as light from '../light-icons';
jest.mock('../lucide-icons', () => {
  const cache = new Map<string, () => null>();
  return new Proxy({}, { get: (_target, name: string) => {
    if (!cache.has(name)) cache.set(name, () => null);
    return cache.get(name);
  } });
});

const native = jest.requireActual<typeof import('../icons.native')>('../icons.native');
const legacy = jest.requireMock<typeof import('../lucide-icons')>('../lucide-icons');

it('selects E symbols on Native while preserving utility controls and legacy symbols', () => {
  expect(native.Headphones).toBe(light.Headphones);
  expect(native.RadioTower).toBe(light.RadioTower);
  expect(native.Headphones).not.toBe(legacy.Headphones);
  expect(native.Play).toBe(legacy.Play);
  expect(native.ChevronRight).toBe(legacy.ChevronRight);
  expect(native.Star).toBe(legacy.Star);
});

it('renders all E symbols at menu and navigation sizes with the caller color', async () => {
  const screen = await render(<View>{Object.entries(light).flatMap(([name, Icon]) =>
    [20, 24].map(size => <Icon key={`${name}-${size}`} testID={`light-${name}-${size}`} size={size} color="#5D636F" />),
  )}</View>);
  expect(screen.getAllByTestId(/^light-/, { includeHiddenElements: true })).toHaveLength(44);
});
