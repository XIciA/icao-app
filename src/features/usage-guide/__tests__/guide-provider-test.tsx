import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, AppText } from '@/components/ui';
import { GuideTourProvider } from '../GuideTourProvider';
import { useGuide, useGuideAvailability, type GuidePrompt } from '../GuideBindings';
import { emptyGuideProgress } from '../guide-progress';
const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
let mockCanAccess = true;
let mockAccount = 'account-a', mockCreatedAt: string | undefined, mockPath = '/content/radio';
const mockRead = jest.fn(), mockWrite = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount, createdAt: mockCreatedAt }, canAccessApp: mockCanAccess }) }));
jest.mock('../guide-progress', () => ({ ...jest.requireActual('../guide-progress'), readGuideProgress: (...args: unknown[]) => mockRead(...args), writeGuideProgress: (...args: unknown[]) => mockWrite(...args) }));
jest.mock('../GuideRootSurface', () => ({ GuideRootSurface: () => null }));
function Probe() {
  const guide = useGuide()!;
  const prompt = (guide.surface('root') as { props: { prompt: GuidePrompt | null } }).props.prompt;
  return <><AppText>{guide.step ?? 'idle'}</AppText><AppText>{guide.current ?? 'no-tour'}</AppText>
    <Button onPress={() => { void guide.start('radio'); }}>start</Button>
    <Button onPress={() => { void guide.start('study'); }}>study</Button>
    <Button onPress={() => guide.offer('study', ['study-highlight','study-lookup'])}>offer basic</Button>
    <Button onPress={() => guide.offer('study', ['study-highlight','study-lookup','study-record'])}>offer extended</Button>
    <Button onPress={() => guide.event('study-highlight')}>highlight</Button>
    <Button onPress={() => guide.event('study-lookup')}>lookup</Button>
    <Button onPress={() => guide.offer('study', ['study-finish'])}>offer finish</Button>
    <Button onPress={() => { guide.event('study-finish'); guide.offer('study', ['study-recap']); }}>finish saved</Button>
    <Button onPress={() => guide.event('study-recap')}>recap</Button>
    <Button onPress={() => guide.event('hotspot-topic')}>open hotspot</Button>
    <Button onPress={() => guide.event('radio-bank')}>select bank</Button>
    <Button onPress={() => guide.event('radio-speed')}>wrong event</Button>
    <Button onPress={() => prompt?.skip()}>skip</Button>
    <Button onPress={guide.pause}>pause</Button>
    <Button onPress={() => guide.suspend(true)}>transition</Button>
    <Button onPress={() => prompt?.next?.()}>next</Button>
    <AppText>{prompt ? 'visible' : 'hidden'}</AppText><AppText>{prompt?.text ?? 'no-copy'}</AppText>
    <Button onPress={() => guide.availability('test', 'radio', '音频不可用，请重试')}>unavailable</Button>
    <Button onPress={() => guide.availability('test', 'radio')}>available</Button>
    {['setup-profile', 'setup-level', 'setup-type', 'setup-save', 'setup-scope'].map(id => <Button key={id} onPress={() => guide.event(id)}>{`do ${id}`}</Button>)}</>;
}
beforeEach(() => { mockCanAccess=true; mockAccount='account-a'; mockCreatedAt=undefined; mockPath='/content/radio'; mockRead.mockReset().mockResolvedValue(emptyGuideProgress()); mockWrite.mockClear(); mockRouter.push.mockClear(); mockRouter.navigate.mockClear(); mockRouter.replace.mockClear(); });
it('does not auto-teach an old/unknown account, but manual teaching uses real events and exits in place', async () => {
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await act(async()=>{}); expect(screen.getByText('no-tour')).toBeTruthy();
  await fireEvent.press(screen.getByText('start')); expect(screen.getByText('radio-bank')).toBeTruthy();
  await fireEvent.press(screen.getByText('wrong event')); expect(screen.getByText('radio-bank')).toBeTruthy();
  await fireEvent.press(screen.getByText('select bank')); expect(screen.getByText('radio-order')).toBeTruthy();
  await fireEvent.press(screen.getByText('skip')); expect(screen.getByText('no-tour')).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockWrite).toHaveBeenLastCalledWith('account-a',expect.objectContaining({completed:['radio-bank'],skipped:['radio']}));
  await fireEvent.press(screen.getByText('start'));expect(screen.getByText('radio-bank')).toBeTruthy();
});
it('automatically starts the same flow for a newly registered account and never reopens a skipped module', async () => {
  mockCreatedAt='2026-10-23T00:00:00Z';
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(()=>expect(screen.getByText('radio-bank')).toBeTruthy());
  await fireEvent.press(screen.getByText('skip'));await act(async()=>{});
  expect(screen.getByText('no-tour')).toBeTruthy();
  expect(mockWrite).toHaveBeenLastCalledWith('account-a',expect.objectContaining({completed:[],skipped:['radio']}));
});
it('teaches shared capabilities once and adds only newly available capabilities from another bank', async () => {
  mockCreatedAt='2026-10-23T00:00:00Z';mockPath='/question-bank/listening/study/c/t';
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);await act(async()=>{});
  await fireEvent.press(screen.getByText('offer basic'));expect(screen.getByText('study-highlight')).toBeTruthy();
  await fireEvent.press(screen.getByText('highlight'));await fireEvent.press(screen.getByText('lookup'));
  await fireEvent.press(screen.getByText('pause'));await fireEvent.press(screen.getByText('offer extended'));
  expect(screen.getByText('study-record')).toBeTruthy();
});
it('manual study replays capabilities using the same engine without a fixed sample route', async () => {
  mockRead.mockResolvedValue({version:3,completed:['study-highlight'],skipped:['study']});
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);await act(async()=>{});
  await fireEvent.press(screen.getByText('study'));expect(mockRouter.navigate).toHaveBeenCalledWith('/(tabs)');
  await fireEvent.press(screen.getByText('offer basic'));expect(screen.getByText('study-highlight')).toBeTruthy();
});
it('ignores old-account reads and hides the previous account tour immediately', async () => {
  let resolve!: (value: unknown)=>void;mockRead.mockReturnValueOnce(new Promise(done=>{resolve=done}));
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  mockAccount='account-b';await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await act(async()=>resolve({version:3,completed:[],skipped:['radio']}));
  await fireEvent.press(screen.getByText('start'));expect(screen.getByText('radio-bank')).toBeTruthy();
  await fireEvent.press(screen.getByText('select bank'));expect(mockWrite).toHaveBeenLastCalledWith('account-b',expect.objectContaining({skipped:[]}));
});
it('hides teaching during navigation transitions', async () => {
  const screen=await render(<GuideTourProvider><Probe /></GuideTourProvider>);await act(async()=>{});
  await fireEvent.press(screen.getByText('start'));expect(screen.getByText('visible')).toBeTruthy();
  await fireEvent.press(screen.getByText('transition'));expect(screen.getByText('hidden')).toBeTruthy();
});

