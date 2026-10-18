import { render } from '@testing-library/react-native';
import { RadioMiniPlayer } from '../RadioMiniPlayer.native';
let mockPath = '/';
const mockStop = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useRouter: () => ({push: mockPush}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({bottom: 0}) }));
jest.mock('@/features/auth/AuthProvider', () => ({useAuth: () => ({session: {}, restoring: false})}));
jest.mock('../RadioPlayerProvider', () => ({useRadioPlayer: () => ({currentTrack: {title: 'Test track', bankTitle: '听力'}, sessionVisible: true, stopAndClear: mockStop, playing: false})}));
jest.mock('lucide-react-native', () => {
  const {View} = jest.requireActual('react-native');
  return new Proxy({}, {get: () => View});
});
it.each(['/', '/discover', '/profile', '/profile/'])('keeps a return control on the browse hub %s', async path => {
  mockPath = path;
  expect((await render(<RadioMiniPlayer />)).getByLabelText('返回随身听')).toBeTruthy();
});
it.each(['/content/mock-exam', '/content/vocab', '/content/hotspot/a/study', '/question-bank/listening/study/a/b', '/question-bank/sentences900', '/account/profile', '/info/feedback', '/auth/login', '/content/radio', '/new-feature'])('never overlays focused actions on %s', async path => {
  mockPath = path;
  expect((await render(<RadioMiniPlayer />)).queryByLabelText('返回随身听')).toBeNull();
});
