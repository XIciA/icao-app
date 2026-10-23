import { fireEvent, render } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';
import { ProfileIdentityCard } from '../ProfileIdentityCard.native';
import { DEFAULT_PROFILE } from '@/features/account/profile-model';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/features/account/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
jest.mock('@/features/usage-guide/GuideBindings', () => ({ GuideAnchor: () => null, GuideModalScope: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/navigation/useAppRouter', () => ({ useAppRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, fontScale: 1, scale: 3 })) }));
const mockCommerce = { phase: 'ready', entitlement: { serverTime: '2026-10-23T00:00:00Z', membership: { active: true, expiresAt: '2026-11-17T00:00:00Z' } } };
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => mockCommerce }));

afterEach(() => jest.clearAllMocks());

it.each([390, 1200])('keeps profile and VIP actions separate at width %s', async (width) => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 844, fontScale: 1, scale: 3 });
  const onOpen = jest.fn();
  const screen = await render(<ProfileIdentityCard profile={{ ...DEFAULT_PROFILE, target: 'icao5-first' }} accountLabel="已登录" onOpenProfile={onOpen} />);
  expect(screen.getByText('ICAO 5 · 初考')).toBeTruthy();
  expect(screen.getByText('VIP · 剩余 25 天')).toBeTruthy();
  expect(screen.queryByText('备考目标')).toBeNull();
  await fireEvent.press(screen.getByTestId('profile-card-open'));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('查看会员与购买')).toBeNull();
  const stopPropagation = jest.fn();
  await fireEvent.press(screen.getByLabelText('查看会员状态，剩余 25 天'), { stopPropagation });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('查看会员与购买')).toBeTruthy();
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('retains a full accessible name for long nicknames and supports a recertification goal', async () => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 320, height: 844, fontScale: 2, scale: 3 });
  const name = '正在准备航空英语考试的飞行学员';
  const screen = await render(<ProfileIdentityCard profile={{ ...DEFAULT_PROFILE, displayName: name, target: 'icao4-recert' }} accountLabel="已登录" onOpenProfile={jest.fn()} />);
  expect(screen.getByRole('button', { name: `查看个人资料，${name}，ICAO 4 · 复考，已登录` })).toBeTruthy();
  expect(screen.getByText('ICAO 4 · 复考')).toBeTruthy();
  expect(screen.getAllByText('VIP · 剩余 25 天')).toHaveLength(1);
});