it('commits setup scope teaching only after navigation reaches the bank tab', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/profile';
  mockRead.mockResolvedValue({ version: 3, completed: ['setup-profile','setup-level','setup-type','setup-save'], skipped: [] });
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('setup-bank')).toBeTruthy());
  await fireEvent.press(screen.getByText('next'));
  expect(mockRouter.navigate).toHaveBeenCalledWith('/(tabs)');
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.getByText('hidden')).toBeTruthy();
  expect(screen.queryByText('setup-scope')).toBeNull();
  mockPath = '/';
  await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('setup-scope')).toBeTruthy());
  expect(screen.getByText('visible')).toBeTruthy();
  expect(mockWrite).toHaveBeenLastCalledWith('account-a', expect.objectContaining({ completed: ['setup-profile','setup-level','setup-type','setup-save','setup-bank'] }));
});

it('completes the study tour after saving and opening its recap', async () => {
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>); await act(async () => {});
  await fireEvent.press(screen.getByText('study'));
  await fireEvent.press(screen.getByText('offer finish'));
  expect(screen.getByText('study-finish')).toBeTruthy();
  await fireEvent.press(screen.getByText('finish saved'));
  expect(screen.getByText('study-recap')).toBeTruthy();
  await fireEvent.press(screen.getByText('recap'));
  expect(screen.getByText('no-tour')).toBeTruthy();
  expect(mockWrite).toHaveBeenLastCalledWith('account-a', expect.objectContaining({completed: ['study-finish', 'study-recap']}));
});
it('clears teaching immediately when account access is lost, even with a cached account', async () => {
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>); await act(async () => {});
  await fireEvent.press(screen.getByText('start'));
  mockCanAccess = false;
  await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  expect(screen.getByText('no-tour')).toBeTruthy(); expect(screen.getByText('hidden')).toBeTruthy();
  await fireEvent.press(screen.getByText('start'));
  expect(screen.getByText('no-tour')).toBeTruthy();
});
it('resumes unfinished setup on the page that owns its next field', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/';
  mockRead.mockResolvedValue({ version: 3, completed: ['setup-profile'], skipped: [] });
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('setup-level')).toBeTruthy());
  expect(mockRouter.navigate).toHaveBeenCalledWith('/account/profile');
});
it('does not redirect a newly logged-in user away from their requested question bank', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/question-bank/sentences900';
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>); await act(async () => {});
  expect(screen.getByText('no-tour')).toBeTruthy(); expect(mockRouter.navigate).not.toHaveBeenCalled();
});
it('reopens the topic selection before resuming hotspot detail teaching', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/content/hotspot';
  mockRead.mockResolvedValue({ version: 3, completed: ['hotspot-topic'], skipped: [] });
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('hotspot-topic')).toBeTruthy());
  await fireEvent.press(screen.getByText('open hotspot'));
  expect(screen.getByText('hotspot-article')).toBeTruthy();
});

