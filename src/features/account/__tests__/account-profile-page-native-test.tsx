jest.mock('@/features/profile/AiAllowanceCard.native', () => ({ AiAllowanceCard: () => null }));
jest.mock('lucide-react-native/icons/crown', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({ useCommerceRuntime: () => ({phase:'ready', entitlement: {serverTime:'2026-10-22T00:00:00Z',membership:{active:true,expiresAt:'2026-11-14T00:00:00Z'}}}) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
import { act, fireEvent, render } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { prepareProfileAvatar } from '../../../../modules/icao-profile-avatar/src';
import { AccountProfilePage } from '../AccountProfilePage.native';
import { updateProfile } from '../profile-store.native';

let mockFocused = true;
let mockAccountId = 'account-a';
let mockProfile = { displayName: '飞行学员', target: 'icao4-first', avatarUri: undefined as string | undefined };
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: mockBack, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    const isFocused = mockFocused;
    React.useEffect(() => isFocused ? callback() : undefined, [callback, isFocused]);
  },
}));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('../../../../modules/icao-profile-avatar/src', () => ({ prepareProfileAvatar: jest.fn() }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccountId } }) }));
jest.mock('../profile-store.native', () => ({ useProfile: () => mockProfile, updateProfile: jest.fn() }));
jest.mock('@/components/navigation/TopBar', () => ({ TopBar: () => null }));
jest.mock('../ProfileAvatar', () => ({ ProfileAvatar: ({ uri }: { uri?: string }) => {
  const { Text } = jest.requireActual('react-native');
  return <Text testID="avatar">{uri ?? 'default-avatar'}</Text>;
} }));
jest.mock('@/components/ui', () => {
  const { View, Text, TextInput, Pressable } = jest.requireActual('react-native');
  return {
    BottomSheet: ({visible,children}: {visible:boolean;children:React.ReactNode}) => visible ? <View>{children}</View> : null,
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    AppText: Text,
    TextField: ({ label, ...props }: { label: string }) => <TextInput accessibilityLabel={label} {...props} />,
    Button: ({ children, disabled, onPress }: { children: React.ReactNode; disabled?: boolean; onPress: () => void }) => <Pressable disabled={disabled} onPress={onPress}><Text>{children}</Text></Pressable>,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const chosen = { canceled: false, assets: [{ uri: 'file:///camera/photo.png' }] } as ImagePicker.ImagePickerResult;
const jpeg = 'data:image/jpeg;base64,/9j/AA==';
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true; mockAccountId = 'account-a';
  mockProfile = { displayName: '飞行学员', target: 'icao4-first', avatarUri: undefined };
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.MediaLibraryPermissionResponse);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(chosen);
  jest.mocked(prepareProfileAvatar).mockResolvedValue(jpeg);
  jest.mocked(updateProfile).mockResolvedValue(mockProfile as Awaited<ReturnType<typeof updateProfile>>);
});

it('prepares the selected full-size image without loading its base64 into JS, then uses existing profile saving', async () => {
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('头像'));
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: false, quality: 1 }));
  expect(prepareProfileAvatar).toHaveBeenCalledWith('file:///camera/photo.png');
  expect(screen.getByTestId('avatar').props.children).toBe(jpeg);
  await fireEvent.press(screen.getByText('保存修改'));
  expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarUri: jpeg }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('ignores a late picker result after leaving the page and allows another selection when returning', async () => {
  const selection = deferred<ImagePicker.ImagePickerResult>();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValueOnce(selection.promise);
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('头像'));
  mockFocused = false; await screen.rerender(<AccountProfilePage />);
  await act(async () => { selection.resolve(chosen); });
  expect(prepareProfileAvatar).not.toHaveBeenCalled();
  expect(screen.getByTestId('avatar').props.children).toBe('default-avatar');
  mockFocused = true; await screen.rerender(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('头像'));
  expect(screen.getByTestId('avatar').props.children).toBe(jpeg);
});

