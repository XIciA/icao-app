jest.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ isConnected: true }), addNetworkStateListener: () => ({ remove() {} }) }));
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyVocabularyEdits } from '@icao/contracts/vocabulary-edit';
import { canonicalVocabularyJson } from '@icao/contracts/vocabulary-live';
import { releaseFixture } from '../test-support/live-fixture';
import { VocabularyScreen } from '../VocabularyScreen.native';
import { liveVocabularyCacheKey } from '../live-catalog';
import { VOCABULARY_STORAGE_KEY } from '../persistence';
import { resetVocabularyMutationQueueForTests } from '../progress-store.native';
const {createHash}=jest.requireActual('node:crypto');
let mockBase='https://study-0.invalid',mockNumber=0;
const mockValues=new Map<string,string>();
let mockResolve:(value:Response)=>void;
let mockPause=false,mockResume:(()=>void)|undefined;
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_type:string,text:string)=>jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex')}));
jest.mock('@/platform/api-client',()=>({getApiBaseUrl:()=>mockBase,apiFetch:()=>new Promise<Response>(resolve=>{mockResolve=resolve;})}));
jest.mock('@/platform/storage',()=>({__esModule:true,default:{getItem:async(key:string)=>mockValues.get(key)??null,setItem:async(key:string,value:string)=>{mockValues.set(key,value);}}}));
jest.mock('@/features/sync/learning-sync.native',()=>({captureLearningWriteContext:()=>({}),assertLearningWriteContext:()=>{},mutateVocabularyInCurrentWorkspace:async(_context:unknown,update:()=>Promise<unknown>)=>{if(mockPause){mockPause=false;await new Promise<void>(resolve=>{mockResume=resolve;});}return update();}}));
jest.mock('@/features/usage-guide/GuideBindings',()=>({useGuide:()=>undefined,useGuideConfirmation:()=>{},useGuideAvailability:()=>{},GuideAnchor:()=>null}));
jest.mock('@/components/navigation/useLocalBack',()=>({useLocalBack:(_active:boolean,back:()=>void)=>back}));
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn(),canGoBack:()=>true,replace:jest.fn()})}));
jest.mock('../speech',()=>({speakVocabulary:async()=>true,speakVocabularyWithFeedback:async()=>true,stopVocabularySpeech:async()=>{}}));
jest.mock('lucide-react-native',()=>{const {View}=jest.requireActual('react-native');return new Proxy({}, {get:()=>View});});
const response=(data:unknown)=>({ok:true,status:200,json:async()=>({data})}) as Response;
function initial(){const release=releaseFixture();release.dataset.books[0]!.words.forEach((word,index)=>{word.frequency={...word.frequency!,occurrences:30-index,cardCount:1,byBank:{opi:30-index}};});const {checksum:_old,...content}=release;void _old;return {...content,checksum:createHash('sha256').update(canonicalVocabularyJson(content)).digest('hex')};}
const saved=()=>JSON.parse(mockValues.get(VOCABULARY_STORAGE_KEY)!);
async function open(){const screen=await render(<SafeAreaProvider initialMetrics={{frame:{height:812,width:390,x:0,y:0},insets:{top:47,bottom:34,left:0,right:0}}}><VocabularyScreen/></SafeAreaProvider>);await waitFor(()=>expect(screen.getByLabelText('选择ICAO考前预习')).toBeTruthy());await fireEvent.press(screen.getByLabelText('选择ICAO考前预习'));await fireEvent.press(screen.getByText('开始学习'));return screen;}
beforeEach(()=>{mockBase=`https://study-${++mockNumber}.invalid`;mockValues.clear();mockPause=false;mockResume=undefined;resetVocabularyMutationQueueForTests();mockValues.set(liveVocabularyCacheKey(mockBase),JSON.stringify(initial()));});
it.each(['delete','merge'] as const)('reconciles an active native study when its current word is %s and never writes the retired ID back',async kind=>{
  const release=initial(),[a,b,c]=release.dataset.books[0]!.words;
  let screen=await open();await waitFor(()=>expect(screen.getByText(a!.word)).toBeTruthy());await fireEvent.press(screen.getByText('认识'));await waitFor(()=>expect(screen.getByText('下一词')).toBeTruthy());await fireEvent.press(screen.getByText('下一词'));await waitFor(()=>expect(screen.getByText(b!.word)).toBeTruthy());
  const next=applyVocabularyEdits(release,kind==='delete'?[{type:'delete',id:b!.id}]:[{type:'merge',sourceIds:[b!.id],targetId:c!.id}]);const published={...next,checksum:createHash('sha256').update(canonicalVocabularyJson(next)).digest('hex')};
  await act(async()=>mockResolve(response(published)));
  await waitFor(()=>expect(screen.getByText(c!.word)).toBeTruthy());expect(screen.queryByText(b!.word)).toBeNull();expect(screen.queryByText(/题库.*丢失/)).toBeNull();
  await waitFor(()=>expect(saved().studySession.nextWordId).toBe(c!.id));expect(saved().studySession.wordIds).not.toContain(b!.id);
  await screen.unmount();screen=await open();await waitFor(()=>expect(screen.getByText(c!.word)).toBeTruthy());expect(screen.queryByText(b!.word)).toBeNull();
  await fireEvent.press(screen.getByText('认识'));await waitFor(()=>expect(screen.getByText('完成本轮')).toBeTruthy());expect(saved().words[b!.id]).toBeUndefined();expect(saved().words[c!.id].status).toBe('known');
  await fireEvent.press(screen.getByText('完成本轮'));await waitFor(()=>expect(saved().studySession.nextWordId).toBeNull());
});
it('does not ask for a merged target again after the source was already rated in this session',async()=>{
  const release=initial(),[a,b,c]=release.dataset.books[0]!.words;
  const screen=await open();await waitFor(()=>expect(screen.getByText(a!.word)).toBeTruthy());await fireEvent.press(screen.getByText('认识'));await fireEvent.press(screen.getByText('下一词'));await waitFor(()=>expect(screen.getByText(b!.word)).toBeTruthy());await fireEvent.press(screen.getByText('认识'));
  const next=applyVocabularyEdits(release,[{type:'merge',sourceIds:[b!.id],targetId:c!.id}]);await act(async()=>mockResolve(response({...next,checksum:createHash('sha256').update(canonicalVocabularyJson(next)).digest('hex')})));
  await waitFor(()=>expect(screen.getByText('本轮完成')).toBeTruthy());expect(screen.queryByRole('button',{name:'认识'})).toBeNull();expect(saved().studySession.answers[c!.id]).toBe('known');expect(saved().studySession.nextWordId).toBeNull();
});