it('leaves an unavailable step pending and resumes it when the real feature recovers', async () => {
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>); await act(async () => {});
  await fireEvent.press(screen.getByText('start'));
  await fireEvent.press(screen.getByText('unavailable'));
  expect(screen.getByText('音频不可用，请重试')).toBeTruthy();
  await fireEvent.press(screen.getByText('next'));
  expect(screen.getByText('radio-bank')).toBeTruthy(); expect(mockWrite).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('available'));
  expect(screen.queryByText('音频不可用，请重试')).toBeNull();
  await fireEvent.press(screen.getByText('select bank'));
  expect(screen.getByText('radio-order')).toBeTruthy();
});
it('does not restart completed setup when revisiting profile and bank tabs', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/profile';
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('setup-profile')).toBeTruthy());
  await fireEvent.press(screen.getByText('do setup-profile'));
  mockPath = '/account/profile'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  for (const id of ['setup-level','setup-type','setup-save']) await fireEvent.press(screen.getByText(`do ${id}`));
  await fireEvent.press(screen.getByText('next'));
  mockPath = '/'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await fireEvent.press(screen.getByText('do setup-scope'));
  expect(screen.getByText('no-tour')).toBeTruthy();
  for (const path of ['/profile','/account/profile','/profile','/']) {
    mockPath = path; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
    expect(screen.getByText('no-tour')).toBeTruthy();
  }
  expect(mockWrite).toHaveBeenLastCalledWith('account-a', expect.objectContaining({completed:['setup-profile','setup-level','setup-type','setup-save','setup-bank','setup-scope']}));
});

it('keeps interrupted teaching paused on the same page, then offers it on a fresh visit', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z';
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('radio-bank')).toBeTruthy());
  await fireEvent.press(screen.getByText('pause'));
  await act(async () => {}); expect(screen.getByText('no-tour')).toBeTruthy();
  mockPath = '/discover'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  mockPath = '/content/radio'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('radio-bank')).toBeTruthy());
});
it('removes detail teaching when returning to a hotspot list instead of leaving a stale target', async () => {
  mockCreatedAt = '2026-10-23T00:00:00Z'; mockPath = '/content/hotspot';
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await waitFor(() => expect(screen.getByText('hotspot-topic')).toBeTruthy());
  await fireEvent.press(screen.getByText('open hotspot'));
  mockPath = '/content/hotspot/example'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  expect(screen.getByText('hotspot-article')).toBeTruthy();
  mockPath = '/content/hotspot'; await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  expect(screen.getByText('no-tour')).toBeTruthy();
});

function PersistentUnavailableScreen({ message }: { message?: string }) {
  useGuideAvailability('radio', message);
  return <Probe />;
}
it('re-registers an unchanged availability message for a new account and clears it on recovery', async () => {
  const tree = (message?: string) => <GuideTourProvider><PersistentUnavailableScreen message={message} /></GuideTourProvider>;
  const screen = await render(tree('当前音频不可用'));
  await act(async () => {});
  await fireEvent.press(screen.getByText('start'));
  expect(screen.getByText('当前音频不可用')).toBeTruthy();
  mockAccount = 'account-b';
  await screen.rerender(tree('当前音频不可用'));
  await fireEvent.press(screen.getByText('start'));
  expect(screen.getByText('当前音频不可用')).toBeTruthy();
  await screen.rerender(tree());
  expect(screen.queryByText('当前音频不可用')).toBeNull();
  expect(screen.getByText('radio-bank')).toBeTruthy();
  expect(mockWrite).not.toHaveBeenCalled();
});
it('does not carry an old account availability registration into a new tour', async () => {
  const screen = await render(<GuideTourProvider><Probe /></GuideTourProvider>);
  await act(async () => {});
  await fireEvent.press(screen.getByText('start'));
  await fireEvent.press(screen.getByText('unavailable'));
  expect(screen.getByText('音频不可用，请重试')).toBeTruthy();
  mockAccount = 'account-b';
  await screen.rerender(<GuideTourProvider><Probe /></GuideTourProvider>);
  await fireEvent.press(screen.getByText('start'));
  expect(screen.queryByText('音频不可用，请重试')).toBeNull();
  expect(screen.getByText('radio-bank')).toBeTruthy();
});
