import { act, render, waitFor } from '@testing-library/react-native';
import { DEFAULT_PROFILE, type UserProfile } from '@/features/account/profile-model';
import { InitialStudySetup } from '../InitialStudySetup.native';
let mockProfile: UserProfile = { ...DEFAULT_PROFILE };
let mockAccountId = 'account-a';
const mockSync = jest.fn();
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ canAccessApp: true, account: { accountId: mockAccountId } }) }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => mockProfile }));
jest.mock('@/features/sync/learning-sync.native', () => ({ runLearningSync: (...args: unknown[]) => mockSync(...args) }));
jest.mock('../StudyPreferencesSheet.native', () => ({ StudyPreferencesSheet: ({ visible }: { visible: boolean }) => {
  const { Text } = jest.requireActual('react-native'); return visible ? <Text>首次备考设置</Text> : null;
} }));
beforeEach(() => { mockProfile = { ...DEFAULT_PROFILE }; mockAccountId = 'account-a'; mockSync.mockReset().mockResolvedValue({ boundUserId: 'account-a' }); });
it('does not prompt legacy users or users who already completed setup', async () => {
  const screen = await render(<InitialStudySetup />);
  expect(screen.queryByText('首次备考设置')).toBeNull();
  mockProfile = { ...DEFAULT_PROFILE, studySetup: 'completed' };
  await screen.rerender(<InitialStudySetup />);
  expect(screen.queryByText('首次备考设置')).toBeNull(); expect(mockSync).not.toHaveBeenCalled();
});
it('shows only a pending new account after confirming its cloud state', async () => {
  mockProfile = { ...DEFAULT_PROFILE, studySetup: 'pending' };
  let complete!: (value: unknown) => void;
  mockSync.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const screen = await render(<InitialStudySetup />);
  expect(screen.queryByText('首次备考设置')).toBeNull();
  await act(() => complete({ boundUserId: 'account-a' }));
  await waitFor(() => expect(screen.getByText('首次备考设置')).toBeTruthy());
  mockProfile = { ...DEFAULT_PROFILE, studySetup: 'completed' };
  await screen.rerender(<InitialStudySetup />);
  expect(screen.queryByText('首次备考设置')).toBeNull();
});
it('does not show a stale pending prompt completed on another device', async () => {
  mockProfile = { ...DEFAULT_PROFILE, studySetup: 'pending' };
  mockSync.mockImplementationOnce(async () => { mockProfile = { ...DEFAULT_PROFILE, studySetup: 'completed' }; return { boundUserId: 'account-a' }; });
  const screen = await render(<InitialStudySetup />);
  expect(screen.queryByText('首次备考设置')).toBeNull();
});
it('discards account A confirmation after switching to account B', async () => {
  mockProfile = { ...DEFAULT_PROFILE, studySetup: 'pending' };
  let complete!: (value: unknown) => void;
  mockSync.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const screen = await render(<InitialStudySetup />);
  mockAccountId = 'account-b'; mockProfile = { ...DEFAULT_PROFILE };
  await screen.rerender(<InitialStudySetup />);
  await act(() => complete({ boundUserId: 'account-a' }));
  expect(screen.queryByText('首次备考设置')).toBeNull();
});
