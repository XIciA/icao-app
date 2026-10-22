import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, AppText } from '@/components/ui';
import { GuideTourProvider } from '../GuideTourProvider';
import { useGuide, type GuidePrompt } from '../GuideBindings';
import { emptyGuideProgress } from '../guide-progress';
const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockAccount = 'account-a', mockCreatedAt: string | undefined, mockPath = '/content/radio';
const mockRead = jest.fn(), mockWrite = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount, createdAt: mockCreatedAt }, canAccessApp: true }) }));
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
    <Button onPress={() => guide.event('radio-bank')}>select bank</Button>
    <Button onPress={() => guide.event('radio-speed')}>wrong event</Button>
    <Button onPress={() => prompt?.skip()}>skip</Button>
    <Button onPress={guide.pause}>pause</Button>
    <Button onPress={() => guide.suspend(true)}>transition</Button>
    <AppText>{prompt ? 'visible' : 'hidden'}</AppText></>;
}
beforeEach(() => { mockAccount='account-a'; mockCreatedAt=undefined; mockPath='/content/radio'; mockRead.mockReset().mockResolvedValue(emptyGuideProgress()); mockWrite.mockClear(); mockRouter.push.mockClear(); mockRouter.replace.mockClear(); });
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
  await fireEvent.press(screen.getByText('study'));expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)');
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
