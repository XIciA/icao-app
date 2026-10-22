import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, AppText } from '@/components/ui';
import { GuideTourProvider } from '../GuideTourProvider';
import { useGuide } from '../GuideBindings';
const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
let mockAccount = 'account-a';
const mockRead = jest.fn();
const mockWrite = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => '/content/radio', useGlobalSearchParams: () => ({}) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount } }) }));
jest.mock('../guide-progress', () => ({ readGuideProgress: (...args: unknown[]) => mockRead(...args), writeGuideProgress: (...args: unknown[]) => mockWrite(...args) }));
jest.mock('../GuideRootSurface', () => ({ GuideRootSurface: () => null }));
let finishExit: (() => void) | undefined;
function Probe() { const guide = useGuide()!; return <><AppText>{guide.step ?? 'idle'}</AppText><Button onPress={() => { void guide.start('radio'); }}>start</Button><Button onPress={() => guide.event('radio-bank')}>select bank</Button><Button onPress={() => guide.event('radio-speed')}>wrong event</Button><Button onPress={() => guide.guardExit(done => { finishExit = done; })}>install guard</Button><Button onPress={() => { const element = guide.surface('root') as { props: { prompt: { exit: () => void } } }; element.props.prompt.exit(); }}>exit</Button></>; }
beforeEach(() => { mockAccount='account-a'; mockRead.mockResolvedValue(undefined); mockRouter.push.mockClear(); mockRouter.dismissTo.mockClear(); mockWrite.mockClear(); finishExit=undefined; });
it('advances only the active real action and waits for the existing save guard before exiting', async () => {
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await fireEvent.press(screen.getByText('start')); await waitFor(()=>expect(screen.getByText('radio-bank')).toBeTruthy());
  await fireEvent.press(screen.getByText('wrong event')); expect(screen.getByText('radio-bank')).toBeTruthy();
  await fireEvent.press(screen.getByText('select bank')); expect(screen.getByText('radio-order')).toBeTruthy();
  await fireEvent.press(screen.getByText('install guard')); await fireEvent.press(screen.getByText('exit'));
  expect(mockRouter.dismissTo).not.toHaveBeenCalled(); expect(screen.getByText('radio-order')).toBeTruthy();
  await act(async()=>finishExit?.()); expect(mockRouter.dismissTo).toHaveBeenCalledWith('/info/guide');
});
it('discards a resume operation if the account changes while metadata is loading', async () => {
  let resolve!: (value: unknown)=>void;mockRead.mockReturnValueOnce(new Promise(done=>{resolve=done}));
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);await fireEvent.press(screen.getByText('start'));
  mockAccount='account-b';await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await act(async()=>resolve({index:4,path:'/content/radio'}));expect(mockRouter.push).not.toHaveBeenCalled();expect(screen.getByText('idle')).toBeTruthy();
});
it('restores the paused radio step without resetting real player preferences', async () => {
  mockRead.mockResolvedValueOnce({index:3,path:'/content/radio'});
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);await fireEvent.press(screen.getByText('start'));
  await waitFor(()=>expect(screen.getByText('radio-interval')).toBeTruthy());expect(mockRead).toHaveBeenCalledWith('account-a','radio');expect(mockRouter.push).toHaveBeenCalledWith('/content/radio');
});

function ExportProbe() {
  const guide = useGuide()!;
  const element = guide.surface('root') as { props: { prompt: { target: string; completed?: boolean; skip: () => void } | null } };
  return <><Button onPress={() => { void guide.start('export'); }}>start export</Button>
    <Button onPress={() => guide.event('export-generate')}>generated</Button>
    <Button onPress={() => element.props.prompt?.skip()}>skip generation</Button>
    <AppText>{element.props.prompt?.target ?? 'idle'}</AppText>
    <AppText>{element.props.prompt?.completed ? 'completed' : 'active'}</AppText></>;
}
it('anchors export completion to the actual generated result', async () => {
  mockRead.mockResolvedValueOnce({index:3,path:'/question-bank/sentence/export'});
  const screen=await render(<GuideTourProvider><ExportProbe /></GuideTourProvider>);
  await fireEvent.press(screen.getByText('start export'));
  await waitFor(()=>expect(screen.getByText('export-generate')).toBeTruthy());
  await fireEvent.press(screen.getByText('generated'));
  expect(screen.getByText('export-result')).toBeTruthy();
  expect(screen.getByText('completed')).toBeTruthy();
});
it('exits export without claiming a generated result when generation is skipped', async () => {
  mockRead.mockResolvedValueOnce({index:3,path:'/question-bank/sentence/export'});
  const screen=await render(<GuideTourProvider><ExportProbe /></GuideTourProvider>);
  await fireEvent.press(screen.getByText('start export'));
  await waitFor(()=>expect(screen.getByText('export-generate')).toBeTruthy());
  await fireEvent.press(screen.getByText('skip generation'));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/info/guide');
  expect(screen.getByText('idle')).toBeTruthy();
  expect(screen.queryByText('completed')).toBeNull();
});
