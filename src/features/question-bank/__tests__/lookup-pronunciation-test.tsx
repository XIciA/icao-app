import { act, fireEvent, render } from '@testing-library/react-native';
import { LookupPronunciation } from '../components/LookupPronunciation';
import { speakVocabulary, stopVocabularySpeech } from '@/features/vocabulary/speech.native';
jest.mock('@/features/vocabulary/speech.native',()=>({speakVocabulary:jest.fn(),stopVocabularySpeech:jest.fn(async()=>undefined)}));
jest.mock('lucide-react-native',()=>({Volume2:()=>null}));
beforeEach(()=>{jest.clearAllMocks();jest.mocked(speakVocabulary).mockResolvedValue(true);});
it('plays on demand through the shared fixed-file pronunciation player',async()=>{const screen=await render(<LookupPronunciation word="runway"/>);expect(speakVocabulary).not.toHaveBeenCalled();await fireEvent.press(screen.getByLabelText('播放runway发音'));expect(speakVocabulary).toHaveBeenCalledWith('runway');});
it('cancels the shared playback when a lookup closes with resolution still pending',async()=>{let finish!:(value:boolean)=>void;jest.mocked(speakVocabulary).mockReturnValue(new Promise(r=>{finish=r;}));const screen=await render(<LookupPronunciation word="runway"/>);await fireEvent.press(screen.getByLabelText('播放runway发音'));await screen.unmount();expect(stopVocabularySpeech).toHaveBeenCalled();await act(()=>finish(false));});
it('shows a recoverable error when the shared player cannot play',async()=>{jest.mocked(speakVocabulary).mockResolvedValue(false);const screen=await render(<LookupPronunciation word="runway"/>);await fireEvent.press(screen.getByLabelText('播放runway发音'));expect(screen.getByText('发音暂不可用，请重试')).toBeTruthy();});