it.each(['delete','merge'] as const)('fences an old rating callback when a %s arrives while that rating is still saving',async kind=>{
  const release=initial(),[a,b,c]=release.dataset.books[0]!.words;
  const screen=await open();await waitFor(()=>expect(screen.getByText(a!.word)).toBeTruthy());await fireEvent.press(screen.getByText('认识'));await fireEvent.press(screen.getByText('下一词'));await waitFor(()=>expect(screen.getByText(b!.word)).toBeTruthy());
  mockPause=true;await fireEvent.press(screen.getByText('认识'));await waitFor(()=>expect(mockResume).toBeDefined());
  const next=applyVocabularyEdits(release,kind==='delete'?[{type:'delete',id:b!.id}]:[{type:'merge',sourceIds:[b!.id],targetId:c!.id}]);
  await act(async()=>mockResolve(response({...next,checksum:createHash('sha256').update(canonicalVocabularyJson(next)).digest('hex')})));
  await act(async()=>mockResume!());
  if(kind==='delete'){await waitFor(()=>expect(screen.getByText(c!.word)).toBeTruthy());expect(screen.getByText('认识')).toBeTruthy();expect(saved().studySession.answers[c!.id]).toBeUndefined();}
  else {await waitFor(()=>expect(screen.getByText('本轮完成')).toBeTruthy());expect(saved().studySession.answers[c!.id]).toBe('known');expect(saved().studySession.nextWordId).toBeNull();}
  expect(saved().words[b!.id]).toBeUndefined();expect(saved().studySession.wordIds).not.toContain(b!.id);
});

it.each(['delete','merge'] as const)('keeps the next identity safe if a %s arrives while advancing the queue',async kind=>{
  const release=initial(),[a,b,c]=release.dataset.books[0]!.words;
  const screen=await open();await waitFor(()=>expect(screen.getByText(a!.word)).toBeTruthy());await fireEvent.press(screen.getByText('认识'));
  mockPause=true;await fireEvent.press(screen.getByText('下一词'));await waitFor(()=>expect(mockResume).toBeDefined());
  const next=applyVocabularyEdits(release,kind==='delete'?[{type:'delete',id:b!.id}]:[{type:'merge',sourceIds:[b!.id],targetId:c!.id}]);
  await act(async()=>mockResolve(response({...next,checksum:createHash('sha256').update(canonicalVocabularyJson(next)).digest('hex')})));
  await act(async()=>mockResume!());await waitFor(()=>expect(screen.getByText(c!.word)).toBeTruthy());
  expect(screen.getByRole('button',{name:'认识'})).toBeTruthy();expect(saved().studySession.nextWordId).toBe(c!.id);expect(saved().studySession.wordIds).not.toContain(b!.id);
});