it('does not put account A photo preparation into account B draft', async () => {
  const prepared = deferred<string>();
  jest.mocked(prepareProfileAvatar).mockReturnValueOnce(prepared.promise);
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('头像'));
  mockAccountId = 'account-b'; mockProfile = { displayName: '学员 B', target: 'icao4-first', avatarUri: undefined };
  await screen.rerender(<AccountProfilePage />);
  await act(async () => { prepared.resolve(jpeg); });
  expect(screen.getByTestId('avatar').props.children).toBe('default-avatar');
  expect(screen.getByText('学员 B')).toBeTruthy();
  expect(updateProfile).not.toHaveBeenCalled();
});

it.each(['blur', 'account', 'unmount'])('does not navigate when saving completes after %s', async (leave) => {
  const saved = deferred<Awaited<ReturnType<typeof updateProfile>>>();
  jest.mocked(updateProfile).mockReturnValueOnce(saved.promise);
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('昵称'));
  await fireEvent.changeText(screen.getByLabelText('编辑昵称'), '新昵称');
  await fireEvent.press(screen.getByText('完成'));
  await fireEvent.press(screen.getByText('保存修改'));
  if (leave === 'unmount') await screen.unmount();
  else {
    if (leave === 'blur') mockFocused = false; else mockAccountId = 'account-b';
    await screen.rerender(<AccountProfilePage />);
  }
  await act(async () => { saved.resolve(mockProfile as Awaited<ReturnType<typeof updateProfile>>); });
  expect(mockBack).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
});

it.each([
  {level: 'ICAO 4', type: '复考', target: 'icao4-recert'},
  {level: 'ICAO 5', type: '初考', target: 'icao5-first'},
  {level: 'ICAO 5', type: '复考', target: 'icao5-recert'},
])('saves the existing target identity $target from the two selectors', async ({level, type, target}) => {
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('目标等级'));
  await fireEvent.press(screen.getByRole('radio', {name:level}));
  await fireEvent.press(screen.getByLabelText('考试类型'));
  await fireEvent.press(screen.getByRole('radio', {name:type}));
  await fireEvent.press(screen.getByText('保存修改'));
  expect(updateProfile).toHaveBeenCalledWith({target});
});

it('does not save a stale goal when cloud profile arrives during nickname editing', async () => {
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('昵称'));
  await fireEvent.changeText(screen.getByLabelText('编辑昵称'), '新的昵称');
  await fireEvent.press(screen.getByText('完成'));
  mockProfile = { ...mockProfile, target: 'icao5-first' };
  await screen.rerender(<AccountProfilePage />);
  await fireEvent.press(screen.getByText('保存修改'));
  expect(updateProfile).not.toHaveBeenCalledWith(expect.objectContaining({ target: 'icao4-first' }));
});

it('refreshes untouched fields while retaining the edited nickname', async () => {
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('昵称'));
  await fireEvent.changeText(screen.getByLabelText('编辑昵称'), '新的昵称');
  await fireEvent.press(screen.getByText('完成'));
  mockProfile = { displayName: '云端昵称', target: 'icao5-first', avatarUri: jpeg };
  await screen.rerender(<AccountProfilePage />);
  expect(screen.getByText('新的昵称')).toBeTruthy();
  expect(screen.getByText('ICAO 5')).toBeTruthy();
  expect(screen.getByTestId('avatar').props.children).toBe(jpeg);
  await fireEvent.press(screen.getByText('保存修改'));
  expect(updateProfile).toHaveBeenCalledWith({ displayName: '新的昵称' });
});

it('saves only the chosen goal when unrelated cloud fields change', async () => {
  const screen = await render(<AccountProfilePage />);
  await fireEvent.press(screen.getByLabelText('目标等级'));
  await fireEvent.press(screen.getByRole('radio', {name:'ICAO 5'}));
  mockProfile = { displayName: '云端昵称', target: 'icao4-first', avatarUri: jpeg };
  await screen.rerender(<AccountProfilePage />);
  expect(screen.getByText('云端昵称')).toBeTruthy();
  await fireEvent.press(screen.getByText('保存修改'));
  expect(updateProfile).toHaveBeenCalledWith({ target: 'icao5-first' });
});
