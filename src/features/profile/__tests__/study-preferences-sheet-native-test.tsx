import { act, fireEvent, render } from '@testing-library/react-native';
import { DEFAULT_PROFILE } from '@/features/account/profile-model';
import { updateProfile } from '@/features/account/profile-store.native';
import { StudyPreferencesSheet } from '../StudyPreferencesSheet.native';
jest.mock('@/features/account/profile-store.native', () => ({ updateProfile: jest.fn() }));
jest.mock('@/components/ui', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return { AppText: Text,
    BottomSheet: ({ visible, children, footer, onClose }: any) => visible ? <View>{children}{footer}<Pressable accessibilityLabel="关闭弹层" onPress={onClose} /></View> : null,
    Button: ({ children, onPress, disabled }: any) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}><Text>{children}</Text></Pressable>,
  };
});
beforeEach(() => { jest.clearAllMocks(); jest.mocked(updateProfile).mockResolvedValue(DEFAULT_PROFILE); });
it('keeps all three choices in one draft and saves only target and range atomically', async () => {
  const close = jest.fn();
  const screen = await render(<StudyPreferencesSheet visible accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'ICAO 5' }));
  await fireEvent.press(screen.getByRole('radio', { name: '复考' }));
  await fireEvent.press(screen.getByRole('radio', { name: '最全题库' }));
  expect(screen.getByText(/所有问题的大合集/)).toBeTruthy();
  expect(screen.getByText('适用于刷题时间足够、有一定语言基础的同学。')).toBeTruthy();
  expect(updateProfile).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('完成'));
  expect(updateProfile).toHaveBeenCalledWith({ target: 'icao5-recert', studyScope: 'all' });
  expect(close).toHaveBeenCalledTimes(1);
});
it('discards cancelled choices and opens with the latest profile', async () => {
  const close = jest.fn();
  const screen = await render(<StudyPreferencesSheet visible accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  await fireEvent.press(screen.getByRole('radio', { name: '最全题库' }));
  await fireEvent.press(screen.getByLabelText('取消备考设置'));
  expect(updateProfile).not.toHaveBeenCalled();
  await screen.rerender(<StudyPreferencesSheet visible={false} accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  await screen.rerender(<StudyPreferencesSheet visible accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  expect(screen.getByRole('radio', { name: '精选题库' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText(/包含主要常见题型/)).toBeTruthy();
});
it('retains the draft on save failure and lets the user retry', async () => {
  jest.mocked(updateProfile).mockRejectedValueOnce(new Error('offline'));
  const close = jest.fn();
  const screen = await render(<StudyPreferencesSheet visible accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  await fireEvent.press(screen.getByRole('radio', { name: '复考' }));
  await fireEvent.press(screen.getByText('完成'));
  expect(screen.getByRole('alert')).toBeTruthy(); expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: '复考' }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByText('完成'));
  expect(close).toHaveBeenCalledTimes(1);
});
it('does not close another account sheet when an old save finishes', async () => {
  let resolve!: (v: typeof DEFAULT_PROFILE) => void;
  jest.mocked(updateProfile).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const close = jest.fn();
  const screen = await render(<StudyPreferencesSheet visible accountId="a" profile={DEFAULT_PROFILE} onClose={close} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'ICAO 5' }));
  await fireEvent.press(screen.getByText('完成'));
  await screen.rerender(<StudyPreferencesSheet visible accountId="b" profile={DEFAULT_PROFILE} onClose={close} />);
  await act(async () => resolve(DEFAULT_PROFILE));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'ICAO 4' }).props.accessibilityState.checked).toBe(true);
});
